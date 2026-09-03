"""季节、天气与温度：完全由「世界种子 + 现实时间」决定的纯函数。

这样设计的原因：离线补算需要按分钟重放很久以前的结算，任何依赖「当前随机结果」的
天气都会让重放结果不一致。把天气/季节/温度写成绝对分钟索引的确定性函数后，服务端
无论何时、重放多少次，得到的环境都完全一致，也不需要额外存储。

 - 季节：每季 48 小时，循环 春 → 夏 → 秋 → 冬。
 - 天气：每 6 小时更新一次（00:00 / 06:00 / 12:00 / 18:00）。
 - 基础温度：每天 00:00（UTC）重新随机，当天保持不变。
"""
from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Tuple

from .catalog import (
    ALL_SEASONS,
    SEASON_BASE_TEMPERATURE,
    SEASON_NAMES,
    WEATHER_COLD_ALIAS,
    WEATHER_DEFINITIONS,
    WEATHER_WEIGHTS,
)

MINUTE_MS = 60_000
DAY_MINUTES = 24 * 60
SEASON_MINUTES = 48 * 60
WEATHER_SLOT_MINUTES = 6 * 60


def minute_index(timestamp_ms: int) -> int:
    return int(timestamp_ms // MINUTE_MS)


def day_index(timestamp_ms: int) -> int:
    return minute_index(timestamp_ms) // DAY_MINUTES


def rand01(seed: str, *parts: Any) -> float:
    """确定性 [0,1) 随机数；同一 (seed, parts) 永远得到同一结果。"""
    payload = "|".join([str(seed), *[str(part) for part in parts]])
    digest = hashlib.sha256(payload.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") / float(1 << 64)


def rand_range(seed: str, low: float, high: float, *parts: Any) -> float:
    return low + (high - low) * rand01(seed, *parts)


def season_at(timestamp_ms: int) -> str:
    index = (minute_index(timestamp_ms) // SEASON_MINUTES) % len(ALL_SEASONS)
    return ALL_SEASONS[index]


def weather_slot(timestamp_ms: int) -> int:
    return minute_index(timestamp_ms) // WEATHER_SLOT_MINUTES


def base_temperature(seed: str, timestamp_ms: int) -> float:
    season = season_at(timestamp_ms)
    low, high = SEASON_BASE_TEMPERATURE[season]
    return rand_range(seed, low, high, "base-temp", day_index(timestamp_ms))


def weather_at(seed: str, timestamp_ms: int) -> str:
    season = season_at(timestamp_ms)
    weights: List[Tuple[str, float]] = WEATHER_WEIGHTS[season]
    total = sum(weight for _, weight in weights)
    target = rand01(seed, "weather", weather_slot(timestamp_ms)) * total
    cumulative = 0.0
    for weather_id, weight in weights:
        cumulative += weight
        if target <= cumulative:
            return weather_id
    return weights[-1][0]


def temperature_at(seed: str, timestamp_ms: int) -> float:
    """实际温度 = 当天基础温度 + 天气温度修正。"""
    weather = WEATHER_DEFINITIONS[weather_at(seed, timestamp_ms)]
    return base_temperature(seed, timestamp_ms) + float(weather["tempModifier"])


def weather_name(weather_id: str, temperature: float) -> str:
    name = WEATHER_DEFINITIONS[weather_id]["name"]
    if temperature < 0:
        return WEATHER_COLD_ALIAS.get(weather_id, name)
    return name


def world_state(seed: str, timestamp_ms: int) -> Dict[str, Any]:
    """某一分钟的全局环境快照。"""
    season = season_at(timestamp_ms)
    weather_id = weather_at(seed, timestamp_ms)
    weather = WEATHER_DEFINITIONS[weather_id]
    temperature = base_temperature(seed, timestamp_ms) + float(weather["tempModifier"])
    return {
        "seed": seed,
        "timestampMs": timestamp_ms,
        "minuteIndex": minute_index(timestamp_ms),
        "dayIndex": day_index(timestamp_ms),
        "season": season,
        "seasonName": SEASON_NAMES[season],
        "weather": weather_id,
        "weatherName": weather_name(weather_id, temperature),
        "temperature": round(temperature, 2),
        "humidityModifier": float(weather["humidityModifier"]),
        "pestRisk": float(weather["pestRisk"]),
        "diseaseRisk": float(weather["diseaseRisk"]),
    }
