import type { RemoteLandUnlockRow } from '../../core/network/Contracts';
/**
 * 服务端规则的运行时镜像，只负责 UI 展示/动画预览。
 * 所有扣费、奖励和合法性仍以服务端 command 结果为准。
 */
export type LandUnlockRow = RemoteLandUnlockRow;

export const LAND = {
  TOTAL_PLOTS: 24,
  PLOTS_PER_ROW: 6,
  ROWS: 4,
  INITIAL_UNLOCKED: 1,
  DAILY_PLANT_LIMIT: 3,
  WATER_PER_USE: 5,
  WATER_MAX_TIMES: 10,
  MOISTURE_MAX: 100,
  FERTILITY_MAX: 100,
  /** 自然失水：湿度/小时（雨天修正为负 → 反而补水） */
  MOISTURE_DRAIN_PER_HOUR: 6,
  /** 缺肥提示阈值：低于目标 10 点显示（Cocos 端可用 SoilInfoPanel/fertilityAlertGap 覆盖） */
  FERTILITY_ALERT_GAP: 10,
  /** 缺水提示阈值：低于作物湿度下限 10 点显示 */
  MOISTURE_ALERT_GAP: 10,
  DAILY_NET_INCOME_CAP: 100,
};

export let LAND_UNLOCK: LandUnlockRow[] = [];
export const LEVEL = { BASE_EXP: 100, EXP_GROWTH: 1.25, MAX_LEVEL: 24 };

export function applyLandRules(rule: any): void {
  if (!rule || typeof rule !== 'object') return;
  assignNumber('TOTAL_PLOTS', rule.totalPlots, 1, 100);
  assignNumber('PLOTS_PER_ROW', rule.plotsPerRow, 1, 20);
  assignNumber('ROWS', rule.rows, 1, 20);
  assignNumber('INITIAL_UNLOCKED', rule.initialUnlocked, 0, LAND.TOTAL_PLOTS);
  assignNumber('DAILY_PLANT_LIMIT', rule.dailyPlantLimit, 1, 99);
  assignNumber('WATER_PER_USE', rule.waterPerUse, 0, 100);
  assignNumber('WATER_MAX_TIMES', rule.waterMaxTimes, 1, 99);
  assignNumber('FERTILITY_ALERT_GAP', rule.fertilityAlertGap, 0, 100);
  assignNumber('MOISTURE_ALERT_GAP', rule.moistureAlertGap, 0, 100);
  assignNumber('DAILY_NET_INCOME_CAP', rule.dailyNetIncomeCap, 0, 1e9);
  assignNumber('MOISTURE_DRAIN_PER_HOUR', rule.moistureDrainPerHour, 0, 100);
  if (rule.level) {
    LEVEL.BASE_EXP = positive(rule.level.baseExp, LEVEL.BASE_EXP);
    LEVEL.EXP_GROWTH = positive(rule.level.expGrowth, LEVEL.EXP_GROWTH);
    LEVEL.MAX_LEVEL = positive(rule.level.maxLevel, LEVEL.MAX_LEVEL);
  }
  LAND_UNLOCK = (Array.isArray(rule.unlock) ? rule.unlock : [])
    .map((row: any) => ({
      index: Math.max(1, Math.floor(Number(row?.index) || 1)),
      price: Math.max(0, Math.floor(Number(row?.price) || 0)),
      minLevel: Math.max(1, Math.floor(Number(row?.minLevel) || 1)),
    }));
}

export function unlockRow(plotId: number): LandUnlockRow | null {
  return LAND_UNLOCK.find(row => row.index === plotId) || null;
}

function assignNumber(key: keyof typeof LAND, value: any, min: number, max: number): void {
  const number = Number(value);
  if (Number.isFinite(number)) (LAND[key] as number) = Math.min(max, Math.max(min, number));
}

function positive(value: any, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function expForNextLevel(level: number): number {
  return Math.ceil(LEVEL.BASE_EXP * Math.pow(LEVEL.EXP_GROWTH, Math.max(0, level - 1)));
}

export function expTotalForLevel(level: number): number {
  let sum = 0;
  for (let current = 1; current < level; current++) sum += expForNextLevel(current);
  return sum;
}
