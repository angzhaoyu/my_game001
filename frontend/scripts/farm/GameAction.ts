import type { GameCommandType } from '../core/network/Contracts';

/** UI 与后端玩法的唯一写操作入口；弱网、重试和保存由 GameSyncService 统一处理。 */
export interface GameActionFeedback {
  ok: boolean;
  message: string;
}

export type GameActionHandler = (
  type: GameCommandType,
  payload: Record<string, unknown>,
) => Promise<GameActionFeedback>;
