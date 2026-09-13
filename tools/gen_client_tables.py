#!/usr/bin/env python3
"""从服务端配置表 `backend/app/domain/catalog.py` 生成客户端 CSV 配置表。

客户端（`frontend/resources/datas/*.csv`）只需要**静态定义**用于显示，
所有价格、扣费、成长与奖励仍以服务端命令结果为准。为了避免两边数值漂移，
本脚本直接把服务端 catalog 导出成表格；改了服务端配置就跑一次：

    python tools/gen_client_tables.py

生成结果为 UTF-8 + BOM（Excel 双击不乱码）、LF 换行。
"""
from __future__ import annotations

import csv
import importlib.util
import sys
from pathlib import Path
from typing import Any, Dict, List, Sequence

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "backend" / "app" / "domain" / "catalog.py"
OUT_DIR = ROOT / "frontend" / "resources" / "datas"

SEASON_ID_TO_NAME = {"spring": "春", "summer": "夏", "autumn": "秋", "winter": "冬"}
WEIGHT_SUFFIX = {"inorganic": "无机", "organic": "有机"}


def load_catalog():
    spec = importlib.util.spec_from_file_location("farm_catalog", CATALOG_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclass 需要在 sys.modules 里找宿主模块
    spec.loader.exec_module(module)
    return module


def fmt(value: Any) -> str:
    """数值去掉多余的 .0，保持表格干净（10.0 -> 10，1.6 -> 1.6）。"""
    if isinstance(value, float):
        text = f"{value:g}"
        return text
    return str(value)


def pair(values: Sequence[Any]) -> str:
    return f"({fmt(values[0])},{fmt(values[1])})"


def write(name: str, header: List[str], rows: List[List[str]]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)
    print(f"wrote {path.relative_to(ROOT)} ({len(rows)} rows)")


# --------------------------------------------------------------------------
# 各表
# --------------------------------------------------------------------------

def crop_table(catalog) -> None:
    header = [
        "ID", "名称", "类型", "季节", "温度", "湿度",
        "S1分钟", "S2分钟", "S3分钟", "肥力消耗", "目标肥力",
        "最佳肥料", "基础售价", "种子价",
    ]
    rows = []
    for crop in catalog.CROPS.values():
        seasons = "".join(SEASON_ID_TO_NAME[s] for s in crop.seasons)
        if len(crop.seasons) == len(catalog.ALL_SEASONS):
            seasons = "全年"
        rows.append([
            crop.id, crop.name, crop.kind, seasons,
            pair(crop.temp), pair(crop.humidity),
            *(fmt(minutes) for minutes in crop.stage_minutes),
            fmt(crop.fertility_consumption), fmt(crop.target_fertility),
            "|".join(crop.best_fertilizers),
            str(crop.base_price), str(crop.seed_price),
        ])
    write("Crop_Data.csv", header, rows)


def fertilizer_table(catalog, remarks: Dict[str, str]) -> None:
    header = ["ID", "名称", "类型", "肥力", "持续分钟",
              "每分钟释放", "土壤健康", "价格", "说明"]
    rows = []
    for fert in catalog.FERTILIZERS.values():
        rows.append([
            fert.id, fert.name, WEIGHT_SUFFIX.get(fert.type, fert.type),
            fmt(fert.instant_fertility or fert.total_fertility), fmt(fert.duration_minutes),
            fmt(round(fert.per_minute, 4)), fmt(fert.soil_health), str(fert.price),
            remarks.get(fert.id, ""),
        ])
    write("Fertilizer_Data.csv", header, rows)


def medicine_table(catalog) -> None:
    header = ["ID", "名称", "目标", "威力", "每分钟", "持续分钟", "价格", "说明"]
    rows = []
    for med in catalog.MEDICINES.values():
        target = "害虫" if med.target == catalog.PEST else "病害"
        kind = "每分钟" if med.per_minute else "一次性"
        rows.append([
            med.id, med.name, target, fmt(med.power), "是" if med.per_minute else "否",
            fmt(med.duration_minutes), str(med.price),
            f"{kind}降低{target} {fmt(med.power)} 点，持续 {fmt(med.duration_minutes)} 分钟",
        ])
    write("Medicine_Data.csv", header, rows)


def land_table(catalog) -> None:
    header = ["ID", "解锁金币", "解锁等级"]
    rows = [[str(row["index"]), str(row["price"]), str(row["minLevel"])]
            for row in catalog.LAND_UNLOCK]
    write("Land_Data.csv", header, rows)


def rule_table(catalog) -> None:
    header = ["参数", "值", "说明"]
    land, growth, level = catalog.LAND_RULES, catalog.GROWTH_RULES, catalog.LAND_RULES["level"]
    rows = [
        ("totalPlots", land["totalPlots"], "土地总数（lands_1…lands_N × 每行块数）"),
        ("plotsPerRow", land["plotsPerRow"], "每行土地块数，也是同一列土块图片的张数"),
        ("rows", land["rows"], "土地行数"),
        ("initialUnlocked", land["initialUnlocked"], "新号默认解锁块数"),
        ("initialFertility", land["initialFertility"], "初始肥力（仅兜底显示）"),
        ("initialSoilHealth", land["initialSoilHealth"], "初始土壤健康（仅兜底显示）"),
        ("initialMoisture", land["initialMoisture"], "初始湿度（仅兜底显示）"),
        ("dailyPlantLimit", land["dailyPlantLimit"], "每块地每天最多播种次数"),
        ("waterPerUse", land["waterPerUse"], "单次浇水增加的湿度"),
        ("waterMaxTimes", land["waterMaxTimes"], "浇水一次可提交的最大次数"),
        ("moistureDrainPerHour", land["moistureDrainPerHour"],
         "自然失水（湿度/小时），用于两次快照间的平滑显示"),
        ("dailyNetIncomeCap", land["dailyNetIncomeCap"], "单块地每日净收益上限（金币）"),
        ("soilAlertGap", land["fertilityAlertGap"],
         "土块换图阈值：低于作物需求这么多点时切成缺水/缺肥图"),
        ("baseYield", growth["baseYield"], "基础成熟产量"),
        ("initialQuality", growth["initialQuality"], "初始品质"),
        ("stageBaseDivisor", growth["stageBaseDivisor"], "阶段时长系数（预计剩余时间用）"),
        ("baseExp", level["baseExp"], "1 级升到 2 级所需经验"),
        ("expGrowth", level["expGrowth"], "每级经验增长倍率"),
        ("maxLevel", level["maxLevel"], "等级上限"),
        ("initialCoins", growth["initialCoins"], "新号初始金币"),
    ]
    write("Game_Rule.csv", header, [[key, fmt(value), note] for key, value, note in rows])


def season_table(catalog) -> None:
    header = ["ID", "名称", "温度"]
    rows = [[season, catalog.SEASON_NAMES[season], pair(catalog.SEASON_BASE_TEMPERATURE[season])]
            for season in catalog.ALL_SEASONS]
    write("Season_Data.csv", header, rows)


def weather_table(catalog) -> None:
    header = ["ID", "名称", "温度修正", "湿度修正", "害虫风险", "病害风险"]
    rows = []
    for key, definition in catalog.WEATHER_DEFINITIONS.items():
        rows.append([key, definition["name"], fmt(definition["tempModifier"]),
                     fmt(definition["humidityModifier"]), fmt(definition["pestRisk"]),
                     fmt(definition["diseaseRisk"])])
    write("Weather_Data.csv", header, rows)


def soil_table() -> None:
    """土块显示态 → 贴图。缺肥 / 缺水不再做动画，只换 soil 的图。"""
    header = ["状态", "名称", "后缀", "贴图", "判定"]
    pattern = "farm/lands_{state}1/locked_{col}{state}/spriteFrame"
    rows = [
        ["normal", "正常", "a", pattern, "默认：湿度与肥力都不低于作物需求 - soilAlertGap"],
        ["locked", "未解锁", "b", pattern, "plot.unlocked == false"],
        ["lowfert", "缺肥", "c", pattern, "有作物且 肥力 < 目标肥力 - soilAlertGap"],
        ["dry", "缺水", "d", pattern, "有作物且 湿度 < 作物湿度下限 - soilAlertGap"],
    ]
    write("Soil_Data.csv", header, rows)


def quality_table(catalog) -> None:
    header = ["下限", "上限", "档位", "倍率"]
    rows = [[str(low), str(high), name, fmt(multiplier)]
            for low, high, name, multiplier in catalog.QUALITY_GRADES]
    write("Quality_Data.csv", header, rows)


def fertilizer_remarks() -> Dict[str, str]:
    """肥料效果说明：沿用策划表文案，只保留服务端确实存在的肥料 id。"""
    return {
    "urea": "快速补氮，促进叶片和茎生长，适合生菜、空心菜、小葱等叶菜",
    "nitrogen_compound": "同时提供氮磷，适合番茄、辣椒苗期",
    "super_phosphate": "促进根系和花芽形成",
    "phosphate_fertilizer": "促进开花，提高结果概率",
    "potassium_sulfate": "促进果实膨大，提高甜度和品质",
    "potassium_compound": "果实类作物后期最佳肥料",
    "npk_15": "最通用肥料，一次施用覆盖完整周期",
    "water_soluble": "快速吸收，适合大棚和紧急补肥",
    "calcium_fertilizer": "减少裂果，提高果实质量",
    "compost": "最稳定基础肥，提高土地肥力",
    "chicken_manure": "氮含量高，促进植株快速生长，适合瓜果类前期",
    "slow_release": "一次施肥覆盖完整成长周期",
    }


def main() -> int:
    catalog = load_catalog()
    crop_table(catalog)
    fertilizer_table(catalog, fertilizer_remarks())
    medicine_table(catalog)
    land_table(catalog)
    rule_table(catalog)
    season_table(catalog)
    weather_table(catalog)
    soil_table()
    quality_table(catalog)
    return 0


if __name__ == "__main__":
    sys.exit(main())
