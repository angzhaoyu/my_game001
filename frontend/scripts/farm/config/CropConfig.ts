/**
 * config/CropConfig.ts —— 作物表（`Crop_Data.csv`，服务端 catalog.crops 到达后覆盖）
 *
 * 只描述「怎么显示」：阶段图名、进度分母、提示用的适宜区间。
 * 成长/品质/产量的真实计算在服务端，客户端只用快照里的 stageGrowth / growthPerMinute。
 */
import { asList, asNumber, asPair, asText, defineTable, derive, field, valueOf } from './Tables';
import type { RawRow } from './Tables';

export interface CropDef {
  id: string;
  name: string;
  kind: string;                      // 水果 / 作物 / 蔬菜
  seasons: string[];                 // 适宜季节 id
  temp: [number, number];            // 适宜温度
  humidity: [number, number];        // Hmin, Hmax
  stageMinutes: [number, number, number];
  fertConsumption: number;           // 肥力消耗/分钟
  bestFertilizers: string[];         // (S1, S2, S3)
  targetFertility: number;
  basePrice: number;
  seedPrice: number;
  stageIcons: string[];              // 三阶段图：{cropId}-01 / -02 / -03
}

const idOf = (row: RawRow): string => String(valueOf(row, 'ID', 'id') ?? '').trim();

/** 表里季节写中文（春 / 春夏 / 全年），服务端下发季节 id；两种写法都在这里归一 */
const SEASON_CHARS: Record<string, string> = { 春: 'spring', 夏: 'summer', 秋: 'autumn', 冬: 'winter' };
const SEASON_IDS = ['spring', 'summer', 'autumn', 'winter'];

const asSeasons = (_raw: unknown, row: RawRow): string[] | undefined => {
  const value = valueOf(row, '季节', 'seasons');
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  const text = String(value).trim();
  if (!text) return [];
  if (/全年|四季|all/i.test(text)) return SEASON_IDS;
  const chars = Array.from(text).map(char => SEASON_CHARS[char]).filter(Boolean);
  return chars.length ? chars : text.split(/[|/、,，]/).map(item => item.trim()).filter(Boolean);
};

/** S1分钟 / S2分钟 / S3分钟 三列，或服务端直接给的 stageMinutes 数组 */
const asStageMinutes = (_raw: unknown, row: RawRow): [number, number, number] | undefined => {
  const remote = valueOf(row, 'stageMinutes');
  if (Array.isArray(remote) && remote.length === 3) {
    return remote.map(value => Number(value) || 1) as [number, number, number];
  }
  const minutes = ['S1分钟', 'S2分钟', 'S3分钟'].map(key => Number(row[key]) || 0);
  return minutes.every(value => value > 0) ? (minutes as [number, number, number]) : undefined;
};

const CROPS = defineTable<CropDef>('Crop_Data', {
  id: field(['ID', 'id'], asText, ''),
  name: field(['名称', '中文', 'name'], asText, ''),
  kind: field(['类型', 'kind'], asText, ''),
  seasons: derive(['季节', 'seasons'], asSeasons, []),
  temp: field(['温度', '适宜温度', 'temp'], asPair, [15, 28]),
  humidity: field(['湿度', '适宜湿度', 'humidity'], asPair, [55, 75]),
  stageMinutes: derive(['stageMinutes', 'S1分钟', 'S2分钟', 'S3分钟'], asStageMinutes, [1, 2, 2]),
  fertConsumption: field(['肥力消耗', 'fertConsumption'], asNumber, 1),
  bestFertilizers: field(['最佳肥料', 'bestFertilizers'], asList, []),
  targetFertility: field(['目标肥力', 'targetFertility'], asNumber, 70),
  basePrice: field(['基础售价', '售价', 'basePrice'], asNumber, 0),
  seedPrice: field(['种子价', 'seedPrice'], asNumber, 0),
  stageIcons: derive(['stageIcons'], (_raw, row) => {
    const value = valueOf(row, 'stageIcons');
    if (Array.isArray(value) && value.length === 3) return value.map(String);
    const id = idOf(row);
    return id ? [`${id}-01`, `${id}-02`, `${id}-03`] : undefined;
  }, []),
}, 'id');

export function allCrops(): CropDef[] {
  return CROPS.all();
}

export function getCropDef(id: string | null): CropDef | undefined {
  return CROPS.get(id);
}

/** 服务端 catalog.crops → 覆盖表格 */
export function applyCropCatalog(rows: readonly unknown[] | undefined): void {
  CROPS.apply(rows);
}

/** 当前阶段（1~3）对应的最佳肥料 id */
export function bestFertilizerAtStage(crop: CropDef | undefined, stage: number): string {
  if (!crop || crop.bestFertilizers.length === 0) return '';
  const index = Math.min(Math.max(stage, 1), crop.bestFertilizers.length) - 1;
  return crop.bestFertilizers[index];
}
