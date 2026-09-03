/**
 * PlotData.ts —— 地块 / 作物「数据类型」（纯类型，不依赖引擎）
 */

/** 土地显示态：a普通 b未开发 c施肥 d缺水 */
export type LandState = 'a' | 'b' | 'c' | 'd';

/** 作物定义（来自 CropConfig） */
export interface CropDef {
  id: string;
  name: string;
  seedIcon: string;       // 刚种下时的贴图
  fruitIcon: string;      // 成熟收获时的贴图
  value: number;          // 收获金币价值
  duration: number;       // 良好生长下可收获的小时数（默认 12）
  optWater: [number, number];
  optFert: [number, number];
  stageIcons: string[];   // 生长阶段贴图（含种子态）
  boostWater: number;
  boostFert: number;
  boostHours: number;     // 0/12 点奖励减的小时数
  fertConsume: number;    // 每小时肥料消耗
  penaltyDry: number;
  penaltyOverWater: number;
  penaltyLowFert: number;
  penaltyOverFert: number;
}

/** 单个地块的运行态 */
export interface PlotData {
  /** 地块编号 1..24 */
  id: number;
  /** 是否已开发（true → 显示 a/c/d，可种植；false → 显示 b） */
  developed: boolean;
  /** 水分 0..100 */
  water: number;
  /** 肥料 0..100 */
  fert: number;
  /** 当前种植的作物 id，无则为 null */
  crop: string | null;
  /** 种植时间戳(ms) */
  plantedAt: number;
  /** 生长进度 0..1 */
  progress: number;
  /** 是否已可收获 */
  harvestable: boolean;
  /** 最近一次触发 0/12 点奖励的"小时键"，用于去重（YYYYMMDDHH） */
  lastBoostKey: string;
}

/** 农场整包存档 */
export interface FarmSave {
  plots: PlotData[];
  lastTick: number;       // 上次结算时间戳，用于离线补算
}
