"""服务端权威游戏配置。

客户端只把这些数据用于展示；价格、奖励、成长时间和操作效果始终由服务端再次校验。
后续可把本模块替换为配置表/配置中心，但不要让客户端提交价格或奖励。
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Tuple


@dataclass(frozen=True)
class ItemDef:
    id: str
    name: str
    icon: str
    category: str
    value: int
    price: int | None = None
    effect: int = 0


@dataclass(frozen=True)
class CropDef:
    id: str
    name: str
    seed_item_id: str
    fruit_item_id: str
    seed_icon: str
    fruit_icon: str
    value: int
    duration_hours: float
    optimal_water: Tuple[float, float]
    optimal_fertilizer: Tuple[float, float]
    stage_icons: Tuple[str, ...] = ("plant_1", "plant_2", "plant_3")
    boost_water: float = 40
    boost_fertilizer: float = 30
    boost_hours: float = 2
    fertilizer_drain_per_hour: float = 0.7
    dry_penalty: float = 0.030
    over_water_penalty: float = 0.015
    low_fertilizer_penalty: float = 0.020
    over_fertilizer_penalty: float = 0.018


REGIONS = ["大区一 · 电信", "大区二 · 网通", "大区三 · 移动"]
CATALOG_VERSION = "2026.08.13.1"

_CROP_ROWS = [
    # id, name, harvest value, water range, fertilizer range
    ("wheat", "小麦", 20, (55, 75), (40, 60)),
    ("rice", "水稻", 22, (60, 85), (35, 55)),
    ("corn", "玉米", 30, (55, 75), (45, 65)),
    ("carrot", "胡萝卜", 24, (55, 75), (35, 55)),
    ("tomato", "番茄", 26, (55, 75), (45, 65)),
    ("potato", "土豆", 28, (55, 75), (40, 60)),
    ("strawberry", "草莓", 40, (60, 80), (40, 60)),
    ("pumpkin", "南瓜", 36, (55, 75), (45, 65)),
    ("pepper", "辣椒", 34, (55, 75), (45, 65)),
    ("eggplant", "茄子", 32, (55, 75), (40, 60)),
    ("watermelon", "西瓜", 48, (60, 80), (40, 60)),
    ("grape", "葡萄", 44, (55, 75), (45, 65)),
    ("soy", "大豆", 26, (55, 75), (40, 60)),
    ("peanut", "花生", 30, (55, 75), (45, 65)),
]

CROPS: Dict[str, CropDef] = {
    crop_id: CropDef(
        id=crop_id,
        name=name,
        seed_item_id=f"seed_{crop_id}",
        fruit_item_id=f"fruit_{crop_id}",
        seed_icon=f"seed_{crop_id}",
        fruit_icon=f"fruit_{crop_id}",
        value=value,
        duration_hours=12,
        optimal_water=water,
        optimal_fertilizer=fertilizer,
    )
    for crop_id, name, value, water, fertilizer in _CROP_ROWS
}

ITEMS: Dict[str, ItemDef] = {}
for index, crop in enumerate(CROPS.values()):
    seed_value = 6 + ((index * 5 + 3) % 17)
    ITEMS[crop.seed_item_id] = ItemDef(
        crop.seed_item_id, f"{crop.name}种子", crop.seed_icon, "seed", seed_value, seed_value * 2
    )
    ITEMS[crop.fruit_item_id] = ItemDef(
        crop.fruit_item_id, crop.name, crop.fruit_icon, "fruit", crop.value
    )

_FERTILIZERS = [
    ("organic", "有机肥", 18, 10),
    ("compound", "复合肥", 30, 13),
    ("n", "氮肥", 22, 16),
    ("p", "磷肥", 22, 19),
    ("k", "钾肥", 22, 22),
    ("liquid", "营养液", 15, 25),
    ("compost", "堆肥", 12, 28),
    ("bone", "骨粉", 20, 31),
    ("ash", "草木灰", 10, 14),
    ("slow", "缓释肥", 35, 18),
    ("fish", "鱼蛋白", 25, 21),
    ("seaweed", "海藻肥", 28, 24),
]
for key, name, effect, value in _FERTILIZERS:
    item_id = f"fert_{key}"
    ITEMS[item_id] = ItemDef(item_id, name, item_id, "fert", value, value * 2, effect)

SHOP_ITEMS = {item_id: item for item_id, item in ITEMS.items() if item.price is not None}

LAND_RULES: Dict[str, Any] = {
    "totalPlots": 24,
    "plotsPerRow": 6,
    "rows": 4,
    "waterMax": 100,
    "fertilizerMax": 100,
    "dryThreshold": 30,
    "fertilizedThreshold": 50,
    "waterPerUse": 20,
    "waterCooldownMs": 600,
    "developCost": 50,
    "levelPlots": list(range(1, 25)),
    "level": {"baseExp": 100, "expGrowth": 1.25, "maxLevel": 24},
}

WEATHER = {
    "definitions": {
        "sunny": {"type": "sunny", "name": "晴", "temp": 38, "drainPerHour": 8.3, "color": "#ffd54a"},
        "cloudy": {"type": "cloudy", "name": "多云", "temp": 30, "drainPerHour": 5.5, "color": "#b8c4d0"},
        "rainy": {"type": "rainy", "name": "雨", "temp": 25, "drainPerHour": 1.5, "color": "#7fb8e6"},
        "night": {"type": "night", "name": "夜", "temp": 22, "drainPerHour": 2.5, "color": "#4a5a7a"},
    },
    "schedule": [
        "night", "night", "night", "night", "night", "night",
        "cloudy", "sunny", "sunny", "sunny", "sunny", "sunny",
        "sunny", "sunny", "sunny", "sunny", "cloudy", "cloudy",
        "cloudy", "sunny", "cloudy", "night", "night", "night",
    ],
}


def fertilizer_amount(item_id: str) -> int:
    item = ITEMS.get(item_id)
    return item.effect if item and item.category == "fert" else 0


def plots_unlocked(level: int) -> int:
    values: List[int] = LAND_RULES["levelPlots"]
    return values[min(max(level, 1), len(values)) - 1]


def exp_for_next_level(level: int) -> int:
    rule = LAND_RULES["level"]
    return int(rule["baseExp"] * (rule["expGrowth"] ** max(0, level - 1)) + 0.999999)


def _crop_json(crop: CropDef) -> Dict[str, Any]:
    return {
        "id": crop.id,
        "name": crop.name,
        "seedItemId": crop.seed_item_id,
        "fruitItemId": crop.fruit_item_id,
        "seedIcon": crop.seed_icon,
        "fruitIcon": crop.fruit_icon,
        "value": crop.value,
        "duration": crop.duration_hours,
        "optWater": list(crop.optimal_water),
        "optFert": list(crop.optimal_fertilizer),
        "stageIcons": [crop.seed_icon, *crop.stage_icons],
        "boostWater": crop.boost_water,
        "boostFert": crop.boost_fertilizer,
        "boostHours": crop.boost_hours,
        "fertConsume": crop.fertilizer_drain_per_hour,
        "penaltyDry": crop.dry_penalty,
        "penaltyOverWater": crop.over_water_penalty,
        "penaltyLowFert": crop.low_fertilizer_penalty,
        "penaltyOverFert": crop.over_fertilizer_penalty,
    }


def public_catalog() -> Dict[str, Any]:
    items = [asdict(item) for item in ITEMS.values()]
    for item in items:
        # 前端统一使用 camelCase；None 价格代表不在商店出售。
        item.pop("effect", None)
    return {
        "version": CATALOG_VERSION,
        "regions": REGIONS,
        "items": items,
        "shopItems": [asdict(item) for item in SHOP_ITEMS.values()],
        "crops": [_crop_json(crop) for crop in CROPS.values()],
        "land": LAND_RULES,
        "weather": WEATHER,
    }


def initial_inventory() -> Dict[str, int]:
    """正式新玩家初始物品。演示账号的额外数据由后端 seed 命令生成。"""
    return {"seed_wheat": 3, "fert_organic": 2}
