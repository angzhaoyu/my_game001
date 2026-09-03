import { SessionStore } from '../auth/SessionStore';
import { gameApi, GameApi } from '../game/GameApi';
import { ApiError } from '../network/HttpClient';
import type { GameCommandType, GameSnapshot } from '../network/Contracts';
import { storage } from '../storage/Storage';

interface PendingCommand {
  id: string;
  userId: number;
  type: GameCommandType;
  payload: Record<string, unknown>;
  createdAt: number;
}

interface Waiter {
  resolve: (snapshot: GameSnapshot) => void;
  reject: (error: unknown) => void;
}

const QUEUE_KEY = 'farm.pending-commands.v2';
// 必须短于服务端 processed_commands 保留期（默认 7 天），防止过期幂等记录被重放。
const MAX_COMMAND_AGE_MS = 6 * 24 * 60 * 60 * 1000;

function uuid(): string {
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
  return `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * 保证经济命令串行、可重试、可跨重启恢复。
 * 命令发送前先落本地；后端以 commandId 幂等，因此“服务端成功但响应丢失”不会重复扣款。
 */
export class GameSyncService {
  private current: GameSnapshot | null = null;
  private queue: PendingCommand[] = [];
  private waiters = new Map<string, Waiter>();
  private draining: Promise<void> | null = null;
  private listeners: Array<(snapshot: GameSnapshot) => void> = [];
  private serverOffsetMs = 0;

  constructor(private readonly api: GameApi = gameApi) {
    const now = Date.now();
    this.queue = storage.get<PendingCommand[]>(QUEUE_KEY, []).filter(command =>
      command && typeof command.id === 'string' && now - Number(command.createdAt) < MAX_COMMAND_AGE_MS,
    );
    this.persistQueue();
    const root = globalThis as any;
    if (root.wx && typeof root.wx.onNetworkStatusChange === 'function') {
      root.wx.onNetworkStatusChange((status: any) => { if (status?.isConnected) void this.resume(); });
    } else if (typeof root.addEventListener === 'function') {
      root.addEventListener('online', () => { void this.resume(); });
    }
  }

  get snapshot(): GameSnapshot | null { return this.current; }
  get pendingCount(): number { return this.forCurrentUser().length; }
  serverNow(): number { return Date.now() + this.serverOffsetMs; }

  onSnapshot(listener: (snapshot: GameSnapshot) => void): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(item => item !== listener); };
  }

  restoreCached(): GameSnapshot | null {
    const cached = SessionStore.cachedSnapshot<GameSnapshot>();
    if (cached) this.accept(cached, false);
    return cached;
  }

  async bootstrap(): Promise<GameSnapshot> {
    const snapshot = await this.api.bootstrap();
    this.accept(snapshot, true);
    // 不阻塞首屏；历史未确认命令在背景中按顺序恢复。
    void this.resume();
    return snapshot;
  }

  execute(type: GameCommandType, payload: Record<string, unknown>): Promise<GameSnapshot> {
    const session = SessionStore.get();
    if (!session || !this.current) {
      return Promise.reject(new ApiError('NOT_READY', '游戏数据尚未加载', 0, true));
    }
    if (this.forCurrentUser().length >= 50) {
      return Promise.reject(new ApiError('QUEUE_FULL', '待同步操作过多，请恢复网络后重试', 0, true));
    }
    const command: PendingCommand = {
      id: uuid(),
      userId: session.user.id,
      type,
      payload,
      createdAt: Date.now(),
    };
    this.queue.push(command);
    this.persistQueue();
    const promise = new Promise<GameSnapshot>((resolve, reject) => {
      this.waiters.set(command.id, { resolve, reject });
    });
    void this.resume();
    return promise;
  }

  resume(): Promise<void> {
    if (this.draining) return this.draining;
    this.draining = this.drain().finally(() => { this.draining = null; });
    return this.draining;
  }

  private async drain(): Promise<void> {
    const session = SessionStore.get();
    if (!session || !this.current) return;

    while (true) {
      const command = this.queue.find(item => item.userId === session.user.id);
      if (!command) return;
      let conflicts = 0;
      try {
        while (true) {
          try {
            const result = await this.api.command(
              command.id, this.current.stateVersion, command.type, command.payload,
            );
            this.accept(result, true);
            this.remove(command.id);
            this.waiters.get(command.id)?.resolve(result);
            this.waiters.delete(command.id);
            break;
          } catch (error) {
            if (error instanceof ApiError && error.code === 'VERSION_CONFLICT' && conflicts < 2) {
              conflicts += 1;
              this.accept(await this.api.bootstrap(), true);
              continue;
            }
            throw error;
          }
        }
      } catch (error) {
        const retryable = error instanceof ApiError && error.retryable;
        if (!retryable) this.remove(command.id);
        this.waiters.get(command.id)?.reject(error);
        this.waiters.delete(command.id);
        if (retryable) {
          // 保留相同 commandId，网络恢复或小游戏回前台时继续。
          this.rejectPendingWaiters(error, session.user.id);
          return;
        }
      }
    }
  }

  private accept(next: GameSnapshot, persist: boolean): void {
    if (!next.catalog && this.current?.catalog) next.catalog = this.current.catalog;
    this.current = next;
    if (Number.isFinite(next.serverTimeMs)) this.serverOffsetMs = next.serverTimeMs - Date.now();
    if (persist) SessionStore.saveSnapshot(next);
    this.listeners.forEach(listener => listener(next));
  }

  private forCurrentUser(): PendingCommand[] {
    const userId = SessionStore.get()?.user.id;
    return userId ? this.queue.filter(item => item.userId === userId) : [];
  }

  private remove(commandId: string): void {
    this.queue = this.queue.filter(item => item.id !== commandId);
    this.persistQueue();
  }

  private persistQueue(): void {
    storage.set(QUEUE_KEY, this.queue.slice(-100));
  }

  private rejectPendingWaiters(error: unknown, userId: number): void {
    this.queue.filter(item => item.userId === userId).forEach(item => {
      this.waiters.get(item.id)?.reject(error);
      this.waiters.delete(item.id);
    });
  }
}

export const gameSync = new GameSyncService();
