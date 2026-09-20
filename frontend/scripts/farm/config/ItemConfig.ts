/**
 * 运行时物品目录。数据由 /api/v1/game/bootstrap 下发；本文件不再生成测试背包。
 */
import type { ItemCategory, ItemDef, ShopDef } from '../data/ItemData';
export const ALL_ITEMS: ItemDef[] = [];
export const SEED_ITEMS: ItemDef[] = [];
export const FRUIT_ITEMS: ItemDef[] = [];
export const FERT_ITEMS: ItemDef[] = [];
export const PESTICIDE_ITEMS: ItemDef[] = [];
export const SHOP_ITEMS: ShopDef[] = [];

const CATEGORIES: ItemCategory[] = ['seed', 'fruit', 'fert', 'pesticide'];

/** @deprecated 使用 PESTICIDE_ITEMS */
export const MEDICINE_ITEMS = PESTICIDE_ITEMS;

export function applyItemCatalog(items: any[], shopItems: any[]): void {
  const clean = (Array.isArray(items) ? items : [])
    .filter(row => row && typeof row.id === 'string')
    .map(row => {
      // 兼容旧数据：medicine → pesticide
      let cat = row.category;
      if (cat === 'medicine') cat = 'pesticide';
      return {
        id: String(row.id),
        name: String(row.name || row.id),
        icon: String(row.icon || ''),
        category: (CATEGORIES.includes(cat) ? cat : 'fruit') as ItemCategory,
        value: Math.max(0, Number(row.value) || 0),
        qualityGrade: row.qualityGrade ? String(row.qualityGrade) : undefined,
        qualityMultiplier: Number(row.qualityMultiplier) || undefined,
      };
    }) as ItemDef[];
  ALL_ITEMS.splice(0, ALL_ITEMS.length, ...clean);
  SEED_ITEMS.splice(0, SEED_ITEMS.length, ...clean.filter(item => item.category === 'seed'));
  FRUIT_ITEMS.splice(0, FRUIT_ITEMS.length, ...clean.filter(item => item.category === 'fruit'));
  FERT_ITEMS.splice(0, FERT_ITEMS.length, ...clean.filter(item => item.category === 'fert'));
  PESTICIDE_ITEMS.splice(0, PESTICIDE_ITEMS.length, ...clean.filter(item => item.category === 'pesticide'));

  const byId = new Map(clean.map(item => [item.id, item]));
  const shops: ShopDef[] = (Array.isArray(shopItems) ? shopItems : [])
    .map(row => {
      const item = byId.get(String(row?.id || ''));
      return item && Number.isFinite(Number(row.price))
        ? { ...item, price: Math.max(0, Number(row.price)) }
        : null;
    })
    .filter((row): row is ShopDef => !!row);
  SHOP_ITEMS.splice(0, SHOP_ITEMS.length, ...shops);
}

export function getItemDef(id: string): ItemDef | undefined {
  return ALL_ITEMS.find(item => item.id === id);
}
