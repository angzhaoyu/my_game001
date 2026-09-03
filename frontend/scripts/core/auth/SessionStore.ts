import { storage } from '../storage/Storage';

export interface SessionUser {
  id: number;
  username: string;
  region: string;
}

export interface Session {
  accessToken: string;
  expiresAtMs: number;
  user: SessionUser;
}

const SESSION_KEY = 'farm.session.v2';
const SNAPSHOT_KEY = 'farm.snapshot.v2';

class SessionStoreImpl {
  get(): Session | null {
    const session = storage.get<Session | null>(SESSION_KEY, null);
    if (!session || !session.accessToken || session.expiresAtMs <= Date.now()) return null;
    return session;
  }

  save(accessToken: string, expiresIn: number, user: SessionUser): Session {
    const session = { accessToken, expiresAtMs: Date.now() + Math.max(1, expiresIn) * 1000, user };
    storage.set(SESSION_KEY, session);
    return session;
  }

  clear(): void {
    storage.remove(SESSION_KEY);
    storage.remove(SNAPSHOT_KEY);
  }

  saveSnapshot(snapshot: unknown): void {
    storage.set(SNAPSHOT_KEY, snapshot);
  }

  cachedSnapshot<T>(): T | null {
    return storage.get<T | null>(SNAPSHOT_KEY, null);
  }
}

export const SessionStore = new SessionStoreImpl();
