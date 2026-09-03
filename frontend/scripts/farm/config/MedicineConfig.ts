/** 药品目录（服务端下发）。UI 只用于显示名称/效果/持续时间。 */
export interface MedicineDef {
  id: string;
  name: string;
  itemId: string;
  target: 'pest' | 'disease';
  power: number;
  perMinute: boolean;
  duration: number;
  price: number;
}

export const MEDICINES: Record<string, MedicineDef> = {};

export function applyMedicineCatalog(rows: any[]): void {
  Object.keys(MEDICINES).forEach(key => delete MEDICINES[key]);
  (Array.isArray(rows) ? rows : [])
    .filter(row => row && typeof row.id === 'string')
    .forEach(row => {
      MEDICINES[String(row.id)] = {
        id: String(row.id),
        name: String(row.name || row.id),
        itemId: String(row.itemId || `med_${row.id}`),
        target: row.target === 'disease' ? 'disease' : 'pest',
        power: Number(row.power) || 0,
        perMinute: !!row.perMinute,
        duration: Number(row.duration) || 0,
        price: Number(row.price) || 0,
      };
    });
}

export function getMedicineDef(id: string): MedicineDef | undefined {
  return MEDICINES[id];
}

export function medicineName(id: string): string {
  return MEDICINES[id]?.name || id;
}
