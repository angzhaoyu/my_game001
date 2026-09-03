/**
 * 运行时物品目录。数据由 /api/v1/game/bootstrap 下发；本文件不再生成测试背包。
 */
import type { ItemDef, ShopDef } from '../data/ItemData';
export const ALL_ITEMS: ItemDef[] = [];
export const SEED_ITEMS: ItemDef[] = [];
export const FRUIT_ITEMS: ItemDef[] = [];
export const FERT_ITEMS: ItemDef[] = [];
export const SHOP_ITEMS: ShopDef[] = [];

export function applyItemCatalog(items: any[], shopItems: any[]): void {
  const clean = (Array.isArray(items) ? items : [])
    .filter(row => row && typeof row.id === 'string')
    .map(row => ({
      id: String(row.id),
      name: String(row.name || row.id),
      icon: String(row.icon || ''),
      category: row.category,
      value: Math.max(0, Number(row.value) || 0),
    })) as ItemDef[];
  ALL_ITEMS.splice(0, ALL_ITEMS.length, ...clean);
  SEED_ITEMS.splice(0, SEED_ITEMS.length, ...clean.filter(item => item.category === 'seed'));
  FRUIT_ITEMS.splice(0, FRUIT_ITEMS.length, ...clean.filter(item => item.category === 'fruit'));
  FERT_ITEMS.splice(0, FERT_ITEMS.length, ...clean.filter(item => item.category === 'fert'));

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
