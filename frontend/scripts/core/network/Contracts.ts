export interface ApiErrorBody {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface ApiEnvelope<T> {
  success: boolean;
  requestId: string;
  data?: T;
  error?: ApiErrorBody;
}

/**
 * 前后端玩法命令清单。新增普通玩法时，前端通常只需在这里增加命令名，
 * UI 继续调用 GameActionHandler；不要为每个玩法重新写 HTTP 请求。
 */
export type GameCommandType =
  | 'buy_item'
  | 'sell_item'
  | 'develop_plot'
  | 'plant'
  | 'water'
  | 'fertilize'
  | 'harvest'
  | 'shovel';

export interface RemoteProfile {
  id: number;
  username: string;
  region: string;
  coins: number;
  gold: number;
  diamonds: number;
  level: number;
  exp: number;
  energy: number;
  createdAt: number;
}

export interface RemoteItem {
  id: string;
  name: string;
  icon: string;
  category: 'seed' | 'fruit' | 'fert';
  value: number;
  price?: number | null;
  count?: number;
  acquired?: number;
  effect?: number;
}

export interface RemotePlot {
  id: number;
  developed: boolean;
  water: number;
  fert: number;
  crop: string | null;
  plantedAt: number;
  progress: number;
  harvestable: boolean;
  lastBoostKey: string;
}

export interface RemoteCatalog {
  version: string;
  regions: string[];
  items: RemoteItem[];
  shopItems: RemoteItem[];
  crops: any[];
  land: any;
  weather: any;
}

export interface GameSnapshot {
  serverTimeMs: number;
  stateVersion: number;
  profile: RemoteProfile;
  inventory: RemoteItem[];
  plots: RemotePlot[];
  lastTick: number;
  catalog?: RemoteCatalog;
  commandId?: string;
  message?: string;
}

export interface AuthResult {
  accessToken: string;
  expiresIn: number;
  user: { id: number; username: string; region: string };
}
