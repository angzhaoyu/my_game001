/**
 * ItemData.ts —— 物品相关的「数据类型」定义（纯类型，不依赖引擎）
 * 放这里的好处：逻辑层与 UI 层共享同一套类型，避免重复定义。
 */

/** 物品大类 */
export type ItemCategory = 'seed' | 'fruit' | 'fert';

/** 物品静态定义（来自配置，不可变） */
export interface ItemDef {
  id: string;        // 稳定 ID，如 "seed_0"
  name: string;      // 显示名
  icon: string;      // 图标资源名（Cocos 里指向 resources 下的 spriteFrame；网页用 emoji）
  category: ItemCategory;
  value: number;     // 回收价（卖给商店时每个获得的金币）
}

/** 商店在售定义（在 ItemDef 基础上多一个购买价） */
export interface ShopDef extends ItemDef {
  price: number;     // 购买价（= value * 倍率）
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
};
