from __future__ import annotations

from typing import Any, Dict

from .catalog import (
    CROPS,
    FERTILIZERS,
    ITEMS,
    LAND_RULES,
    MEDICINES,
    land_unlock_row,
    public_catalog,
    quality_grade,
)
from .models import GameAggregate, Plot
from .rules import growth_context
from .world import world_state


def _active_fertilizers(plot: Plot, best_fertilizer_id: str) -> list[Dict[str, Any]]:
    rows = []
    for item in plot.active_fertilizers:
        definition = FERTILIZERS.get(item.fertilizer_id)
        rows.append({
            "id": item.fertilizer_id,
            "name": definition.name if definition else item.fertilizer_id,
            "itemId": definition.item_id if definition else f"fert_{item.fertilizer_id}",
            "type": definition.type if definition else "",
            "remainingMinutes": round(item.remaining_minutes, 2),
            "perMinute": round(item.per_minute, 3),
            "best": bool(best_fertilizer_id) and item.fertilizer_id == best_fertilizer_id,
        })
    return rows


def _active_medicines(plot: Plot) -> list[Dict[str, Any]]:
    rows = []
    for item in plot.active_medicines:
        definition = MEDICINES.get(item.medicine_id)
        rows.append({
            "id": item.medicine_id,
            "name": definition.name if definition else item.medicine_id,
            "target": definition.target if definition else "",
            "remainingMinutes": round(item.remaining_minutes, 2),
            "perMinute": bool(definition.per_minute) if definition else False,
        })
    return rows


def plot_to_dict(plot: Plot, world: Dict[str, Any]) -> Dict[str, Any]:
    crop = CROPS.get(plot.crop_id) if plot.crop_id else None
    grade, multiplier = quality_grade(plot.quality_score)
    best_fertilizer_id = ""
    growth_per_minute = 0.0
    low_moisture = False
    low_fertility = False
    if crop and not plot.mature:
        context = growth_context(crop, plot, world)
        best_fertilizer_id = context.best_fertilizer_id
        growth_per_minute = context.growth_per_minute
        low_moisture = context.low_moisture
        low_fertility = context.low_fertility

    unlock_row = land_unlock_row(plot.id)
    return {
        "id": plot.id,
        "unlocked": plot.unlocked,
        # 土地长期状态
        "fertility": round(plot.fertility, 2),
        "soilHealth": round(plot.soil_health, 2),
        "moisture": round(plot.moisture, 2),
        # 作物
        "crop": plot.crop_id,
        "stage": plot.stage,
        "stageGrowth": round(plot.stage_growth, 2),
        "plantAgeMinutes": round(plot.plant_age_minutes, 2),
        "mature": plot.mature,
        "quality": round(plot.quality_score, 2),
        "qualityGrade": grade,
        "qualityMultiplier": multiplier,
        "matureYield": plot.mature_yield,
        "harvestQuantity": plot.harvest_quantity,
        # 病虫害
        "pest": {
            "level": round(plot.pest_level, 2),
            "status": plot.pest_status,
            "onsetAt": plot.pest_onset_ms,
        },
        "disease": {
            "level": round(plot.disease_level, 2),
            "status": plot.disease_status,
            "onsetAt": plot.disease_onset_ms,
        },
        "grass": {
            "level": round(plot.grass_level, 2),
            "status": plot.grass_status,
            "onsetAt": plot.grass_onset_ms,
        },
        # 生效中的肥料 / 药品
        "activeFertilizers": _active_fertilizers(plot, best_fertilizer_id),
        "activeMedicines": _active_medicines(plot),
        # 提示与进度
        "bestFertilizerId": best_fertilizer_id,
        "growthPerMinute": round(growth_per_minute, 3),
        "progress": round(min(1.0, plot.total_growth() / 300.0), 4),
        "lowMoisture": low_moisture,
        "lowFertility": low_fertility,
        # 每日统计
        "dailyPlantCount": plot.daily_plant_count,
        "dailyPlantLimit": int(LAND_RULES["dailyPlantLimit"]),
        "dailyNetIncome": round(plot.daily_net_income, 2),
        "unlock": {
            "price": int(unlock_row["price"]) if unlock_row else 0,
            "minLevel": int(unlock_row["minLevel"]) if unlock_row else 1,
        } if unlock_row else None,
    }


def snapshot(state: GameAggregate, server_time_ms: int, *, include_catalog: bool = False) -> Dict[str, Any]:
    inventory = []
    for entry in sorted(state.inventory.values(), key=lambda row: row.item_id):
        item = ITEMS.get(entry.item_id)
        if not item or entry.count <= 0:
            continue
        inventory.append({
            "id": item.id,
            "name": item.name,
            "icon": item.icon,
            "category": item.category,
            "value": item.value,
            "price": item.price,
            "count": entry.count,
            "acquired": entry.acquired_at_ms,
        })
    world = world_state(state.world_seed_value(), server_time_ms)
    result: Dict[str, Any] = {
        "serverTimeMs": server_time_ms,
        "stateVersion": state.version,
        "profile": {
            "id": state.user_id,
            "username": state.username,
            "region": state.region,
            "coins": state.coins,
            "gold": state.coins,
            "diamonds": state.diamonds,
            "level": state.level,
            "exp": state.exp,
            "energy": state.energy,
            "createdAt": state.created_at_ms,
        },
        "inventory": inventory,
        "plots": [plot_to_dict(state.plots[i], world) for i in sorted(state.plots)],
        "world": world,
        "daily": state.daily.to_dict(),
        "lastTick": state.last_simulated_at_ms,
    }
    if include_catalog:
        result["catalog"] = public_catalog()
    return result
