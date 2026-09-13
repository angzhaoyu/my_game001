"""v1.10 数值公式（纯函数）。

`game.py` 用它做每分钟结算，`serialization.py` 用它生成前端展示用的瞬时系数。
所有倍率都只依赖「作物定义 + 地块状态 + 全局环境」，没有任何隐藏状态，便于单测。
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional

from .catalog import (
    DISEASE_GROWTH_TABLE,
    GROWTH_RULES,
    LAND_RULES,
    PEST_GROWTH_TABLE,
    UNSUITABLE_SEASON_MULTIPLIER,
    CropDef,
    crop_best_fertilizer_for_stage,
    event_level_for_age,
    growth_multiplier_for_level,
    quality_grade,
)
from .models import Plot


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


# --------------------------------------------------------------------------
# 单环境倍率
# --------------------------------------------------------------------------

def season_multiplier(crop: CropDef, season: str) -> float:
    return 1.0 if season in crop.seasons else float(UNSUITABLE_SEASON_MULTIPLIER)


def temperature_multiplier(crop: CropDef, temperature: float) -> tuple[float, float]:
    """返回 (倍率, 偏离度)。"""
    low, high = crop.temp
    if low <= temperature <= high:
        return 1.0, 0.0
    deviation = min(abs(temperature - low), abs(temperature - high))
    multiplier = max(
        float(GROWTH_RULES["minEnvironmentMultiplier"]),
        1.0 - deviation * float(GROWTH_RULES["temperaturePenaltyPerDegree"]),
    )
    return multiplier, deviation


def humidity_multiplier(crop: CropDef, moisture: float) -> tuple[float, float]:
    low, high = crop.humidity
    if low <= moisture <= high:
        return 1.0, 0.0
    if moisture < low:
        deviation = low - moisture
    else:
        deviation = moisture - high
    multiplier = max(
        float(GROWTH_RULES["minEnvironmentMultiplier"]),
        1.0 - deviation * float(GROWTH_RULES["humidityPenaltyPerPoint"]),
    )
    return multiplier, deviation


def fertility_multiplier(crop: CropDef, fertility: float) -> tuple[float, float]:
    """目标上下 10% 以内为 1.00；低于按 1-(0.90-Ratio)，高于按 1-1.5×(Ratio-1.10)。"""
    target = max(1.0, crop.target_fertility)
    ratio = fertility / target
    band = float(GROWTH_RULES["fertilityTargetBand"])
    if 1.0 - band <= ratio <= 1.0 + band:
        return 1.0, 0.0
    if ratio < 1.0 - band:
        multiplier = max(
            float(GROWTH_RULES["minEnvironmentMultiplier"]),
            1.0 - ((1.0 - band) - ratio),
        )
    else:
        multiplier = max(
            float(GROWTH_RULES["minFertilityHighMultiplier"]),
            1.0 - float(GROWTH_RULES["fertilityHighPenaltyFactor"]) * (ratio - (1.0 + band)),
        )
    return multiplier, abs(ratio - 1.0)


def best_fertilizer_state(plot: Plot, crop: CropDef) -> tuple[str, bool]:
    """当前阶段的最佳肥料是否在生效列表中（不叠加）。"""
    best_id = crop_best_fertilizer_for_stage(crop, plot.stage)
    if not best_id:
        return "", False
    active = any(item.fertilizer_id == best_id and item.remaining_minutes > 0
                 for item in plot.active_fertilizers)
    return best_id, active


def pest_growth_multiplier(level: float) -> float:
    return 1.0 if level <= 0 else growth_multiplier_for_level(level, PEST_GROWTH_TABLE)


def disease_growth_multiplier(level: float) -> float:
    return 1.0 if level <= 0 else growth_multiplier_for_level(level, DISEASE_GROWTH_TABLE)


# --------------------------------------------------------------------------
# 成长
# --------------------------------------------------------------------------

@dataclass
class GrowthContext:
    season_multiplier: float = 1.0
    temperature_multiplier: float = 1.0
    humidity_multiplier: float = 1.0
    fertility_multiplier: float = 1.0
    best_fertilizer_multiplier: float = 1.0
    pest_multiplier: float = 1.0
    disease_multiplier: float = 1.0
    raw_multiplier: float = 1.0
    final_multiplier: float = 1.0
    base_growth_per_minute: float = 0.0
    growth_per_minute: float = 0.0
    temperature_deviation: float = 0.0
    humidity_deviation: float = 0.0
    fertility_deviation: float = 0.0
    best_fertilizer_id: str = ""
    has_best_fertilizer: bool = False
    best_fertilizer_quality_gain: float = 0.0
    low_moisture: bool = False
    low_fertility: bool = False

    def to_dict(self) -> Dict[str, Any]:
        row = asdict(self)
        row["baseGrowthPerMinute"] = row.pop("base_growth_per_minute", 0.0)
        row["growthPerMinute"] = row.pop("growth_per_minute", 0.0)
        return {key: (round(value, 4) if isinstance(value, float) else value)
                for key, value in row.items()}


def base_growth_per_minute(crop: CropDef, stage: int) -> float:
    """BaseGrowthPerMinute = 100 / (StageTargetMinutes × 1.20)。"""
    index = min(max(stage, 1), len(crop.stage_minutes)) - 1
    target_minutes = max(0.1, crop.stage_minutes[index])
    return 100.0 / (target_minutes * float(GROWTH_RULES["stageBaseDivisor"]))


def growth_context(crop: CropDef, plot: Plot, world: Dict[str, Any]) -> GrowthContext:
    """计算当前分钟的完整成长环境（结算与展示共用）。"""
    context = GrowthContext()
    context.season_multiplier = season_multiplier(crop, world["season"])
    context.temperature_multiplier, context.temperature_deviation = temperature_multiplier(
        crop, float(world["temperature"]))
    context.humidity_multiplier, context.humidity_deviation = humidity_multiplier(crop, plot.moisture)
    context.fertility_multiplier, context.fertility_deviation = fertility_multiplier(crop, plot.fertility)
    context.best_fertilizer_id, context.has_best_fertilizer = best_fertilizer_state(plot, crop)
    if context.has_best_fertilizer:
        context.best_fertilizer_multiplier = float(GROWTH_RULES["bestFertilizerMultiplier"])
        context.best_fertilizer_quality_gain = float(GROWTH_RULES["bestFertilizerQualityGain"])
    context.pest_multiplier = pest_growth_multiplier(plot.pest_level if plot.pest_status == "ACTIVE" else 0.0)
    context.disease_multiplier = disease_growth_multiplier(
        plot.disease_level if plot.disease_status == "ACTIVE" else 0.0)

    raw = (context.season_multiplier * context.temperature_multiplier * context.humidity_multiplier
           * context.fertility_multiplier * context.best_fertilizer_multiplier
           * context.pest_multiplier * context.disease_multiplier)
    context.raw_multiplier = raw
    context.final_multiplier = max(float(GROWTH_RULES["minGrowthMultiplier"]), raw)
    context.base_growth_per_minute = base_growth_per_minute(crop, plot.stage)
    context.growth_per_minute = context.base_growth_per_minute * context.final_multiplier

    # 缺肥 / 缺水提示阈值：低于作物需求这么多点才提示（LAND_RULES 可调；
    # 前端读同一数值 catalog.land.fertilityAlertGap 决定什么时候换 soil 贴图）
    fertility_gap = float(LAND_RULES.get("fertilityAlertGap", 10))
    moisture_gap = float(LAND_RULES.get("moistureAlertGap", 10))
    context.low_moisture = plot.moisture < crop.humidity[0] - moisture_gap
    context.low_fertility = plot.fertility < crop.target_fertility - fertility_gap
    return context


# --------------------------------------------------------------------------
# 品质
# --------------------------------------------------------------------------

def quality_penalties(crop: CropDef, plot: Plot, world: Dict[str, Any]) -> Dict[str, float]:
    temperature_rule = GROWTH_RULES["temperatureQualityPenalty"]
    humidity_rule = GROWTH_RULES["humidityQualityPenalty"]
    low, high = crop.temp
    temperature = float(world["temperature"])
    temp_deviation = 0.0 if low <= temperature <= high else min(
        abs(temperature - low), abs(temperature - high))
    mlow, mhigh = crop.humidity
    moisture_deviation = 0.0 if mlow <= plot.moisture <= mhigh else min(
        abs(plot.moisture - mlow), abs(plot.moisture - mhigh))
    fertility_deviation = abs(plot.fertility - crop.target_fertility) / max(1.0, crop.target_fertility)
    band = float(GROWTH_RULES["fertilityTargetBand"])
    return {
        "temperature": min(float(temperature_rule["max"]), temp_deviation * float(temperature_rule["perDegree"])),
        "humidity": min(float(humidity_rule["max"]), moisture_deviation * float(humidity_rule["perPoint"])),
        "fertility": max(0.0, fertility_deviation - band) * float(GROWTH_RULES["fertilityQualityPenalty"]),
        "pest": float(GROWTH_RULES["pestQualityDamagePerMinute"]) * plot.pest_level / 100.0
        if plot.pest_status == "ACTIVE" else 0.0,
        "disease": float(GROWTH_RULES["diseaseQualityDamagePerMinute"]) * plot.disease_level / 100.0
        if plot.disease_status == "ACTIVE" else 0.0,
    }


def quality_grade_for(score: float) -> tuple[str, float]:
    return quality_grade(score)


# --------------------------------------------------------------------------
# 产量
# --------------------------------------------------------------------------

def yield_multiplier(plot: Plot) -> float:
    pest = 1.0 - float(GROWTH_RULES["pestYieldPenalty"]) * (plot.pest_level / 100.0) \
        if plot.pest_status == "ACTIVE" else 1.0
    disease = 1.0 - float(GROWTH_RULES["diseaseYieldPenalty"]) * (plot.disease_level / 100.0) \
        if plot.disease_status == "ACTIVE" else 1.0
    total = pest * disease
    return max(float(GROWTH_RULES["minYieldMultiplier"]), total)


def mature_yield(plot: Plot) -> int:
    return int(math.floor(float(GROWTH_RULES["baseYield"]) * yield_multiplier(plot)))


# --------------------------------------------------------------------------
# 病虫害
# --------------------------------------------------------------------------

def event_level(onset_ms: Optional[int], now_ms: int) -> float:
    if onset_ms is None:
        return 0.0
    age_minutes = max(0.0, (now_ms - int(onset_ms)) / 60000.0)
    return event_level_for_age(age_minutes)


def event_level_delta(previous_age: float, current_age: float) -> float:
    """按曲线取「本分钟增量」。

    事件等级整体由 AgeMinutes 决定，但药品会降低当前等级；如果每分钟都把等级
    重置为曲线值，药效就会被立刻抹掉。因此只取曲线的增量叠加到当前等级上：
    自然发展时与曲线完全一致，用药后从降低后的等级继续上升。
    """
    return max(0.0, event_level_for_age(current_age) - event_level_for_age(max(0.0, previous_age)))


def appear_chance(crop: CropDef, plot: Plot, world: Dict[str, Any], target: str) -> float:
    """文档第九章：基础 0.02%/分钟 + 环境风险 + 天气风险，上限 0.15%/分钟。"""
    base = float(GROWTH_RULES["pestBaseChance"] if target == "pest" else GROWTH_RULES["diseaseBaseChance"])
    low, high = crop.temp
    temperature = float(world["temperature"])
    temp_deviation = 0.0 if low <= temperature <= high else min(
        abs(temperature - low), abs(temperature - high))
    mlow, mhigh = crop.humidity
    moisture_deviation = 0.0 if mlow <= plot.moisture <= mhigh else min(
        abs(plot.moisture - mlow), abs(plot.moisture - mhigh))

    risk = (int(temp_deviation // 5) * float(GROWTH_RULES["riskPerTemperatureStep"])
            + int(moisture_deviation // 10) * float(GROWTH_RULES["riskPerHumidityStep"]))
    if plot.soil_health < 60:
        risk += float(GROWTH_RULES["riskSoilHealthLow"])
    if plot.soil_health < 40:
        risk += float(GROWTH_RULES["riskSoilHealthCritical"])
        if target == "disease":
            risk += float(GROWTH_RULES["riskSoilHealthCritical"])
    weather_risk = float(world["pestRisk"] if target == "pest" else world["diseaseRisk"])
    return clamp(base + risk + weather_risk, 0.0, float(GROWTH_RULES["maxAppearChance"]))
