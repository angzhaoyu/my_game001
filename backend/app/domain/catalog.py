"""服务端权威游戏配置（数值系统 v1.10）。

客户端只把这些数据用于展示；价格、奖励、成长时间和操作效果始终由服务端再次校验。
表格统一读取 frontend/resources/datas；客户端通过 bootstrap 获取解析后的权威目录。

配置来源：`frontend/resources/datas/*.csv`；玩法与偏差见 `docs/GAME_RULES.md`。
 - 时间单位统一为现实分钟（1 分钟 = 1 次服务器标准结算）。
 - 只使用单一 `Fertility`，N/P/K 不参与任何计算。
 - 基础成熟产量 BaseYield = 10。
 - 单块土地每天最多播种 3 次，单块土地每日净收益硬上限 100 金币。
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
import os
from pathlib import Path
from dataclasses import asdict, dataclass
from typing import get_args, get_origin, get_type_hints
from typing import Any, Dict, List, Tuple

# 本地与 Cocos 共用同一份只读表；容器通过 GAME_DATA_DIR 指向复制入镜像的数据。
DATA_DIR = Path(os.environ.get("GAME_DATA_DIR", Path(__file__).resolve().parents[3] / "frontend/resources/datas"))


def table(name: str, strings: str = "id name", tuples: str = "") -> List[Dict[str, Any]]:
    """UTF-8 CSV：文本列原样保留，其余列为 JSON 数字/布尔/数组；错误直接阻止启动。"""
    def invalid_constant(value):
        raise ValueError(f"non-finite number: {value}")

    def convert(value):
        if isinstance(value, list):
            return tuple(convert(item) for item in value)
        return value

    with (DATA_DIR / f"{name}.csv").open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames):
            raise ValueError(f"{name}: missing/duplicate columns")
        rows = []
        for line, row in enumerate(reader, 2):
            try:
                if None in row or None in row.values():
                    raise ValueError("column count mismatch")
                parsed = {key: value if key in strings.split() else json.loads(value, parse_constant=invalid_constant) for key, value in row.items()}
                for key in tuples.split():
                    parsed[key] = convert(parsed[key])
                if any(isinstance(v, float) and not math.isfinite(v) for v in parsed.values()):
                    raise ValueError("non-finite number")
                rows.append(parsed)
            except (ValueError, KeyError) as error:
                raise ValueError(f"{name}.csv:{line}: {error}") from error
        if not rows:
            raise ValueError(f"{name}: empty table")
        ids = [row["id"] for row in rows if "id" in row]
        if len(ids) != len(set(ids)):
            raise ValueError(f"{name}: duplicate id")
        return rows


def definitions(name, cls):
    hints = get_type_hints(cls)
    rows = table(name, " ".join(k for k, v in hints.items() if v is str),
                 " ".join(k for k, v in hints.items() if getattr(v, "__origin__", None) is tuple))
    def matches(value, hint):
        if get_origin(hint) is tuple:
            args = get_args(hint)
            return isinstance(value, tuple) and (
                all(matches(v, args[0]) for v in value) if args[-1] is Ellipsis
                else len(value) == len(args) and all(matches(v, t) for v, t in zip(value, args))
            )
        if hint is float:
            return type(value) in (int, float) and math.isfinite(value)
        return type(value) is hint

    for row in rows:
        if row.keys() != hints.keys() or any(not matches(row[k], t) for k, t in hints.items()):
            raise ValueError(f"{name}: invalid columns/types for {row.get('id')}")
    result = {row["id"]: cls(**row) for row in rows}
    if len(result) != len(rows) or any(not key for key in result):
        raise ValueError(f"{name}: duplicate/empty id")
    return result


RULES: Dict[str, Dict[str, Any]] = {}
for _rule in table("rules", "group key"):
    _group = RULES.setdefault(_rule["group"], {})
    if _rule["key"] in _group:
        raise ValueError(f"rules: duplicate key {_rule['key']}")
    _group[_rule["key"]] = _rule["value"]

# --------------------------------------------------------------------------
# 物品
# --------------------------------------------------------------------------

SEED = "seed"
FRUIT = "fruit"
FERT = "fert"
MEDICINE = "medicine"


@dataclass(frozen=True)
class ItemDef:
    id: str
    name: str
    icon: str
    category: str
    value: int
    price: int | None = None
    effect: int = 0


# --------------------------------------------------------------------------
# 作物
# --------------------------------------------------------------------------

SPRING, SUMMER, AUTUMN, WINTER = "spring", "summer", "autumn", "winter"
ALL_SEASONS: Tuple[str, ...] = (SPRING, SUMMER, AUTUMN, WINTER)

_SEASONS = table("seasons", tuples="temp")
SEASON_NAMES = {row["id"]: row["name"] for row in _SEASONS}
SEASON_BASE_TEMPERATURE = {row["id"]: row["temp"] for row in _SEASONS}
UNSUITABLE_SEASON_MULTIPLIER = RULES["world"]["unsuitableSeasonMultiplier"]
WEATHER_DEFINITIONS = {row["id"]: row for row in table("weather")}
WEATHER_COLD_ALIAS = RULES["world"]["coldAlias"]
WEATHER_WEIGHTS = {row["season"]: row["weights"] for row in table("weather_weights", "season", "weights")}


@dataclass(frozen=True)
class CropDef:
    id: str
    name: str
    kind: str                                   # 水果 / 作物 / 蔬菜
    seasons: Tuple[str, ...]                    # 适宜季节
    temp: Tuple[float, float]                   # 适宜温度
    humidity: Tuple[float, float]               # Hmin, Hmax
    stage_minutes: Tuple[float, float, float]   # S1/S2/S3，统一 1/2/2
    fertility_consumption: float                # 肥力消耗/分钟，三阶段相同
    best_fertilizers: Tuple[str, str, str]      # (S1, S2, S3) 最佳肥料
    target_fertility: float
    base_price: int                             # 基础售价
    seed_price: int
    seed_item_id: str
    fruit_item_id: str
    seed_icon: str
    fruit_icon: str
    stage_icons: Tuple[str, str, str] = ("", "", "")


CROPS: Dict[str, CropDef] = definitions("crops", CropDef)

ITEMS: Dict[str, ItemDef] = {}
for _crop in CROPS.values():
    ITEMS[_crop.seed_item_id] = ItemDef(
        _crop.seed_item_id, f"{_crop.name}种子", _crop.seed_icon, SEED,
        _crop.seed_price, _crop.seed_price,
    )
    ITEMS[_crop.fruit_item_id] = ItemDef(
        _crop.fruit_item_id, _crop.name, _crop.fruit_icon, FRUIT, _crop.base_price,
    )


# --------------------------------------------------------------------------
# 肥料
# --------------------------------------------------------------------------

INORGANIC = "inorganic"
ORGANIC = "organic"


@dataclass(frozen=True)
class FertilizerDef:
    id: str
    name: str
    item_id: str
    type: str                 # inorganic / organic
    instant_fertility: float  # 无机：施用时立即增加
    total_fertility: float    # 有机：总量
    duration_minutes: float
    soil_health: float
    price: int

    @property
    def per_minute(self) -> float:
        """有机肥料每分钟释放量：TotalFertility / Duration。"""
        if self.duration_minutes <= 0:
            return 0.0
        return self.total_fertility / self.duration_minutes


FERTILIZERS: Dict[str, FertilizerDef] = definitions("fertilizers", FertilizerDef)
for _fert in FERTILIZERS.values():
    ITEMS[_fert.item_id] = ItemDef(
        _fert.item_id, _fert.name, _fert.item_id, FERT,
        max(1, _fert.price // 2), _fert.price, int(_fert.instant_fertility or _fert.total_fertility),
    )


# --------------------------------------------------------------------------
# 药品
# --------------------------------------------------------------------------

PEST = "pest"
DISEASE = "disease"


@dataclass(frozen=True)
class MedicineDef:
    id: str
    name: str
    item_id: str
    target: str           # pest / disease
    power: float          # 一次性降低的等级
    per_minute: bool      # True：每分钟持续降低
    duration_minutes: float
    price: int


MEDICINES: Dict[str, MedicineDef] = definitions("medicines", MedicineDef)
for _med in MEDICINES.values():
    ITEMS[_med.item_id] = ItemDef(
        _med.item_id, _med.name, _med.item_id, MEDICINE,
        max(1, _med.price // 2), _med.price, int(_med.power),
    )

SHOP_ITEMS = {item_id: item for item_id, item in ITEMS.items() if item.price is not None}


# --------------------------------------------------------------------------
# 土地解锁与全局规则
# --------------------------------------------------------------------------

LAND_UNLOCK = table("land_unlock", "")
LAND_RULES = {**RULES["land"], "unlock": LAND_UNLOCK}
PLOTS_PER_LEVEL = LAND_RULES["plotsPerRow"]
GROWTH_RULES = RULES["growth"]
_EVENT_LEVELS = table("event_levels", "")
EVENT_LEVEL_CURVE = [(r["start"], r["end"], r["rate"]) for r in _EVENT_LEVELS]
EVENT_LEVEL_BASE = [(r["start"], r["base"]) for r in _EVENT_LEVELS]
_EVENT_GROWTH = table("event_growth", "target")
PEST_GROWTH_TABLE = [(r["min"], r["max"], r["multiplier"]) for r in _EVENT_GROWTH if r["target"] == PEST]
DISEASE_GROWTH_TABLE = [(r["min"], r["max"], r["multiplier"]) for r in _EVENT_GROWTH if r["target"] == DISEASE]
QUALITY_GRADES = [(r["min"], r["max"], r["name"], r["multiplier"]) for r in table("quality_grades", "name")]
REGIONS = RULES["login"]["regions"]
# 表格改动自动改变版本，客户端不会误用上一次的配置镜像。
CATALOG_VERSION = "v1.10.csv." + hashlib.sha256(
    b"".join(path.name.encode() + path.read_bytes() for path in sorted(DATA_DIR.glob("*.csv")))
).hexdigest()[:12]


def validate_catalog() -> None:
    if set(SEASON_NAMES) != set(ALL_SEASONS) or set(WEATHER_WEIGHTS) != set(ALL_SEASONS):
        raise ValueError("seasons/weights must cover all four seasons")
    for crop in CROPS.values():
        if (len(crop.stage_minutes) != 3 or min(crop.stage_minutes) <= 0
                or len(crop.stage_icons) != 3 or len(crop.best_fertilizers) != 3
                or not set(crop.seasons) <= set(ALL_SEASONS)
                or not set(crop.best_fertilizers) <= FERTILIZERS.keys()
                or len(crop.temp) != 2 or crop.temp[0] > crop.temp[1]
                or len(crop.humidity) != 2 or not 0 <= crop.humidity[0] <= crop.humidity[1] <= 100
                or not 0 <= crop.target_fertility <= 100 or min(crop.seed_price, crop.base_price) < 0):
            raise ValueError(f"invalid crop: {crop.id}")
    for fert in FERTILIZERS.values():
        if fert.type not in (INORGANIC, ORGANIC) or min(fert.price, fert.duration_minutes) < 0:
            raise ValueError(f"invalid fertilizer: {fert.id}")
    for med in MEDICINES.values():
        if med.target not in (PEST, DISEASE) or type(med.per_minute) is not bool or min(med.price, med.duration_minutes, med.power) < 0:
            raise ValueError(f"invalid medicine: {med.id}")
    if (LAND_RULES["rows"] * LAND_RULES["plotsPerRow"] != LAND_RULES["totalPlots"]
            or [r["index"] for r in LAND_UNLOCK] != list(range(1, LAND_RULES["totalPlots"] + 1))
            or any(r["price"] < 0 or r["minLevel"] < 1 for r in LAND_UNLOCK)):
        raise ValueError("invalid land layout/unlock table")
    for weights in WEATHER_WEIGHTS.values():
        if not weights or any(key not in WEATHER_DEFINITIONS or weight < 0 for key, weight in weights) or sum(w for _, w in weights) <= 0:
            raise ValueError("invalid weather weights")
    if any(key not in ITEMS or type(count) is not int or count < 0 for key, count in RULES["initial"]["inventory"].items()):
        raise ValueError("invalid initial inventory")


validate_catalog()


# --------------------------------------------------------------------------
# 查询辅助
# --------------------------------------------------------------------------

def fertilizer_by_item(item_id: str) -> FertilizerDef | None:
    return FERTILIZERS.get(item_id[5:]) if item_id.startswith("fert_") else None


def medicine_by_item(item_id: str) -> MedicineDef | None:
    return MEDICINES.get(item_id[4:]) if item_id.startswith("med_") else None


def fertilizer_amount(item_id: str) -> int:
    """兼容旧签名：返回该化肥的即时/总肥力，非化肥返回 0。"""
    fert = fertilizer_by_item(item_id)
    if not fert:
        return 0
    return int(fert.instant_fertility or fert.total_fertility)


def quality_grade(score: float) -> Tuple[str, float]:
    for low, high, name, multiplier in QUALITY_GRADES:
        if low <= score <= high:
            return name, multiplier
    return "不合格", 0.50


def growth_multiplier_for_level(level: float, table: List[Tuple[int, int, float]]) -> float:
    for low, high, value in table:
        if low <= level <= high:
            return value
    return 1.0


def event_level_for_age(age_minutes: float) -> float:
    """按 event_levels.csv 的事件持续时间曲线计算等级。"""
    for row in _EVENT_LEVELS:
        if age_minutes < row["end"]:
            return min(100.0, row["base"] + row["rate"] * (age_minutes - row["start"]))
    return 100.0


def plots_unlocked(level: int) -> int:
    """等级允许的**可解锁上限**（仍需逐块支付金币）。"""
    limit = int(LAND_RULES["initialUnlocked"])
    for row in LAND_UNLOCK:
        if row["minLevel"] <= max(1, int(level)):
            limit = row["index"]
    return limit


def exp_for_next_level(level: int) -> int:
    rule = LAND_RULES["level"]
    return int(rule["baseExp"] * (rule["expGrowth"] ** max(0, level - 1)) + 0.999999)


def crop_best_fertilizer_for_stage(crop: "CropDef", stage: int) -> str:
    """`最佳肥料` 永远按 (S1,S2,S3) 解释，按当前 Stage 取对应项。"""
    if not crop.best_fertilizers:
        return ""
    index = min(max(int(stage), 1), len(crop.best_fertilizers)) - 1
    return crop.best_fertilizers[index]


def land_unlock_row(plot_id: int) -> Dict[str, Any] | None:
    for row in LAND_UNLOCK:
        if row["index"] == plot_id:
            return row
    return None


# --------------------------------------------------------------------------
# 对外下发
# --------------------------------------------------------------------------

def _crop_json(crop: CropDef) -> Dict[str, Any]:
    return {
        "id": crop.id,
        "name": crop.name,
        "kind": crop.kind,
        "seasons": list(crop.seasons),
        "temp": list(crop.temp),
        "humidity": list(crop.humidity),
        "stageMinutes": list(crop.stage_minutes),
        "fertConsumption": crop.fertility_consumption,
        "bestFertilizers": list(crop.best_fertilizers),
        "targetFertility": crop.target_fertility,
        "basePrice": crop.base_price,
        "seedPrice": crop.seed_price,
        "seedItemId": crop.seed_item_id,
        "fruitItemId": crop.fruit_item_id,
        "seedIcon": crop.seed_icon,
        "fruitIcon": crop.fruit_icon,
        "stageIcons": list(crop.stage_icons),
    }


def _fertilizer_json(fert: FertilizerDef) -> Dict[str, Any]:
    return {
        "id": fert.id,
        "name": fert.name,
        "itemId": fert.item_id,
        "type": fert.type,
        "amount": fert.instant_fertility or fert.total_fertility,
        "perMinute": round(fert.per_minute, 4),
        "duration": fert.duration_minutes,
        "soilHealth": fert.soil_health,
        "price": fert.price,
    }


def _medicine_json(med: MedicineDef) -> Dict[str, Any]:
    return {
        "id": med.id,
        "name": med.name,
        "itemId": med.item_id,
        "target": med.target,
        "power": med.power,
        "perMinute": med.per_minute,
        "duration": med.duration_minutes,
        "price": med.price,
    }


def public_catalog() -> Dict[str, Any]:
    items = []
    for item in ITEMS.values():
        row = asdict(item)
        # 前端统一使用 camelCase；effect 对化肥/药品仅作为展示兜底。
        items.append(row)
    return {
        "version": CATALOG_VERSION,
        "regions": REGIONS,
        "items": items,
        "shopItems": [asdict(item) for item in SHOP_ITEMS.values()],
        "crops": [_crop_json(crop) for crop in CROPS.values()],
        "fertilizers": [_fertilizer_json(fert) for fert in FERTILIZERS.values()],
        "medicines": [_medicine_json(med) for med in MEDICINES.values()],
        "land": LAND_RULES,
        "growth": GROWTH_RULES,
        "seasons": [
            {"id": season, "name": SEASON_NAMES[season], "temp": list(SEASON_BASE_TEMPERATURE[season])}
            for season in ALL_SEASONS
        ],
        "weather": {"definitions": WEATHER_DEFINITIONS, "weights": WEATHER_WEIGHTS},
        "qualityGrades": [
            {"min": low, "max": high, "name": name, "multiplier": multiplier}
            for low, high, name, multiplier in QUALITY_GRADES
        ],
    }


def initial_inventory() -> Dict[str, int]:
    """正式新玩家初始物品。演示账号的额外数据由后端 seed 命令生成。"""
    return dict(RULES["initial"]["inventory"])
