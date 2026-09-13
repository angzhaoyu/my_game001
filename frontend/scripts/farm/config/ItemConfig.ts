import type { RemoteFertilizer as FertilizerDef, RemoteMedicine as MedicineDef } from '../../core/network/Contracts';
export type { RemoteFertilizer as FertilizerDef, RemoteMedicine as MedicineDef } from '../../core/network/Contracts';
/**
 * 运行时物品目录。数据由 /api/v1/game/bootstrap 下发；本文件不再生成测试背包。
 */
import type { ItemCategory, ItemDef, ShopDef } from '../data/ItemData';
export const ALL_ITEMS: ItemDef[] = [];
export const SEED_ITEMS: ItemDef[] = [];
export const FRUIT_ITEMS: ItemDef[] = [];
export const FERT_ITEMS: ItemDef[] = [];
export const MEDICINE_ITEMS: ItemDef[] = [];
export const SHOP_ITEMS: ShopDef[] = [];

const CATEGORIES: ItemCategory[] = ['seed', 'fruit', 'fert', 'medicine'];

export function applyItemCatalog(items: any[], shopItems: any[]): void {
  const clean = (Array.isArray(items) ? items : [])
    .filter(row => row && typeof row.id === 'string')
    .map(row => ({
      id: String(row.id),
      name: String(row.name || row.id),
      icon: String(row.icon || ''),
      category: (CATEGORIES.includes(row.category) ? row.category : 'fruit') as ItemCategory,
      value: Math.max(0, Number(row.value) || 0),
    })) as ItemDef[];
  ALL_ITEMS.splice(0, ALL_ITEMS.length, ...clean);
  SEED_ITEMS.splice(0, SEED_ITEMS.length, ...clean.filter(item => item.category === 'seed'));
  FRUIT_ITEMS.splice(0, FRUIT_ITEMS.length, ...clean.filter(item => item.category === 'fruit'));
  FERT_ITEMS.splice(0, FERT_ITEMS.length, ...clean.filter(item => item.category === 'fert'));
  MEDICINE_ITEMS.splice(0, MEDICINE_ITEMS.length, ...clean.filter(item => item.category === 'medicine'));

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

/** 保持目录对象引用不变：刷新时清除旧条目，重复 ID 以最后一条为准。 */
function replaceCatalog<T>(target: Record<string, T>, rows: any[], parse: (row: any) => T): void {
  Object.keys(target).forEach(key => delete target[key]);
  (Array.isArray(rows) ? rows : [])
    .filter(row => row && typeof row.id === 'string')
    .forEach(row => { target[String(row.id)] = parse(row); });
}

function consumable(row: any, prefix: string) {
  return {
    id: String(row.id), name: String(row.name || row.id),
    itemId: String(row.itemId || `${prefix}_${row.id}`),
    duration: Number(row.duration) || 0, price: Number(row.price) || 0,
  };
}

export const FERTILIZERS: Record<string, FertilizerDef> = {};
export const MEDICINES: Record<string, MedicineDef> = {};

export function applyFertilizerCatalog(rows: any[]): void {
  replaceCatalog(FERTILIZERS, rows, row => ({
    ...consumable(row, 'fert'),
    type: row.type === 'organic' ? 'organic' : 'inorganic',
    amount: Number(row.amount) || 0,
    perMinute: Number(row.perMinute) || 0,
    soilHealth: Number(row.soilHealth) || 0,
  }));
}

export function applyMedicineCatalog(rows: any[]): void {
  replaceCatalog(MEDICINES, rows, row => ({
    ...consumable(row, 'med'),
    target: row.target === 'disease' ? 'disease' : 'pest',
    power: Number(row.power) || 0,
    perMinute: !!row.perMinute,
  }));
}

export function getFertilizerDef(id: string): FertilizerDef | undefined {
  return FERTILIZERS[id];
}

export function getMedicineDef(id: string): MedicineDef | undefined {
  return MEDICINES[id];
}

export function fertilizerItemId(id: string): string {
  return FERTILIZERS[id]?.itemId || `fert_${id}`;
}

export function fertilizerName(id: string): string {
  return FERTILIZERS[id]?.name || id;
}

export function medicineName(id: string): string {
  return MEDICINES[id]?.name || id;
}
