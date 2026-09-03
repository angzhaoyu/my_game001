from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class InventoryEntry:
    item_id: str
    count: int
    acquired_at_ms: int


@dataclass
class Plot:
    id: int
    developed: bool = False
    water: float = 0
    fertilizer: float = 0
    crop_id: Optional[str] = None
    planted_at_ms: int = 0
    progress: float = 0
    harvestable: bool = False
    last_boost_key: str = ""
    last_watered_at_ms: int = 0


@dataclass
class GameAggregate:
    user_id: int
    username: str
    region: str
    created_at_ms: int
    coins: int = 500
    diamonds: int = 0
    level: int = 1
    exp: int = 0
    energy: int = 100
    version: int = 1
    last_simulated_at_ms: int = 0
    inventory: Dict[str, InventoryEntry] = field(default_factory=dict)
    plots: Dict[int, Plot] = field(default_factory=dict)


@dataclass(frozen=True)
class ActionResult:
    message: str
