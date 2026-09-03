import { SessionStore } from '../auth/SessionStore';
import { RUNTIME } from '../config/RuntimeConfig';
import type { ApiEnvelope, ApiErrorBody } from './Contracts';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  body?: unknown;
  authenticated?: boolean;
  /** POST 只有具备 commandId 等幂等键时才应开启。 */
  idempotent?: boolean;
  timeoutMs?: number;
}

interface RawResponse {
  status: number;
  body: any;
}

function requestId(): string {
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function parse(raw: any): any {
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class HttpClient {
  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, { ...options, idempotent: true });
  }

  async post<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }

  async request<T>(method: 'GET' | 'POST', path: string, options: RequestOptions = {}): Promise<T> {
    const canRetry = method === 'GET' || options.idempotent === true;
    const attempts = canRetry ? RUNTIME.maxRetries + 1 : 1;
    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const response = await this.raw(method, path, options);
        const envelope = response.body as ApiEnvelope<T> | null;
        if (response.status >= 200 && response.status < 300 && envelope?.success && envelope.data !== undefined) {
          return envelope.data;
        }
        const error: ApiErrorBody = envelope?.error || {
          code: response.status === 0 ? 'NETWORK_ERROR' : `HTTP_${response.status}`,
          message: response.status === 0
            ? `无法连接后端 ${RUNTIME.apiBaseUrl}，请确认游戏服务器已启动`
            : '服务器响应异常',
          retryable: response.status === 0 || response.status === 408 || response.status === 429 || response.status >= 500,
        };
        throw new ApiError(error.code, error.message, response.status, error.retryable, error.details || {});
      } catch (caught) {
        lastError = caught instanceof ApiError
          ? caught
          : new ApiError(
              'NETWORK_ERROR',
              `无法连接后端 ${RUNTIME.apiBaseUrl}，请确认游戏服务器已启动`,
              0,
              true,
            );
        if (lastError.status === 401) SessionStore.clear();
        // 版本冲突需要先 bootstrap，原请求原地重试没有意义，由 GameSyncService 处理。
        if (lastError.code === 'VERSION_CONFLICT') throw lastError;
        if (!canRetry || !lastError.retryable || attempt >= attempts - 1) throw lastError;
        // 指数退避 + 抖动，避免网络恢复时所有客户端同时重试。
        const delay = Math.min(3000, 300 * (2 ** attempt)) + Math.floor(Math.random() * 180);
        await sleep(delay);
      }
    }
    throw lastError || new ApiError('NETWORK_ERROR', '网络请求失败', 0, true);
  }

  private raw(method: 'GET' | 'POST', path: string, options: RequestOptions): Promise<RawResponse> {
    const url = `${RUNTIME.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId(),
    };
    if (options.authenticated !== false) {
      const token = SessionStore.get()?.accessToken;
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    const timeout = options.timeoutMs || RUNTIME.requestTimeoutMs;
    const wx = (globalThis as any).wx;

    if (wx && typeof wx.request === 'function') {
      return new Promise(resolve => {
        wx.request({
          url,
          method,
          data: options.body || {},
          header: headers,
          timeout,
          success: (response: any) => resolve({ status: response.statusCode || 0, body: parse(response.data) }),
          fail: () => resolve({ status: 0, body: null }),
        });
      });
    }

    return new Promise(resolve => {
      const XHR = (globalThis as any).XMLHttpRequest;
      if (!XHR) { resolve({ status: 0, body: null }); return; }
      const xhr = new XHR();
      xhr.open(method, url, true);
      xhr.timeout = timeout;
      Object.keys(headers).forEach(key => xhr.setRequestHeader(key, headers[key]));
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) resolve({ status: xhr.status || 0, body: parse(xhr.responseText) });
      };
      xhr.onerror = () => resolve({ status: 0, body: null });
      xhr.ontimeout = () => resolve({ status: 0, body: null });
      xhr.send(options.body === undefined ? undefined : JSON.stringify(options.body));
    });
  }
}

export const http = new HttpClient();
