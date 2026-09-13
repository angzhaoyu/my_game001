import type { RemoteCrop, RemotePlotEvent, RemoteActiveFertilizer, RemoteActiveMedicine, RemotePlot, RemoteWorld } from '../../core/network/Contracts';

/**
 * PlotData.ts —— 地块 / 作物「数据类型」（纯类型，不依赖引擎）
 * 与后端 app/domain/serialization.py 的 RemotePlot 一一对应。
 */

/** 土地显示态：normal 正常 / locked 未解锁 / dry 缺水 / lowfert 缺肥 */
export type LandState = 'normal' | 'locked' | 'dry' | 'lowfert';

/** 作物定义（来自服务端 catalog.crops） */
export type CropDef = RemoteCrop;

export type PlotEvent = RemotePlotEvent;

export type ActiveFertilizer = RemoteActiveFertilizer;

export type ActiveMedicine = RemoteActiveMedicine;

/** 单个地块的运行态（服务端快照投影） */
export type PlotData = RemotePlot;

export interface FarmSave {
  plots: PlotData[];
  lastTick: number;
}

/** 全局环境 */
export type WorldData = Omit<RemoteWorld, 'seed' | 'humidityModifier' | 'pestRisk' | 'diseaseRisk'>;

export function emptyPlot(id: number): PlotData {
  return {
    id,
    unlocked: false,
    fertility: 70,
    soilHealth: 70,
    moisture: 70,
    crop: null,
    stage: 0,
    stageGrowth: 0,
    plantAgeMinutes: 0,
    mature: false,
    quality: 60,
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
