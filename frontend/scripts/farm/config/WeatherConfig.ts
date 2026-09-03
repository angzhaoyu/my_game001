export type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'night';

export interface WeatherDef {
  type: WeatherType;
  name: string;
  temp: number;
  drainPerHour: number;
  color: string;
}

export const WEATHER: Record<WeatherType, WeatherDef> = {
  sunny: { type: 'sunny', name: '晴', temp: 38, drainPerHour: 8.3, color: '#ffd54a' },
  cloudy: { type: 'cloudy', name: '多云', temp: 30, drainPerHour: 5.5, color: '#b8c4d0' },
  rainy: { type: 'rainy', name: '雨', temp: 25, drainPerHour: 1.5, color: '#7fb8e6' },
  night: { type: 'night', name: '夜', temp: 22, drainPerHour: 2.5, color: '#4a5a7a' },
};
let daySchedule: WeatherType[] = [
  'night','night','night','night','night','night','cloudy','sunny','sunny','sunny','sunny','sunny',
  'sunny','sunny','sunny','sunny','cloudy','cloudy','cloudy','sunny','cloudy','night','night','night',
];

export function applyWeatherConfig(remote: any): void {
  if (!remote || typeof remote !== 'object') return;
  const definitions = remote.definitions || {};
  (Object.keys(WEATHER) as WeatherType[]).forEach(type => {
    const row = definitions[type];
    if (!row) return;
    WEATHER[type] = {
      type,
      name: String(row.name || WEATHER[type].name),
      temp: Number(row.temp) || WEATHER[type].temp,
      drainPerHour: Number(row.drainPerHour) || WEATHER[type].drainPerHour,
      color: String(row.color || WEATHER[type].color),
    };
  });
  if (Array.isArray(remote.schedule) && remote.schedule.length === 24) {
    daySchedule = remote.schedule.map((type: any) =>
      typeof type === 'string' && type in WEATHER ? type as WeatherType : 'sunny',
    );
  }
}

export function weatherAtHour(hour: number): WeatherDef {
  const normalized = ((Math.floor(hour) % 24) + 24) % 24;
  return WEATHER[daySchedule[normalized]];
}

export function waterDrainPerHour(hour: number): number {
  return weatherAtHour(hour).drainPerHour;
}

export function representativeWeather(now: number): WeatherDef {
  return weatherAtHour(new Date(now).getHours());
}
