/**
 * 构建时/启动时配置。不要把微信 AppSecret 放在客户端。
 *
 * 微信开发者工具可通过 wx.getExtConfigSync() 注入 apiBaseUrl；Web/Cocos 预览可在
 * 游戏脚本加载前设置 globalThis.__GAME_CONFIG__。
 */
export interface RuntimeConfig {
  apiBaseUrl: string;
  requestTimeoutMs: number;
  maxRetries: number;
}

function injectedConfig(): Partial<RuntimeConfig> {
  const root = globalThis as any;
  const direct = root.__GAME_CONFIG__ || {};
  const wx = root.wx;
  if (wx && typeof wx.getExtConfigSync === 'function') {
    try {
      return { ...direct, ...(wx.getExtConfigSync() || {}) };
    } catch (_) { /* 使用普通注入配置 */ }
  }
  return direct;
}

function defaultBaseUrl(): string {
  const root = globalThis as any;
  // Cocos Creator 的 PreviewInEditor 运行在 Electron/file 协议中，hostname 不是 localhost。
  // 只要不是微信小游戏环境，就默认连接本机后端，避免错误访问 api.example.com。
  if (!root.wx || typeof root.wx.request !== 'function') {
    return 'http://127.0.0.1:8000/api/v1';
  }
  // 微信真机/开发者工具上线前必须通过 ext 配置注入 HTTPS 合法域名。
  return 'https://api.example.com/api/v1';
}

const injected = injectedConfig();
export const RUNTIME: RuntimeConfig = {
  apiBaseUrl: String(injected.apiBaseUrl || defaultBaseUrl()).replace(/\/+$/, ''),
  requestTimeoutMs: Number(injected.requestTimeoutMs) || 8000,
  maxRetries: Math.max(0, Math.min(4, Number(injected.maxRetries) || 2)),
};

export function assertRuntimeConfig(): void {
  const wx = (globalThis as any).wx;
  if (wx && !/^https:\/\//.test(RUNTIME.apiBaseUrl)) {
    throw new Error('微信小游戏 API 地址必须使用 HTTPS');
  }
  if (RUNTIME.apiBaseUrl.includes('api.example.com')) {
    throw new Error('请在构建配置或微信 ext.json 中设置真实 apiBaseUrl');
  }
}
