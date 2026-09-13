/**
 * PlotData.ts —— 地块 / 作物「数据类型」（纯类型，不依赖引擎）
 * 与后端 app/domain/serialization.py 的 RemotePlot 一一对应。
 */

/**
 * 土地显示态：normal 正常 / locked 未解锁 / dry 缺水 / lowfert 缺肥。
 * 状态只用来换 `soil` 贴图（对应表 `Soil_Data`），不再挂 fx_dry / fx_lowfert 动画。
 */
export type LandState = 'normal' | 'locked' | 'dry' | 'lowfert';

/** 空地块的初始值来源：`Game_Rule` 表（缺省 70 点） */
export interface PlotInit {
  fertility: number;
  moisture: number;
  soilHealth: number;
  quality: number;
}

/** 作物定义（来自服务端 catalog.crops） */
export interface CropDef {
  id: string;
  name: string;
  kind: string;                    // 水果 / 作物 / 蔬菜
  seasons: string[];               // 适宜季节 id
  temp: [number, number];          // 适宜温度
  humidity: [number, number];      // Hmin, Hmax
  stageMinutes: [number, number, number];
  fertConsumption: number;         // 肥力消耗/分钟
  bestFertilizers: string[];       // (S1, S2, S3)
  targetFertility: number;
  basePrice: number;
  seedPrice: number;
  seedItemId: string;
  fruitItemId: string;
  seedIcon: string;
  fruitIcon: string;
  stageIcons: string[];            // 三个阶段贴图（作物 id + -01/-02/-03）
}

export interface PlotEvent {
  level: number;
  status: 'NONE' | 'ACTIVE';
  onsetAt: number | null;
}

export interface ActiveFertilizer {
  id: string;
  name: string;
  itemId: string;
  type: string;
  remainingMinutes: number;
  perMinute: number;
  best: boolean;
}

export interface ActiveMedicine {
  id: string;
  name: string;
  target: string;
  remainingMinutes: number;
  perMinute: boolean;
}

/** 单个地块的运行态（服务端快照投影） */
export interface PlotData {
  id: number;
  unlocked: boolean;
  fertility: number;
  soilHealth: number;
  moisture: number;
  crop: string | null;
  stage: number;                   // 1~3，0 表示空地
  stageGrowth: number;             // 0~100
  plantAgeMinutes: number;
  mature: boolean;
  quality: number;
  qualityGrade: string;
  qualityMultiplier: number;
  matureYield: number;
  harvestQuantity: number;
  pest: PlotEvent;
  disease: PlotEvent;
  activeFertilizers: ActiveFertilizer[];
  activeMedicines: ActiveMedicine[];
  bestFertilizerId: string;
  growthPerMinute: number;         // 仅用于进度条预览
  progress: number;                // 0~1 总进度
  lowMoisture: boolean;
  lowFertility: boolean;
  dailyPlantCount: number;
  dailyPlantLimit: number;
  dailyNetIncome: number;
  unlock: { price: number; minLevel: number } | null;
}

export interface FarmSave {
  plots: PlotData[];
  lastTick: number;
}

/** 全局环境 */
export interface WorldData {
  season: string;
  seasonName: string;
  weather: string;
  weatherName: string;
  temperature: number;
  dayIndex: number;
  minuteIndex: number;
  timestampMs: number;
}

export function emptyPlot(id: number, init?: Partial<PlotInit>): PlotData {
  return {
    id,
    unlocked: false,
    fertility: init?.fertility ?? 70,
    soilHealth: init?.soilHealth ?? 70,
    moisture: init?.moisture ?? 70,
    crop: null,
    stage: 0,
    stageGrowth: 0,
    plantAgeMinutes: 0,
    mature: false,
    quality: init?.quality ?? 60,
    qualityGrade: '普通',
    qualityMultiplier: 1,
    matureYield: 0,
    harvestQuantity: 0,
    pest: { level: 0, status: 'NONE', onsetAt: null },
    disease: { level: 0, status: 'NONE', onsetAt: null },
    activeFertilizers: [],
    activeMedicines: [],
    bestFertilizerId: '',
    growthPerMinute: 0,
    progress: 0,
    lowMoisture: false,
    lowFertility: false,
    dailyPlantCount: 0,
    dailyPlantLimit: 3,
    dailyNetIncome: 0,
    unlock: null,
  };
}
