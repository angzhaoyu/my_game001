from __future__ import annotations

from typing import Any, Dict

from .catalog import ITEMS, public_catalog
from .models import GameAggregate, Plot


def plot_to_dict(plot: Plot) -> Dict[str, Any]:
    return {
        "id": plot.id,
        "developed": plot.developed,
        "water": round(plot.water, 3),
        "fert": round(plot.fertilizer, 3),
        "crop": plot.crop_id,
        "plantedAt": plot.planted_at_ms,
        "progress": round(plot.progress, 6),
        "harvestable": plot.harvestable,
        "lastBoostKey": plot.last_boost_key,
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
            "count": entry.count,
            "acquired": entry.acquired_at_ms,
        })
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
        "plots": [plot_to_dict(state.plots[i]) for i in sorted(state.plots)],
        "lastTick": state.last_simulated_at_ms,
    }
    if include_catalog:
        result["catalog"] = public_catalog()
    return result
