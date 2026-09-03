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
  | 'unlock_land'
  | 'plant'
  | 'water'
  | 'fertilize'
  | 'apply_medicine'
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

export type RemoteItemCategory = 'seed' | 'fruit' | 'fert' | 'medicine';

export interface RemoteItem {
  id: string;
  name: string;
  icon: string;
  category: RemoteItemCategory;
  value: number;
  price?: number | null;
  count?: number;
  acquired?: number;
  effect?: number;
}

/** 服务端下发的作物定义（数值系统 v1.10） */
export interface RemoteCrop {
  id: string;
  name: string;
  kind: string;
  seasons: string[];
  temp: [number, number];
  humidity: [number, number];
  stageMinutes: [number, number, number];
  fertConsumption: number;
  bestFertilizers: string[];
  targetFertility: number;
  basePrice: number;
  seedPrice: number;
  seedItemId: string;
  fruitItemId: string;
  seedIcon: string;
  fruitIcon: string;
  stageIcons: string[];
}

export interface RemoteFertilizer {
  id: string;
  name: string;
  itemId: string;
  type: 'inorganic' | 'organic';
  amount: number;
  perMinute: number;
  duration: number;
  soilHealth: number;
  price: number;
}

export interface RemoteMedicine {
  id: string;
  name: string;
  itemId: string;
  target: 'pest' | 'disease';
  power: number;
  perMinute: boolean;
  duration: number;
  price: number;
}

export interface RemoteLandUnlockRow {
  index: number;
  price: number;
  minLevel: number;
}

export interface RemoteLandRules {
  totalPlots: number;
  plotsPerRow: number;
  rows: number;
  initialUnlocked: number;
  initialFertility: number;
  initialSoilHealth: number;
  initialMoisture: number;
  unlock: RemoteLandUnlockRow[];
  dailyPlantLimit: number;
  waterPerUse: number;
  waterMaxTimes: number;
  moistureDrainPerHour: number;
  dailyNetIncomeCap: number;
  fertilityAlertGap: number;
  moistureAlertGap: number;
  level: { baseExp: number; expGrowth: number; maxLevel: number };
}

export interface RemoteGrowthRules {
  minuteMs: number;
  stageBaseDivisor: number;
  minGrowthMultiplier: number;
  minEnvironmentMultiplier: number;
  minFertilityHighMultiplier: number;
  baseYield: number;
  initialQuality: number;
  qualityWindowMinutes: number;
  baseQualityGainPerMinute: number;
  bestFertilizerMultiplier: number;
  bestFertilizerQualityGain: number;
  temperaturePenaltyPerDegree: number;
  humidityPenaltyPerPoint: number;
  fertilityTargetBand: number;
  fertilityHighPenaltyFactor: number;
  temperatureQualityPenalty: { perDegree: number; max: number };
  humidityQualityPenalty: { perPoint: number; max: number };
  fertilityQualityPenalty: number;
  onsetQualityDamage: number;
  pestQualityDamagePerMinute: number;
  diseaseQualityDamagePerMinute: number;
  pestYieldPenalty: number;
  diseaseYieldPenalty: number;
  minYieldMultiplier: number;
  harvestSoilHealthCost: number;
  pestBaseChance: number;
  diseaseBaseChance: number;
  maxAppearChance: number;
  initialCoins: number;
}

export interface RemoteSeason {
  id: string;
  name: string;
  temp: [number, number];
}

export interface RemoteWeatherDef {
  id: string;
  name: string;
  tempModifier: number;
  humidityModifier: number;
  pestRisk: number;
  diseaseRisk: number;
}

export interface RemoteCatalog {
  version: string;
  regions: string[];
  items: RemoteItem[];
  shopItems: RemoteItem[];
  crops: RemoteCrop[];
  fertilizers: RemoteFertilizer[];
  medicines: RemoteMedicine[];
  land: RemoteLandRules;
  growth: RemoteGrowthRules;
  seasons: RemoteSeason[];
  weather: { definitions: Record<string, RemoteWeatherDef>; weights: Record<string, [string, number][]> };
  qualityGrades: { min: number; max: number; name: string; multiplier: number }[];
}

/** 单块土地的完整运行态（服务端权威快照） */
export interface RemotePlotEvent {
  level: number;
  status: 'NONE' | 'ACTIVE';
  onsetAt: number | null;
}

export interface RemoteActiveFertilizer {
  id: string;
  name: string;
  itemId: string;
  type: string;
  remainingMinutes: number;
  perMinute: number;
  best: boolean;
}

export interface RemoteActiveMedicine {
  id: string;
  name: string;
  target: string;
  remainingMinutes: number;
  perMinute: boolean;
}

export interface RemotePlot {
  id: number;
  unlocked: boolean;
  fertility: number;
  soilHealth: number;
  moisture: number;
  crop: string | null;
  stage: number;
  stageGrowth: number;
  plantAgeMinutes: number;
  mature: boolean;
  quality: number;
  qualityGrade: string;
  qualityMultiplier: number;
  matureYield: number;
  harvestQuantity: number;
  pest: RemotePlotEvent;
  disease: RemotePlotEvent;
  activeFertilizers: RemoteActiveFertilizer[];
  activeMedicines: RemoteActiveMedicine[];
  bestFertilizerId: string;
  growthPerMinute: number;
  progress: number;
  lowMoisture: boolean;
  lowFertility: boolean;
  dailyPlantCount: number;
  dailyPlantLimit: number;
  dailyNetIncome: number;
  unlock: { price: number; minLevel: number } | null;
}

/** 全局环境（季节 / 天气 / 温度），由服务端按现实时间确定性给出 */
export interface RemoteWorld {
  seed: string;
  timestampMs: number;
  minuteIndex: number;
  dayIndex: number;
  season: string;
  seasonName: string;
  weather: string;
  weatherName: string;
  temperature: number;
  humidityModifier: number;
  pestRisk: number;
  diseaseRisk: number;
}

export interface RemoteDailyEconomy {
  dayIndex: number;
  seedCost: number;
  fertilizerCost: number;
  medicineCost: number;
  landUnlockCost: number;
  grossIncome: number;
  netIncome: number;
  plantCount: number;
  harvestCount: number;
}

export interface GameSnapshot {
  serverTimeMs: number;
  stateVersion: number;
  profile: RemoteProfile;
  inventory: RemoteItem[];
  plots: RemotePlot[];
  world: RemoteWorld;
  daily: RemoteDailyEconomy;
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
