import type { RemoteSeason, RemoteWeatherDef } from '../../core/network/Contracts';
/**
 * 季节 / 天气配置的运行时镜像。
 * 真实季节、天气、温度由服务端按现实时间确定性计算并通过快照的 `world` 下发，
 * 这里只保存名称映射和最近一次快照，供 WeatherHud 的 Label 显示（不做动画）。
 */
import type { WorldData } from '../data/PlotData';

export type SeasonDef = RemoteSeason;

export type WeatherDef = RemoteWeatherDef;

// 目录由 CSV 经服务端 bootstrap 下发，不在客户端重复维护数值表。
export const SEASONS: Record<string, SeasonDef> = {};
export const WEATHER: Record<string, WeatherDef> = {};

let current: WorldData = {
  season: 'spring',
  seasonName: '春',
  weather: 'sunny',
  weatherName: '晴',
  temperature: 20,
  dayIndex: 0,
  minuteIndex: 0,
  timestampMs: 0,
};

export function applyWeatherConfig(remote: any): void {
  if (!remote || typeof remote !== 'object') return;
  if (Array.isArray(remote.seasons)) {
    remote.seasons.forEach((row: any) => {
      if (!row || typeof row.id !== 'string') return;
      SEASONS[row.id] = {
        id: row.id,
        name: String(row.name || SEASONS[row.id]?.name || row.id),
        temp: Array.isArray(row.temp) ? [Number(row.temp[0]) || 0, Number(row.temp[1]) || 0] : [0, 0],
      };
    });
  }
  const definitions = remote.definitions || remote.weather?.definitions || {};
  Object.keys(definitions).forEach(id => {
    const row = definitions[id];
    if (!row) return;
    WEATHER[id] = {
      id,
      name: String(row.name || WEATHER[id]?.name || id),
      tempModifier: Number(row.tempModifier) || 0,
      humidityModifier: Number(row.humidityModifier) || 0,
      pestRisk: Number(row.pestRisk) || 0,
      diseaseRisk: Number(row.diseaseRisk) || 0,
    };
  });
}

/** 由 GameRoot 在每次快照到达时调用：只更新天气/季节/温度的显示值。 */
export function applyWorldSnapshot(world: WorldData | undefined): void {
  if (!world) return;
  current = { ...world };
}

export function currentWorld(): WorldData {
  return current;
}

export function seasonName(id: string): string {
  return SEASONS[id]?.name || id;
}

export function weatherName(id: string): string {
  return WEATHER[id]?.name || id;
}
