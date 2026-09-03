"""服务端权威游戏配置（数值系统 v1.10）。

客户端只把这些数据用于展示；价格、奖励、成长时间和操作效果始终由服务端再次校验。
后续可把本模块替换为配置表/配置中心，但不要让客户端提交价格或奖励。

数值来源：`farm_game_value_system_final_v1.10.md`。
 - 时间单位统一为现实分钟（1 分钟 = 1 次服务器标准结算）。
 - 只使用单一 `Fertility`，N/P/K 不参与任何计算。
 - 基础成熟产量 BaseYield = 10。
 - 单块土地每天最多播种 3 次，单块土地每日净收益硬上限 100 金币。
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Dict, List, Tuple

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

SEASON_NAMES: Dict[str, str] = {
    SPRING: "春",
    SUMMER: "夏",
    AUTUMN: "秋",
    WINTER: "冬",
}

SEASON_BASE_TEMPERATURE: Dict[str, Tuple[int, int]] = {
    SPRING: (14, 22),
    SUMMER: (24, 32),
    AUTUMN: (16, 25),
    WINTER: (4, 12),
}

# 不适宜季节的成长倍率
UNSUITABLE_SEASON_MULTIPLIER = 0.85

# 天气（每天 00:00 重新随机基础温度；每 6 小时更新一次天气）
WEATHER_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    "sunny": {"id": "sunny", "name": "晴", "tempModifier": 2.0, "humidityModifier": 1.5,
              "pestRisk": 0.0001, "diseaseRisk": -0.0001},
    "cloudy": {"id": "cloudy", "name": "多云", "tempModifier": 0.0, "humidityModifier": 1.2,
               "pestRisk": 0.0, "diseaseRisk": 0.0},
    "rain": {"id": "rain", "name": "小雨", "tempModifier": -1.0, "humidityModifier": -1.5,
             "pestRisk": -0.0002, "diseaseRisk": 0.0002},
    "storm": {"id": "storm", "name": "暴雨", "tempModifier": -3.0, "humidityModifier": -2.0,
              "pestRisk": 0.0003, "diseaseRisk": 0.0005},
    "drought": {"id": "drought", "name": "干旱", "tempModifier": 3.0, "humidityModifier": 2.0,
                "pestRisk": 0.0003, "diseaseRisk": 0.0001},
}

# 实际温度低于 0℃ 时的显示替换（不改变数值）
WEATHER_COLD_ALIAS = {"rain": "小雪", "storm": "暴雪"}

WEATHER_WEIGHTS: Dict[str, List[Tuple[str, float]]] = {
    SPRING: [("sunny", 35), ("cloudy", 40), ("rain", 20), ("storm", 3), ("drought", 2)],
    SUMMER: [("sunny", 30), ("cloudy", 25), ("rain", 22), ("storm", 18), ("drought", 5)],
    AUTUMN: [("sunny", 45), ("cloudy", 35), ("rain", 15), ("storm", 2), ("drought", 3)],
    WINTER: [("sunny", 50), ("cloudy", 38), ("rain", 10), ("storm", 1), ("drought", 1)],
}


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


# ID, 中文, 类型, 季节, 温度, 湿度, 肥力消耗/分钟, 最佳肥料(S1,S2,S3), 目标肥力, 基础售价, 种子价
_CROP_ROWS: List[Tuple[Any, ...]] = [
    ("longan", "龙眼", "水果", (SUMMER,), (25, 32), (65, 80), 1.6,
     ("compost", "npk_15", "potassium_sulfate"), 70, 3, 12),
    ("lemon", "柠檬", "水果", (SPRING, SUMMER), (18, 28), (55, 75), 1.5,
     ("compost", "npk_15", "potassium_sulfate"), 68, 3, 10),
    ("mango", "芒果", "水果", (SUMMER,), (25, 32), (60, 85), 1.7,
     ("chicken_manure", "npk_15", "potassium_compound"), 70, 3, 13),
    ("peach", "桃子", "水果", (SPRING,), (15, 25), (55, 75), 1.5,
     ("compost", "super_phosphate", "potassium_compound"), 68, 3, 10),
    ("carambola", "杨桃", "水果", (SUMMER, AUTUMN), (20, 32), (60, 80), 1.5,
     ("compost", "npk_15", "potassium_sulfate"), 68, 3, 10),
    ("kiwi", "猕猴桃", "水果", (AUTUMN,), (15, 22), (65, 85), 1.7,
     ("compost", "npk_15", "potassium_compound"), 68, 3, 14),
    ("watermelon", "西瓜", "水果", (SUMMER,), (25, 32), (55, 75), 1.6,
     ("urea", "phosphate_fertilizer", "potassium_sulfate"), 70, 3, 14),
    ("grape", "葡萄", "水果", (SUMMER, AUTUMN), (20, 28), (55, 75), 1.5,
     ("chicken_manure", "npk_15", "potassium_compound"), 68, 3, 9),
    ("orange", "橙子", "水果", (AUTUMN, WINTER), (18, 30), (55, 80), 1.6,
     ("compost", "npk_15", "potassium_sulfate"), 68, 3, 11),
    ("pitaya", "火龙果", "水果", (SUMMER,), (25, 32), (50, 70), 1.7,
     ("chicken_manure", "npk_15", "potassium_compound"), 68, 3, 14),
    ("strawberry", "草莓", "水果", (SPRING, WINTER), (12, 22), (60, 85), 1.4,
     ("urea", "water_soluble", "potassium_compound"), 68, 3, 14),
    ("sunflower", "向日葵", "作物", (SUMMER,), (18, 28), (40, 60), 1.4,
     ("urea", "npk_15", "potassium_sulfate"), 65, 2, 7),
    ("pumpkin", "南瓜", "蔬菜", (SUMMER, AUTUMN), (20, 30), (55, 75), 1.6,
     ("chicken_manure", "npk_15", "potassium_compound"), 70, 3, 11),
    ("lettuce", "生菜", "蔬菜", (SPRING, AUTUMN), (10, 20), (60, 85), 1.3,
     ("urea", "npk_15", "water_soluble"), 70, 2, 7),
    ("eggplant", "茄子", "蔬菜", (SUMMER,), (22, 32), (60, 80), 1.5,
     ("chicken_manure", "npk_15", "potassium_compound"), 70, 3, 9),
    ("pea", "豌豆", "蔬菜", (SPRING, AUTUMN), (15, 22), (50, 70), 1.4,
     ("super_phosphate", "super_phosphate", "phosphate_fertilizer"), 65, 2, 7),
    ("shallot", "小葱", "蔬菜", ALL_SEASONS, (15, 25), (55, 75), 1.2,
     ("urea", "nitrogen_compound", "water_soluble"), 70, 2, 6),
    ("maize", "玉米", "蔬菜", (SUMMER,), (20, 30), (50, 70), 1.4,
     ("urea", "npk_15", "potassium_sulfate"), 70, 2, 7),
    ("kangkong", "空心菜", "蔬菜", (SUMMER,), (25, 32), (70, 90), 1.2,
     ("urea", "water_soluble", "compost"), 70, 2, 6),
    ("carrot", "胡萝卜", "蔬菜", (SPRING, AUTUMN), (15, 22), (50, 70), 1.4,
     ("super_phosphate", "npk_15", "potassium_compound"), 65, 2, 7),
    ("garlic", "大蒜", "蔬菜", (AUTUMN, WINTER), (10, 20), (50, 70), 1.5,
     ("compost", "npk_15", "potassium_sulfate"), 68, 2, 7),
    ("cabbage", "卷心菜", "蔬菜", (AUTUMN, WINTER), (12, 22), (60, 80), 1.4,
     ("chicken_manure", "npk_15", "calcium_fertilizer"), 70, 2, 7),
    ("pepper", "辣椒", "蔬菜", (SUMMER,), (22, 32), (55, 75), 1.5,
     ("chicken_manure", "phosphate_fertilizer", "potassium_compound"), 70, 3, 9),
    ("tomato", "西红柿", "蔬菜", (SUMMER,), (20, 30), (60, 80), 1.4,
     ("chicken_manure", "npk_15", "potassium_compound"), 70, 3, 9),
]

CROPS: Dict[str, CropDef] = {}
for _row in _CROP_ROWS:
    _id = _row[0]
    CROPS[_id] = CropDef(
        id=_id,
        name=_row[1],
        kind=_row[2],
        seasons=tuple(_row[3]),
        temp=(float(_row[4][0]), float(_row[4][1])),
        humidity=(float(_row[5][0]), float(_row[5][1])),
        stage_minutes=(1.0, 2.0, 2.0),
        fertility_consumption=float(_row[6]),
        best_fertilizers=tuple(_row[7]),  # type: ignore[arg-type]
        target_fertility=float(_row[8]),
        base_price=int(_row[9]),
        seed_price=int(_row[10]),
        seed_item_id=f"seed_{_id}",
        fruit_item_id=f"fruit_{_id}",
        seed_icon=f"seed_{_id}",
        fruit_icon=f"fruit_{_id}",
        stage_icons=(f"{_id}-01", f"{_id}-02", f"{_id}-03"),
    )

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


# id, 名称, 类型, 即时/总肥力, 持续时间(分钟), 土壤健康, 价格
_FERTILIZER_ROWS: List[Tuple[Any, ...]] = [
    ("urea", "尿素", INORGANIC, 5, 30, 0, 1),
    ("nitrogen_compound", "氮磷复合肥", INORGANIC, 6, 30, 0, 2),
    ("super_phosphate", "过磷酸钙", INORGANIC, 5, 30, 0, 1),
    ("phosphate_fertilizer", "高磷肥", INORGANIC, 6, 30, 0, 2),
    ("potassium_sulfate", "硫酸钾", INORGANIC, 6, 30, 0, 2),
    ("potassium_compound", "高钾复合肥", INORGANIC, 8, 30, 0, 3),
    ("npk_15", "复合肥15-15-15", INORGANIC, 6, 30, 0, 2),
    ("water_soluble", "水溶肥", INORGANIC, 7, 30, 0, 2),
    ("calcium_fertilizer", "硝酸钙", INORGANIC, 4, 30, 0, 1),
    ("compost", "堆肥", ORGANIC, 5, 5, 1, 1),
    ("chicken_manure", "鸡粪肥", ORGANIC, 6, 4, 1, 2),
    ("slow_release", "缓释有机肥", ORGANIC, 8, 8, 2, 3),
]

FERTILIZERS: Dict[str, FertilizerDef] = {}
for _fid, _fname, _ftype, _amount, _duration, _soil, _price in _FERTILIZER_ROWS:
    FERTILIZERS[_fid] = FertilizerDef(
        id=_fid,
        name=_fname,
        item_id=f"fert_{_fid}",
        type=_ftype,
        instant_fertility=float(_amount) if _ftype == INORGANIC else 0.0,
        total_fertility=float(_amount) if _ftype == ORGANIC else 0.0,
        duration_minutes=float(_duration),
        soil_health=float(_soil),
        price=int(_price),
    )
    ITEMS[f"fert_{_fid}"] = ItemDef(
        f"fert_{_fid}", _fname, f"fert_{_fid}", FERT,
        max(1, int(_price // 2)), _price, int(_amount),
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


# id, 名称, 目标, 效果, 是否每分钟, 持续时间(分钟), 价格
_MEDICINE_ROWS: List[Tuple[Any, ...]] = [
    ("insecticide_basic", "普通杀虫剂", PEST, 40, False, 7, 3),
    ("insecticide_advanced", "高级杀虫剂", PEST, 70, False, 15, 5),
    ("bio_agent", "生物菌剂", PEST, 30, False, 15, 4),
    ("pest_repellent", "驱虫植物", PEST, 10, True, 30, 4),
    ("fungicide_basic", "普通杀菌剂", DISEASE, 40, False, 7, 3),
    ("fungicide_advanced", "高级杀菌剂", DISEASE, 70, False, 15, 6),
]

MEDICINES: Dict[str, MedicineDef] = {}
for _mid, _mname, _target, _power, _per_minute, _duration, _price in _MEDICINE_ROWS:
    MEDICINES[_mid] = MedicineDef(
        id=_mid,
        name=_mname,
        item_id=f"med_{_mid}",
        target=_target,
        power=float(_power),
        per_minute=bool(_per_minute),
        duration_minutes=float(_duration),
        price=int(_price),
    )
    ITEMS[f"med_{_mid}"] = ItemDef(
        f"med_{_mid}", _mname, f"med_{_mid}", MEDICINE,
        max(1, int(_price // 2)), _price, int(_power),
    )

SHOP_ITEMS = {item_id: item for item_id, item in ITEMS.items() if item.price is not None}


# --------------------------------------------------------------------------
# 土地解锁与全局规则
# --------------------------------------------------------------------------

# 土地价格表（文档 3.3）。
_LAND_PRICES: List[int] = [
    0, 50, 150, 300, 500, 800, 1200, 1800, 2600, 3600, 5000, 7000,
    9500, 12500, 16500, 21500, 27500, 35000, 44000, 55000, 68000, 83000, 100000, 120000,
]

# minLevel 为附加的等级门槛（与金币同时满足才能解锁）。
# 场景里每行 6 块地（lands_1…lands_4），因此按行开放：1 级可解锁第 1 行，2 级第 2 行……
# 该值必须与 LAND_RULES.plotsPerRow 保持一致（改这里请一起改下面）。
PLOTS_PER_LEVEL = 6

LAND_UNLOCK: List[Dict[str, Any]] = [
    {"index": index + 1, "price": price, "minLevel": (index // PLOTS_PER_LEVEL) + 1}
    for index, price in enumerate(_LAND_PRICES)
]

LAND_RULES: Dict[str, Any] = {
    "totalPlots": 24,
    "plotsPerRow": 6,
    "rows": 4,
    "initialUnlocked": 1,
    "initialFertility": 70,
    "initialSoilHealth": 70,
    "initialMoisture": 70,
    "unlock": LAND_UNLOCK,
    # ---- v1.10 数值（前端只用于展示/提示，校验仍在服务端）----
    "dailyPlantLimit": 3,
    "waterPerUse": 5,
    "waterMaxTimes": 10,
    "moistureDrainPerHour": 6,
    "dailyNetIncomeCap": 100,
    # 缺肥 / 缺水提示阈值：低于目标 10 点显示缺肥（可在 Cocos 端用同一数值绘制区间）
    "fertilityAlertGap": 10,
    "moistureAlertGap": 10,
    "level": {"baseExp": 100, "expGrowth": 1.25, "maxLevel": 24},
}

GROWTH_RULES: Dict[str, Any] = {
    "minuteMs": 60000,
    "stageBaseDivisor": 1.20,          # BaseGrowthPerMinute = 100 / (阶段分钟 × 1.20)
    # 固定成长倍率下限。文档给的是 0.042（按 5/0.042=119.05 分钟推算），但按 v1.10
    # 的阶段 1/2/2 与 ×1.20 系数，满速基准其实是 6.0 分钟（100/(1×1.2)+100/(2×1.2)×2），
    # 6.0/0.042 = 142.9 分钟会突破“最大成熟时间 ≤ 120 分钟”的验收标准。
    # 因此取 6.0/120 = 0.05：最差环境恰好 120 分钟成熟，5/6 分钟的正常体验不变。
    "minGrowthMultiplier": 0.05,
    "minEnvironmentMultiplier": 0.20,  # 单环境倍率下限
    "minFertilityHighMultiplier": 0.85,
    "baseYield": 10,
    "initialQuality": 60,
    "qualityWindowMinutes": 5,
    "baseQualityGainPerMinute": 8,
    "bestFertilizerMultiplier": 1.20,
    "bestFertilizerQualityGain": 0.10,
    "temperaturePenaltyPerDegree": 0.05,
    "humidityPenaltyPerPoint": 0.02,
    "fertilityTargetBand": 0.10,
    "fertilityHighPenaltyFactor": 1.5,
    "temperatureQualityPenalty": {"perDegree": 0.02, "max": 0.20},
    "humidityQualityPenalty": {"perPoint": 0.01, "max": 0.15},
    "fertilityQualityPenalty": 0.50,
    "onsetQualityDamage": 2.5,
    "pestQualityDamagePerMinute": 0.80,
    "diseaseQualityDamagePerMinute": 1.00,
    "pestYieldPenalty": 0.25,
    "diseaseYieldPenalty": 0.30,
    "minYieldMultiplier": 0.20,
    "harvestSoilHealthCost": 2,
    "pestBaseChance": 0.0002,       # 0.02%/分钟
    "diseaseBaseChance": 0.0002,
    "maxAppearChance": 0.0015,      # 0.15%/分钟
    "riskPerTemperatureStep": 0.0001,   # 每偏离 5℃
    "riskPerHumidityStep": 0.0001,      # 每偏离 10 个百分点
    "riskSoilHealthLow": 0.0001,        # SoilHealth < 60
    "riskSoilHealthCritical": 0.0001,   # SoilHealth < 40 追加（病害再 +0.01%）
    "initialCoins": 100,
}

# 事件等级随持续时间升级：Level = 10 + 2 × AgeMinutes …
EVENT_LEVEL_CURVE: List[Tuple[float, float, float]] = [
    (0, 5, 2.0),
    (5, 10, 4.0),
    (10, 30, 1.25),
    (30, 60, 0.67),
    (60, 90, 0.5),
]
EVENT_LEVEL_BASE: List[Tuple[float, float]] = [(0, 10), (5, 20), (10, 40), (30, 65), (60, 85)]

# 病虫害成长倍率（按等级区间）
PEST_GROWTH_TABLE: List[Tuple[int, int, float]] = [
    (0, 20, 0.98), (21, 40, 0.95), (41, 65, 0.90), (66, 85, 0.80), (86, 100, 0.65),
]
DISEASE_GROWTH_TABLE: List[Tuple[int, int, float]] = [
    (0, 20, 0.97), (21, 40, 0.93), (41, 65, 0.88), (66, 85, 0.78), (86, 100, 0.60),
]

# 品质档位
QUALITY_GRADES: List[Tuple[int, int, str, float]] = [
    (90, 100, "精品", 1.20),
    (75, 89, "优良", 1.05),
    (60, 74, "普通", 1.00),
    (40, 59, "合格", 0.75),
    (0, 39, "不合格", 0.50),
]

REGIONS = ["大区一 · 电信", "大区二 · 网通", "大区三 · 移动"]
CATALOG_VERSION = "2026.09.03.v1.10"


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
    """按事件持续时间计算等级（文档第九章曲线）。"""
    if age_minutes >= 90:
        return 100.0
    if age_minutes < 5:
        return min(100.0, 10 + 2.0 * age_minutes)
    if age_minutes < 10:
        return min(100.0, 20 + 4.0 * (age_minutes - 5))
    if age_minutes < 30:
        return min(100.0, 40 + 1.25 * (age_minutes - 10))
    if age_minutes < 60:
        return min(100.0, 65 + 0.67 * (age_minutes - 30))
    return min(100.0, 85 + 0.5 * (age_minutes - 60))


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
    return {"seed_shallot": 3, "seed_lettuce": 3, "fert_compost": 2}
