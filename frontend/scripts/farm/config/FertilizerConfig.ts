/**
 * config/FertilizerConfig.ts —— 肥料表（`Fertilizer_Data.csv`，服务端 catalog.fertilizers 覆盖）
 *
 * 客户端只用它显示名称 / 类型 / 剩余时间 / 效果说明；实际加多少肥力由服务端结算。
 */
import { asNumber, asText, defineTable, derive, field, valueOf } from './Tables';
import type { Parser } from './Tables';

export type FertilizerType = 'inorganic' | 'organic';

export interface FertilizerDef {
  id: string;
  name: string;
  type: FertilizerType;
  amount: number;        // 无机：即时肥力；有机：总肥力
  perMinute: number;     // 有机：每分钟释放
  duration: number;      // 持续分钟
  soilHealth: number;
  price: number;
  note: string;          // 效果说明，施肥框 / 信息框直接显示
}

/** 注意先判「无机 / inorganic」，否则 inorganic 会被 organic 命中 */
const asType: Parser<FertilizerType> = raw => {
  const value = String(raw ?? '').trim().toLowerCase();
  if (/无机|inorganic/.test(value)) return 'inorganic';
  if (/有机|organic/.test(value)) return 'organic';
  return undefined;
};

const FERTILIZERS = defineTable<FertilizerDef>('Fertilizer_Data', {
  id: field(['ID', 'id'], asText, ''),
  name: field(['名称', '肥料名称', 'name'], asText, ''),
  type: field(['类型', 'type'], asType, 'inorganic'),
  amount: field(['肥力', 'amount'], asNumber, 0),
  // 表格没写「每分钟释放」时按 总量 / 持续分钟 推算（与服务端口径一致）
  perMinute: derive(['每分钟释放', 'perMinute'], (_raw, row) => {
    // 表里显式写了 0（无机肥）就用 0，没写才按 总量 / 持续分钟 推算
    const explicit = valueOf(row, '每分钟释放', 'perMinute');
    if (explicit !== undefined && Number.isFinite(Number(explicit))) return Number(explicit);
    const amount = Number(valueOf(row, '肥力', 'amount')) || 0;
    const duration = Number(valueOf(row, '持续分钟', 'duration')) || 0;
    return duration > 0 ? amount / duration : undefined;
  }, 0),
  duration: field(['持续分钟', '持续时间', 'duration'], asNumber, 0),
  soilHealth: field(['土壤健康', 'soilHealth'], asNumber, 0),
  price: field(['价格', 'price'], asNumber, 0),
  note: field(['说明', '效果说明', 'note'], asText, ''),
}, 'id');

export function allFertilizers(): FertilizerDef[] {
  return FERTILIZERS.all();
}

export function getFertilizerDef(id: string): FertilizerDef | undefined {
  return FERTILIZERS.get(id);
}

export function fertilizerName(id: string): string {
  return FERTILIZERS.get(id)?.name ?? id;
}

/** 物品 id（fert_urea）→ 肥料 id（urea） */
export function fertilizerIdOf(itemId: string): string {
  return itemId.replace(/^fert_/, '');
}

export function fertilizerTypeLabel(type: FertilizerType): string {
  return type === 'organic' ? '有机' : '无机';
}

/** 一行肥料的提示文字：信息框 / 施肥框共用，避免两处各拼一遍 */
export function fertilizerHint(def: FertilizerDef): string {
  return def.type === 'organic'
    ? `${fertilizerTypeLabel(def.type)} +${round(def.perMinute)}/分钟 ×${round(def.duration)}分钟`
    : `${fertilizerTypeLabel(def.type)} 即时 +${round(def.amount)}，有效 ${round(def.duration)}分钟`;
}

/** 服务端 catalog.fertilizers → 覆盖表格 */
export function applyFertilizerCatalog(rows: readonly unknown[] | undefined): void {
  FERTILIZERS.apply(rows);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
