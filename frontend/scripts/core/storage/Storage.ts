export interface KeyValueStorage {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

class PlatformStorage implements KeyValueStorage {
  get<T>(key: string, fallback: T): T {
    try {
      const wx = (globalThis as any).wx;
      const raw = wx && typeof wx.getStorageSync === 'function'
        ? wx.getStorageSync(key)
        : (globalThis as any).localStorage?.getItem(key);
      if (raw === '' || raw === null || raw === undefined) return fallback;
      return typeof raw === 'string' ? JSON.parse(raw) as T : raw as T;
    } catch (_) {
      return fallback;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      const raw = JSON.stringify(value);
      const wx = (globalThis as any).wx;
      if (wx && typeof wx.setStorageSync === 'function') wx.setStorageSync(key, raw);
      else (globalThis as any).localStorage?.setItem(key, raw);
    } catch (error) {
      console.warn('[Storage] 保存失败', error);
    }
  }

  remove(key: string): void {
    try {
      const wx = (globalThis as any).wx;
      if (wx && typeof wx.removeStorageSync === 'function') wx.removeStorageSync(key);
      else (globalThis as any).localStorage?.removeItem(key);
    } catch (_) { /* ignore */ }
  }
}

export const storage: KeyValueStorage = new PlatformStorage();
