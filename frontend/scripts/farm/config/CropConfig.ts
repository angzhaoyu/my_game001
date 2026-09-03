/** 作物目录由服务端 bootstrap 下发；客户端仅用于显示和进度预览。 */
import type { CropDef } from '../data/PlotData';

export const PLANT_STAGE_ICONS = ['plant_1', 'plant_2', 'plant_3'];
export const CROPS: CropDef[] = [];

export function applyCropCatalog(rows: any[]): void {
  const crops: CropDef[] = (Array.isArray(rows) ? rows : [])
    .filter(row => row && typeof row.id === 'string')
    .map(row => ({
      id: String(row.id),
      name: String(row.name || row.id),
      seedIcon: String(row.seedIcon || `seed_${row.id}`),
      fruitIcon: String(row.fruitIcon || `fruit_${row.id}`),
      value: Math.max(0, Number(row.value) || 0),
      duration: Math.max(0.1, Number(row.duration) || 12),
      optWater: tuple(row.optWater, 55, 75),
      optFert: tuple(row.optFert, 40, 60),
      stageIcons: Array.isArray(row.stageIcons) && row.stageIcons.length
        ? row.stageIcons.map(String) : [String(row.seedIcon || ''), ...PLANT_STAGE_ICONS],
      boostWater: Number(row.boostWater) || 40,
      boostFert: Number(row.boostFert) || 30,
      boostHours: Number(row.boostHours) || 2,
      fertConsume: Number(row.fertConsume) || 0.7,
      penaltyDry: Number(row.penaltyDry) || 0.03,
      penaltyOverWater: Number(row.penaltyOverWater) || 0.015,
      penaltyLowFert: Number(row.penaltyLowFert) || 0.02,
      penaltyOverFert: Number(row.penaltyOverFert) || 0.018,
    }));
  CROPS.splice(0, CROPS.length, ...crops);
}

function tuple(value: any, first: number, second: number): [number, number] {
  return Array.isArray(value) && value.length >= 2
    ? [Number(value[0]) || first, Number(value[1]) || second]
    : [first, second];
}

export function getCropDef(id: string): CropDef | undefined {
  return CROPS.find(crop => crop.id === id);
}
