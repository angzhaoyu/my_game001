/**
 * PesticideConfig.ts —— 药剂目录（服务端下发）。
 * 原 MedicineConfig 重命名。UI 只用于显示名称/效果/持续时间。
 * 新增 target='grass' 用于除草剂。
 */
export interface PesticideDef {
  id: string;
  name: string;
  itemId: string;
  target: 'pest' | 'disease' | 'grass';
  power: number;
  perMinute: boolean;
  duration: number;
  price: number;
}

export const PESTICIDES: Record<string, PesticideDef> = {};

export function applyPesticideCatalog(rows: any[]): void {
  Object.keys(PESTICIDES).forEach(key => delete PESTICIDES[key]);
  (Array.isArray(rows) ? rows : [])
    .filter(row => row && typeof row.id === 'string')
    .forEach(row => {
      const target = row.target === 'disease' ? 'disease'
        : row.target === 'grass' ? 'grass'
        : 'pest';
      PESTICIDES[String(row.id)] = {
        id: String(row.id),
        name: String(row.name || row.id),
        itemId: String(row.itemId || `med_${row.id}`),
        target: target as 'pest' | 'disease' | 'grass',
        power: Number(row.power) || 0,
        perMinute: !!row.perMinute,
        duration: Number(row.duration) || 0,
        price: Number(row.price) || 0,
      };
    });
}

export function getPesticideDef(id: string): PesticideDef | undefined {
  return PESTICIDES[id];
}

export function pesticideName(id: string): string {
  return PESTICIDES[id]?.name || id;
}

// ---- 向后兼容别名 ----
/** @deprecated 使用 PesticideDef */
export type MedicineDef = PesticideDef;
/** @deprecated 使用 PESTICIDES */
export const MEDICINES = PESTICIDES;
/** @deprecated 使用 applyPesticideCatalog */
export const applyMedicineCatalog = applyPesticideCatalog;
/** @deprecated 使用 getPesticideDef */
export const getMedicineDef = getPesticideDef;
/** @deprecated 使用 pesticideName */
export const medicineName = pesticideName;
