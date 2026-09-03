/**
 * 服务端规则的运行时镜像，只负责 UI 展示/动画预览。
 * 所有扣费、奖励和合法性仍以服务端 command 结果为准。
 */
export const LAND = {
  TOTAL_PLOTS: 24,
  PLOTS_PER_ROW: 6,
  ROWS: 4,
  WATER_MAX: 100,
  FERT_MAX: 100,
  DRY_THRESHOLD: 30,
  FERT_FERTILIZED: 50,
  WATER_PER_USE: 20,
  WATER_COOLDOWN_MS: 600,
  DEVELOP_COST: 50,
  PLANT_ENERGY: 2,
};

export const FERT_AMOUNTS: Record<string, number> = {};
export let LEVEL_PLOTS: number[] = Array.from({ length: 24 }, (_, index) => index + 1);
export const LEVEL = { BASE_EXP: 100, EXP_GROWTH: 1.25, MAX_LEVEL: 24 };

export function applyLandRules(rule: any, shopItems: any[] = []): void {
  if (!rule || typeof rule !== 'object') return;
  assignNumber('TOTAL_PLOTS', rule.totalPlots, 1, 100);
  assignNumber('PLOTS_PER_ROW', rule.plotsPerRow, 1, 20);
  assignNumber('ROWS', rule.rows, 1, 20);
  assignNumber('WATER_MAX', rule.waterMax, 1, 10000);
  assignNumber('FERT_MAX', rule.fertilizerMax, 1, 10000);
  assignNumber('DRY_THRESHOLD', rule.dryThreshold, 0, LAND.WATER_MAX);
  assignNumber('FERT_FERTILIZED', rule.fertilizedThreshold, 0, LAND.FERT_MAX);
  assignNumber('WATER_PER_USE', rule.waterPerUse, 0, LAND.WATER_MAX);
  assignNumber('WATER_COOLDOWN_MS', rule.waterCooldownMs, 0, 60000);
  assignNumber('DEVELOP_COST', rule.developCost, 0, Number.MAX_SAFE_INTEGER);
  if (Array.isArray(rule.levelPlots) && rule.levelPlots.length) {
    LEVEL_PLOTS = rule.levelPlots.map((value: any) => Math.max(1, Math.floor(Number(value) || 1)));
  }
  if (rule.level) {
    LEVEL.BASE_EXP = positive(rule.level.baseExp, LEVEL.BASE_EXP);
    LEVEL.EXP_GROWTH = positive(rule.level.expGrowth, LEVEL.EXP_GROWTH);
    LEVEL.MAX_LEVEL = positive(rule.level.maxLevel, LEVEL.MAX_LEVEL);
  }
  Object.keys(FERT_AMOUNTS).forEach(key => delete FERT_AMOUNTS[key]);
  (Array.isArray(shopItems) ? shopItems : []).forEach(item => {
    if (item?.category === 'fert' && Number(item.effect) > 0) {
      FERT_AMOUNTS[String(item.icon || item.id)] = Number(item.effect);
    }
  });
}

function assignNumber(key: keyof typeof LAND, value: any, min: number, max: number): void {
  const number = Number(value);
  if (Number.isFinite(number)) (LAND[key] as number) = Math.min(max, Math.max(min, number));
}

function positive(value: any, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function fertAmountFor(icon: string): number {
  return FERT_AMOUNTS[icon] || 0;
}

export function plotsUnlockedAtLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return LEVEL_PLOTS[Math.min(lv, LEVEL_PLOTS.length) - 1] || 1;
}

export function newlyUnlockedAtLevel(level: number): number {
  return Math.max(0, plotsUnlockedAtLevel(level) - plotsUnlockedAtLevel(level - 1));
}

export function expForNextLevel(level: number): number {
  return Math.ceil(LEVEL.BASE_EXP * Math.pow(LEVEL.EXP_GROWTH, Math.max(0, level - 1)));
}

export function expTotalForLevel(level: number): number {
  let sum = 0;
  for (let current = 1; current < level; current++) sum += expForNextLevel(current);
  return sum;
}
