/**
 * config/WeatherConfig.ts —— 季节 / 天气（表 `Season_Data` / `Weather_Data`）与最近一次 `world` 快照
 *
 * 真实季节、天气、温度由服务端按现实时间确定性计算并随快照 `world` 下发，
 * 这里只提供名称映射（WeatherHud / SoilInfoPanel 的 Label）和「中文季节名 ↔ id」的换算。
 */
import { asNumber, asPair, asText, defineTable, field } from './Tables';
import type { RawRow } from './Tables';
import type { WorldData } from '../data/PlotData';

export interface SeasonDef { id: string; name: string; temp: [number, number] }

export interface WeatherDef {
  id: string;
  name: string;
  tempModifier: number;
  humidityModifier: number;
  pestRisk: number;
  diseaseRisk: number;
}

const SEASONS = defineTable<SeasonDef>('Season_Data', {
  id: field(['ID', 'id'], asText, ''),
  name: field(['名称', 'name'], asText, ''),
  temp: field(['温度', 'temp'], asPair, [0, 0]),
}, 'id');

const WEATHERS = defineTable<WeatherDef>('Weather_Data', {
  id: field(['ID', 'id'], asText, ''),
  name: field(['名称', 'name'], asText, ''),
  tempModifier: field(['温度修正', 'tempModifier'], asNumber, 0),
  humidityModifier: field(['湿度修正', 'humidityModifier'], asNumber, 1),
  pestRisk: field(['害虫风险', 'pestRisk'], asNumber, 0),
  diseaseRisk: field(['病害风险', 'diseaseRisk'], asNumber, 0),
}, 'id');

export function seasonName(id: string): string {
  return SEASONS.get(id)?.name ?? id;
}

export function weatherName(id: string): string {
  return WEATHERS.get(id)?.name ?? id;
}

/** 服务端 catalog.seasons / catalog.weather.definitions → 覆盖表格 */
export function applyWeatherConfig(remote: { seasons?: readonly unknown[]; definitions?: object } | undefined): void {
  if (!remote) return;
  SEASONS.apply(remote.seasons);
  const definitions = remote.definitions as Record<string, object> | undefined;
  if (definitions && typeof definitions === 'object') {
    WEATHERS.apply(Object.entries(definitions).map(([id, row]) => ({ id, ...row })));
  }
}

let current: WorldData = {
  season: 'spring', seasonName: '春',
  weather: 'sunny', weatherName: '晴',
  temperature: 20, dayIndex: 0, minuteIndex: 0, timestampMs: 0,
};

/** 由 GameRoot 在每次快照到达时调用：只更新显示值，不做动画 */
export function applyWorldSnapshot(world: WorldData | undefined): void {
  if (!world) return;
  current = {
    ...world,
    seasonName: world.seasonName || seasonName(world.season),
    weatherName: world.weatherName || weatherName(world.weather),
  };
}

export function currentWorld(): WorldData {
  return current;
}
