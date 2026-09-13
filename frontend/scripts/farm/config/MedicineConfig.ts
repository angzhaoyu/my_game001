/**
 * config/MedicineConfig.ts —— 药品表（`Medicine_Data.csv`，服务端 catalog.medicines 覆盖）
 */
import { asBoolean, asNumber, asText, defineTable, field } from './Tables';
import type { Parser } from './Tables';

export type MedicineTarget = 'pest' | 'disease';

export interface MedicineDef {
  id: string;
  name: string;
  target: MedicineTarget;
  power: number;           // 降低的等级点数
  perMinute: boolean;      // true = 每分钟持续降低
  duration: number;        // 持续分钟
  price: number;
  note: string;
}

const asTarget: Parser<MedicineTarget> = raw => {
  const value = String(raw ?? '').trim().toLowerCase();
  if (/病害|疾病|disease/.test(value)) return 'disease';
  if (/害虫|虫害|pest/.test(value)) return 'pest';
  return undefined;
};

const MEDICINES = defineTable<MedicineDef>('Medicine_Data', {
  id: field(['ID', 'id'], asText, ''),
  name: field(['名称', 'name'], asText, ''),
  target: field(['目标', 'target'], asTarget, 'pest'),
  power: field(['威力', 'power'], asNumber, 0),
  perMinute: field(['每分钟', 'perMinute'], asBoolean, false),
  duration: field(['持续分钟', '持续时间', 'duration'], asNumber, 0),
  price: field(['价格', 'price'], asNumber, 0),
  note: field(['说明', '效果说明', 'note'], asText, ''),
}, 'id');

export function allMedicines(): MedicineDef[] {
  return MEDICINES.all();
}

export function getMedicineDef(id: string): MedicineDef | undefined {
  return MEDICINES.get(id);
}

export function medicineName(id: string): string {
  return MEDICINES.get(id)?.name ?? id;
}

/** 物品 id（med_urea…）→ 药品 id */
export function medicineIdOf(itemId: string): string {
  return itemId.replace(/^med_/, '');
}

export function medicineTargetLabel(target: MedicineTarget): string {
  return target === 'disease' ? '病害' : '害虫';
}

/** 服务端 catalog.medicines → 覆盖表格 */
export function applyMedicineCatalog(rows: readonly unknown[] | undefined): void {
  MEDICINES.apply(rows);
}
