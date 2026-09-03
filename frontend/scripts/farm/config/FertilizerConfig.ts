/** 肥料目录（服务端下发）。UI 只用于显示名称/持续时间/每分钟释放量。 */
export interface FertilizerDef {
  id: string;
  name: string;
  itemId: string;
  type: 'inorganic' | 'organic';
  amount: number;        // 无机：即时肥力；有机：总量
  perMinute: number;     // 有机每分钟释放
  duration: number;      // 持续分钟
  soilHealth: number;
  price: number;
}

export const FERTILIZERS: Record<string, FertilizerDef> = {};

export function applyFertilizerCatalog(rows: any[]): void {
  Object.keys(FERTILIZERS).forEach(key => delete FERTILIZERS[key]);
  (Array.isArray(rows) ? rows : [])
    .filter(row => row && typeof row.id === 'string')
    .forEach(row => {
      FERTILIZERS[String(row.id)] = {
        id: String(row.id),
        name: String(row.name || row.id),
        itemId: String(row.itemId || `fert_${row.id}`),
        type: row.type === 'organic' ? 'organic' : 'inorganic',
        amount: Number(row.amount) || 0,
        perMinute: Number(row.perMinute) || 0,
        duration: Number(row.duration) || 0,
        soilHealth: Number(row.soilHealth) || 0,
        price: Number(row.price) || 0,
      };
    });
}

export function getFertilizerDef(id: string): FertilizerDef | undefined {
  return FERTILIZERS[id];
}

/** 肥料 id（urea）→ 物品 id（fert_urea） */
export function fertilizerItemId(id: string): string {
  return FERTILIZERS[id]?.itemId || `fert_${id}`;
}

export function fertilizerName(id: string): string {
  return FERTILIZERS[id]?.name || id;
}
