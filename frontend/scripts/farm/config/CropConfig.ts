/** 作物目录由服务端 bootstrap 下发；客户端仅用于显示和进度预览。 */
import type { CropDef } from '../data/PlotData';

export const CROPS: CropDef[] = [];

function tuple(value: any, first: number, second: number): [number, number] {
  return Array.isArray(value) && value.length >= 2
    ? [Number(value[0]) || first, Number(value[1]) || second]
    : [first, second];
}

export function applyCropCatalog(rows: any[]): void {
  const crops: CropDef[] = (Array.isArray(rows) ? rows : [])
    .filter(row => row && typeof row.id === 'string')
    .map(row => ({
      id: String(row.id),
      name: String(row.name || row.id),
      kind: String(row.kind || ''),
      seasons: Array.isArray(row.seasons) ? row.seasons.map(String) : [],
      temp: tuple(row.temp, 15, 28),
      humidity: tuple(row.humidity, 55, 75),
      stageMinutes: Array.isArray(row.stageMinutes) && row.stageMinutes.length === 3
        ? row.stageMinutes.map((value: any) => Number(value) || 1) as [number, number, number]
        : [1, 2, 2],
      fertConsumption: Number(row.fertConsumption) || 1,
      bestFertilizers: Array.isArray(row.bestFertilizers) ? row.bestFertilizers.map(String) : [],
      targetFertility: Number(row.targetFertility) || 70,
      basePrice: Math.max(0, Number(row.basePrice) || 0),
      seedPrice: Math.max(0, Number(row.seedPrice) || 0),
      seedItemId: String(row.seedItemId || `seed_${row.id}`),
      fruitItemId: String(row.fruitItemId || `fruit_${row.id}`),
      seedIcon: String(row.seedIcon || `seed_${row.id}`),
      fruitIcon: String(row.fruitIcon || `fruit_${row.id}`),
      stageIcons: Array.isArray(row.stageIcons) && row.stageIcons.length === 3
        ? row.stageIcons.map(String)
        : [`${row.id}-01`, `${row.id}-02`, `${row.id}-03`],
    }));
  CROPS.splice(0, CROPS.length, ...crops);
}

export function getCropDef(id: string | null): CropDef | undefined {
  if (!id) return undefined;
  return CROPS.find(crop => crop.id === id);
}

/** 当前阶段对应的最佳肥料 id（S1/S2/S3） */
export function bestFertilizerAtStage(crop: CropDef | undefined, stage: number): string {
  if (!crop || !crop.bestFertilizers.length) return '';
  const index = Math.min(Math.max(stage, 1), crop.bestFertilizers.length) - 1;
  return crop.bestFertilizers[index];
}
