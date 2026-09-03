import { assertRuntimeConfig } from '../config/RuntimeConfig';
import { http } from '../network/HttpClient';
import type { AuthResult } from '../network/Contracts';
import { SessionStore } from './SessionStore';

export class AuthApi {
  async regions(): Promise<string[]> {
    const result = await http.get<{ regions: string[] }>('/public/config', { authenticated: false });
    return Array.isArray(result.regions) ? result.regions : [];
  }

  async loginWithWechat(): Promise<AuthResult> {
    assertRuntimeConfig();
    const wx = (globalThis as any).wx;
    if (!wx || typeof wx.login !== 'function') throw new Error('当前环境不支持微信登录');
    const code = await new Promise<string>((resolve, reject) => {
      wx.login({
        timeout: 7000,
        success: (response: any) => response?.code ? resolve(response.code) : reject(new Error('微信未返回登录凭证')),
        fail: (error: any) => reject(new Error(error?.errMsg || '微信登录失败')),
      });
    });
    const session = await http.post<AuthResult>('/auth/wechat', { code }, { authenticated: false });
    SessionStore.save(session.accessToken, session.expiresIn, session.user);
    return session;
  }

  async loginWithPassword(username: string, password: string, region: string): Promise<AuthResult> {
    const session = await http.post<AuthResult>(
      '/auth/password/login', { username, password, region }, { authenticated: false },
    );
    SessionStore.save(session.accessToken, session.expiresIn, session.user);
    return session;
  }

  async register(username: string, password: string, region: string): Promise<AuthResult> {
    return http.post<AuthResult>(
      '/auth/password/register', { username, password, region }, { authenticated: false },
    );
  }
}

export const authApi = new AuthApi();
