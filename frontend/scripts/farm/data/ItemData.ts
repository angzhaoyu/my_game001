/**
 * ItemData.ts —— 物品相关的「数据类型」定义（纯类型，不依赖引擎）
 * 放这里的好处：逻辑层与 UI 层共享同一套类型，避免重复定义。
 */

/** 物品大类 */
export type ItemCategory = 'seed' | 'fruit' | 'fert' | 'pesticide';

/** 物品静态定义（来自配置，不可变） */
export interface ItemDef {
  id: string;        // 稳定 ID，如 "seed_tomato"
  name: string;      // 显示名
  icon: string;      // 图标资源名（Cocos 里指向 resources 下的 spriteFrame）
  category: ItemCategory;
  value: number;     // 回收价（卖给商店时每个获得的金币）
  /** 品质等级名（仅果实有值），用于 BackpackItem 颜色渲染 */
  qualityGrade?: string;
  /** 品质倍率（仅果实有值） */
  qualityMultiplier?: number;
}

/** 商店在售定义（在 ItemDef 基础上多一个购买价） */
export interface ShopDef extends ItemDef {
  price: number;     // 购买价
}

/** 背包里的一堆同类物品（运行时可变） */
export interface InventoryStack extends ItemDef {
  count: number;     // 数量
  acquired: number;  // 获得时间戳（用于时间排序）
}

/** 分类中文名 */
export const CATEGORY_LABEL: Record<ItemCategory | 'all', string> = {
  all: '全部',
  seed: '种子',
  fruit: '果实',
  fert: '化肥',
  pesticide: '药剂',
};

/** 品质等级颜色映射（与 quality_grades.csv 对应） */
export const QUALITY_GRADE_COLORS: Record<string, { r: number; g: number; b: number }> = {
  '精品': { r: 255, g: 215, b: 0 },     // 金色
  '优良': { r: 100, g: 200, b: 100 },   // 绿色
  '普通': { r: 200, g: 200, b: 200 },   // 灰白
  '合格': { r: 150, g: 150, b: 200 },   // 淡蓝
  '不合格': { r: 200, g: 100, b: 100 }, // 淡红
};

/** 品质等级价格倍率（与 quality_grades.csv 对应） */
export const QUALITY_GRADE_MULTIPLIERS: Record<string, number> = {
  '精品': 1.20,
  '优良': 1.05,
  '普通': 1.00,
  '合格': 0.75,
  '不合格': 0.50,
};
