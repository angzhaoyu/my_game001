/**
 * config/LandConfig.ts —— 土地与全局数值（表 `Game_Rule` / `Land_Data` / `Soil_Data` / `Quality_Data`）
 *
 * 代码里不再写死数值：`LAND.*` 是 `Game_Rule` 的读取器，解锁价与等级门槛读 `Land_Data`，
 * 土块贴图与判定读 `Soil_Data`。服务端 catalog 到达后覆盖同一张表，服务端始终权威。
 */
import { asNumber, asText, defineTable, field } from './Tables';
import type { Parser, RawRow } from './Tables';
import type { LandState } from '../data/PlotData';

export interface LandUnlockRow {
  id: string;
  price: number;
  minLevel: number;
}

/** 一行土块状态定义：状态 → soil 贴图（缺水 / 缺肥已改为换图，不再做 fx 动画） */
export interface SoilStyle {
  state: LandState;
  /** 显示名（土壤信息框的「土地状态」直接用） */
  name: string;
  suffix: string;
  path: string;
  rule: string;
}

export interface QualityGrade {
  id: string;
  min: number;
  max: number;
  name: string;
  multiplier: number;
}

const SOIL_STATES: LandState[] = ['normal', 'locked', 'lowfert', 'dry'];
const SOIL_PATH_FALLBACK = 'farm/lands_{state}1/locked_{col}{state}/spriteFrame';

/** 只有表里出现的状态才算数，写错状态名时回落到正常土块而不是显示成黑块 */
const asLandState: Parser<LandState> = raw => {
  const value = String(raw ?? '').trim();
  return (SOIL_STATES as string[]).includes(value) ? value as LandState : undefined;
};

const RULES = defineTable<{ id: string; value: number; note: string }>('Game_Rule', {
  id: field(['参数', 'key'], asText, ''),
  value: field(['值', 'value'], asNumber, 0),
  note: field(['说明', 'note'], asText, ''),
}, 'id');

const UNLOCKS = defineTable<LandUnlockRow>('Land_Data', {
  id: field(['ID', 'index'], asText, ''),
  price: field(['解锁金币', 'price'], asNumber, 0),
  minLevel: field(['解锁等级', 'minLevel'], asNumber, 1),
}, 'id');

const SOILS = defineTable<SoilStyle>('Soil_Data', {
  state: field(['状态', 'state'], asLandState, 'normal'),
  name: field(['名称', 'name'], asText, '正常'),
  suffix: field(['后缀', 'suffix'], asText, 'a'),
  path: field(['贴图', 'path'], asText, SOIL_PATH_FALLBACK),
  rule: field(['判定', 'rule'], asText, ''),
}, 'state');

const GRADES = defineTable<QualityGrade>('Quality_Data', {
  id: field(['档位', 'name'], asText, ''),
  min: field(['下限', 'min'], asNumber, 0),
  max: field(['上限', 'max'], asNumber, 100),
  name: field(['档位', 'name'], asText, ''),
  multiplier: field(['倍率', 'multiplier'], asNumber, 1),
}, 'id');

/** 表没加载时的兜底值：离线 / 缺 CSV 时 UI 仍按 v1.10 基准显示 */
const DEFAULTS: Record<string, number> = {
  totalPlots: 24, plotsPerRow: 6, rows: 4,
  initialFertility: 70, initialSoilHealth: 70, initialMoisture: 70,
  dailyPlantLimit: 3, waterPerUse: 5, waterMaxTimes: 10, moistureDrainPerHour: 6,
  soilAlertGap: 15, baseYield: 10, initialQuality: 60, stageBaseDivisor: 1.2,
  baseExp: 100, expGrowth: 1.25, maxLevel: 24,
};

function rule(key: string, min = -Infinity): number {
  const value = RULES.get(key)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, value) : DEFAULTS[key] ?? min;
}

/** 全局数值读取器：属性访问即取当前表值，服务端覆盖后自动跟随 */
export const LAND = {
  get TOTAL_PLOTS() { return rule('totalPlots', 1); },
  get PLOTS_PER_ROW() { return rule('plotsPerRow', 1); },
  get ROWS() { return rule('rows', 1); },
  get INITIAL_FERTILITY() { return rule('initialFertility', 0); },
  get INITIAL_SOIL_HEALTH() { return rule('initialSoilHealth', 0); },
  get INITIAL_MOISTURE() { return rule('initialMoisture', 0); },
  get DAILY_PLANT_LIMIT() { return rule('dailyPlantLimit', 1); },
  get WATER_PER_USE() { return rule('waterPerUse', 0); },
  get WATER_MAX_TIMES() { return rule('waterMaxTimes', 1); },
  get MOISTURE_DRAIN_PER_HOUR() { return rule('moistureDrainPerHour', 0); },
  /** 土块换图阈值：湿度 / 肥力低于作物需求这么多点时才显示缺水 / 缺肥 */
  get SOIL_ALERT_GAP() { return rule('soilAlertGap', 0); },
  get BASE_YIELD() { return rule('baseYield', 1); },
  get INITIAL_QUALITY() { return rule('initialQuality', 0); },
  get STAGE_BASE_DIVISOR() { return rule('stageBaseDivisor', 1); },
  get BASE_EXP() { return rule('baseExp', 1); },
  get EXP_GROWTH() { return rule('expGrowth', 1); },
  get MAX_LEVEL() { return rule('maxLevel', 1); },
};

export function unlockRow(plotId: number): LandUnlockRow | null {
  return UNLOCKS.get(String(plotId)) ?? null;
}

/** 取某个土地状态对应的 soil 贴图行 */
export function soilStyle(state: LandState): SoilStyle {
  return SOILS.get(state) ?? { state: 'normal', name: '正常', suffix: 'a', path: SOIL_PATH_FALLBACK, rule: '' };
}

export function qualityGrades(): QualityGrade[] {
  return GRADES.all();
}

/** 品质分数 → 档位名 / 倍率（服务端快照已带档位时优先用服务端值） */
export function qualityGrade(score: number): QualityGrade | undefined {
  return GRADES.all().find(grade => grade.min <= score && score <= grade.max);
}

/** 服务端 catalog.qualityGrades → 覆盖品质档位 */
export function applyQualityGrades(rows: readonly unknown[] | undefined): void {
  GRADES.apply(rows);
}

/** 服务端 catalog.land / catalog.growth → 覆盖表格（扣费与奖励仍以服务端为准） */
export function applyLandRules(land?: object, growth?: object): void {
  if (land) UNLOCKS.apply(asRows((land as RawRow).unlock));
  const rows = [...flattenRule(land), ...flattenRule(growth)];
  if (rows.length) RULES.apply(rows);
}

function asRows(value: unknown): RawRow[] | undefined {
  return Array.isArray(value) ? value as RawRow[] : undefined;
}

/** 把 `{ totalPlots: 24, level: { baseExp: 100 } }` 展平成 `{ 参数, 值 }` 行 */
function flattenRule(source: object | undefined): RawRow[] {
  if (!source || typeof source !== 'object') return [];
  return Object.entries(source).flatMap(([key, value]) => {
    if (key === 'unlock') return [];   // unlock 单独进 Land_Data 表
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value as RawRow).map(([inner, innerValue]) => ({ 参数: inner, 值: innerValue }));
    }
    return [{ 参数: key, 值: value }];
  });
}

export function expForNextLevel(level: number): number {
  return Math.ceil(LAND.BASE_EXP * Math.pow(LAND.EXP_GROWTH, Math.max(0, level - 1)));
}
