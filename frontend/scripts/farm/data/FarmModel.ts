/**
 * FarmModel.ts —— 农场「显示层」（纯逻辑，不依赖引擎，可单测）
 *
 * 这是服务端农场快照的只读投影：负责显示态和两次快照间的**视觉插值**。
 * 播种/浇水/施肥/收获必须发送服务端命令，本模型不提供资产修改入口。
 */
import { LAND } from '../config/LandConfig';
import { getCropDef } from '../config/CropConfig';
import { emptyPlot } from './PlotData';
import type { FarmSave, LandState, PlotData } from './PlotData';

const MINUTE_MS = 60_000;

export class FarmModel {
  plots: PlotData[] = [];
  lastTick: number = Date.now();
  /** 上次快照的时间，用于插值；服务端权威，插值只影响观感 */
  private previewAt: number = Date.now();

  constructor() {
    this.reset();
  }

  reset() {
    this.plots = [];
    for (let i = 1; i <= LAND.TOTAL_PLOTS; i++) this.plots.push(emptyPlot(i));
    this.lastTick = Date.now();
    this.previewAt = Date.now();
  }

  // ---------------- 查询 ----------------

  getPlot(id: number): PlotData | undefined {
    return this.plots.find(plot => plot.id === id);
  }

  /** 土地显示态：未解锁 > 缺水 > 缺肥 > 正常 */
  landState(plot: PlotData): LandState {
    if (!plot.unlocked) return 'locked';
    if (plot.lowMoisture) return 'dry';
    if (plot.lowFertility) return 'lowfert';
    return 'normal';
  }

  /** 当前阶段索引 0..2（用于选择三张阶段图） */
  growthStage(plot: PlotData): number {
    if (!plot.crop) return -1;
    return Math.min(2, Math.max(0, plot.stage - 1));
  }

  /** 总进度 0..1（三段各 100） */
  totalProgress(plot: PlotData): number {
    if (!plot.crop) return 0;
    return Math.min(1, (Math.max(0, plot.stage - 1) * 100 + plot.stageGrowth) / 300);
  }

  /** 当前阶段进度 0..1（进度条填充） */
  stageProgress(plot: PlotData): number {
    if (!plot.crop) return 0;
    if (plot.mature) return 1;
    return Math.min(1, Math.max(0, plot.stageGrowth / 100));
  }

  hasPest(plot: PlotData): boolean {
    return plot.pest.status === 'ACTIVE' && plot.pest.level > 0;
  }

  hasDisease(plot: PlotData): boolean {
    return plot.disease.status === 'ACTIVE' && plot.disease.level > 0;
  }

  /** 湿度区间（作物 Hmin/Hmax），无作物时为 null */
  moistureRange(plot: PlotData): [number, number] | null {
    const crop = getCropDef(plot.crop);
    return crop ? crop.humidity : null;
  }

  /** 肥力目标区间：目标 ±10（与服务端 fertilityAlertGap 一致） */
  fertilityRange(plot: PlotData): [number, number] | null {
    const crop = getCropDef(plot.crop);
    if (!crop) return null;
    const gap = LAND.FERTILITY_ALERT_GAP;
    return [Math.max(0, crop.targetFertility - gap), Math.min(100, crop.targetFertility + gap)];
  }

  // ---------------- 视觉插值 ----------------

  /**
   * 用服务端给出的 growthPerMinute 在两次快照之间平滑推进进度条。
   * 真实成长仍以服务端分钟结算为准；这里只影响观感，不会上传任何数据。
   */
  updateModel(nowMs: number) {
    if (!Number.isFinite(nowMs)) nowMs = Date.now();
    const minutes = (nowMs - this.previewAt) / MINUTE_MS;
    if (minutes <= 0) return;
    this.previewAt = nowMs;
    const drain = (LAND.MOISTURE_DRAIN_PER_HOUR * this.humidityModifier) / 60 * minutes;

    for (const plot of this.plots) {
      if (!plot.unlocked) continue;
      plot.moisture = Math.max(0, Math.min(100, plot.moisture - drain));
      if (!plot.crop || plot.mature) continue;
      plot.plantAgeMinutes += minutes;
      plot.stageGrowth += plot.growthPerMinute * minutes;
      while (plot.stageGrowth >= 100 && plot.stage < 3) {
        plot.stageGrowth -= 100;
        plot.stage += 1;
      }
      if (plot.stage >= 3 && plot.stageGrowth >= 100) {
        plot.stageGrowth = 100;
        plot.mature = true;   // 乐观显示成熟动画；收获仍由服务端校验
      }
    }
  }

  private humidityModifier = 1;

  /** 由 GameRoot 在快照到达时同步（用于湿度插值） */
  setHumidityModifier(value: number): void {
    this.humidityModifier = Number.isFinite(value) ? value : 1;
  }

  // ---------------- 服务端快照装载 ----------------

  loadJSON(data: FarmSave | null) {
    if (!data || !Array.isArray(data.plots)) {
      this.reset();
      return;
    }
    this.plots = [];
    for (let i = 1; i <= LAND.TOTAL_PLOTS; i++) {
      const src = data.plots.find(plot => plot.id === i);
      this.plots.push(src ? normalizePlot(i, src) : emptyPlot(i));
    }
    this.lastTick = typeof data.lastTick === 'number' ? data.lastTick : Date.now();
    this.previewAt = Date.now();
  }
}

/**
 * 兼容校验：老版本缓存快照（或字段缺失）不能让 UI 崩溃，
 * 缺字段一律用空地块补齐，等下一次真正的服务端快照覆盖。
 */
function normalizePlot(id: number, src: Partial<PlotData>): PlotData {
  const base = emptyPlot(id);
  if (typeof src.unlocked !== 'boolean' || !src.pest || !src.disease) return { ...base, id };
  return {
    ...base,
    ...src,
    id,
    pest: { ...base.pest, ...(src.pest || {}) },
    disease: { ...base.disease, ...(src.disease || {}) },
    grass: { ...base.grass, ...(src.grass || {}) },
    activeFertilizers: Array.isArray(src.activeFertilizers) ? src.activeFertilizers : [],
    activeMedicines: Array.isArray(src.activeMedicines) ? src.activeMedicines : [],
  };
}
