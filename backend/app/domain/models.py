"""领域数据结构（v1.10）。

只保存服务端权威状态；客户端快照由 `serialization.py` 投影生成。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class InventoryEntry:
    item_id: str
    count: int
    acquired_at_ms: int


@dataclass
class ActiveFertilizer:
    """土地上的有效肥料（无机：立即生效 + 有效状态；有机：按分钟释放）。"""

    fertilizer_id: str
    remaining_minutes: float
    per_minute: float = 0.0

    def to_dict(self) -> Dict[str, object]:
        return {
            "fertilizerId": self.fertilizer_id,
            "remainingMinutes": round(self.remaining_minutes, 3),
            "perMinute": round(self.per_minute, 4),
        }

    @staticmethod
    def from_dict(row: Dict[str, object]) -> "ActiveFertilizer":
        return ActiveFertilizer(
            fertilizer_id=str(row.get("fertilizerId", "")),
            remaining_minutes=float(row.get("remainingMinutes", 0) or 0),
            per_minute=float(row.get("perMinute", 0) or 0),
        )


@dataclass
class ActiveMedicine:
    medicine_id: str
    remaining_minutes: float

    def to_dict(self) -> Dict[str, object]:
        return {
            "medicineId": self.medicine_id,
            "remainingMinutes": round(self.remaining_minutes, 3),
        }

    @staticmethod
    def from_dict(row: Dict[str, object]) -> "ActiveMedicine":
        return ActiveMedicine(
            medicine_id=str(row.get("medicineId", "")),
            remaining_minutes=float(row.get("remainingMinutes", 0) or 0),
        )


@dataclass
class Plot:
    """单块土地。字段与文档 3.1 一致。"""

    id: int
    unlocked: bool = False

    # 土地长期状态
    fertility: float = 70.0
    soil_health: float = 70.0
    moisture: float = 70.0

    # 作物
    crop_id: Optional[str] = None
    stage: int = 0                 # 1~3，0 表示空地
    stage_growth: float = 0.0      # 0~100
    plant_age_minutes: float = 0.0
    mature: bool = False

    # 病虫害 / 杂草
    pest_level: float = 0.0
    disease_level: float = 0.0
    grass_level: float = 0.0
    pest_status: str = "NONE"      # NONE / ACTIVE
    disease_status: str = "NONE"
    grass_status: str = "NONE"     # NONE / ACTIVE
    pest_onset_ms: Optional[int] = None
    disease_onset_ms: Optional[int] = None
    grass_onset_ms: Optional[int] = None

    # 生效中的肥料 / 药品
    active_fertilizers: List[ActiveFertilizer] = field(default_factory=list)
    active_medicines: List[ActiveMedicine] = field(default_factory=list)

    # 品质与产量
    quality_score: float = 60.0
    mature_yield: int = 0
    harvest_quantity: int = 0

    # 每日统计
    daily_plant_count: int = 0
    daily_net_income: float = 0.0

    # ---- 兼容旧存档 ----
    developed: bool = False
    progress: float = 0.0
    planted_at_ms: int = 0
    harvestable: bool = False
    last_boost_key: str = ""
    last_watered_at_ms: int = 0

    def reset_cycle(self) -> None:
        """清除本轮作物相关的全部临时数据（文档 13.2）。土地长期状态保留。"""
        self.crop_id = None
        self.stage = 0
        self.stage_growth = 0.0
        self.plant_age_minutes = 0.0
        self.mature = False
        self.pest_level = 0.0
        self.disease_level = 0.0
        self.grass_level = 0.0
        self.pest_status = "NONE"
        self.disease_status = "NONE"
        self.grass_status = "NONE"
        self.pest_onset_ms = None
        self.disease_onset_ms = None
        self.grass_onset_ms = None
        self.active_fertilizers = []
        self.active_medicines = []
        self.quality_score = 60.0
        self.mature_yield = 0
        self.harvest_quantity = 0
        # 兼容字段
        self.progress = 0.0
        self.planted_at_ms = 0
        self.harvestable = False
        self.last_boost_key = ""

    def total_growth(self) -> float:
        """三阶段累计成长值 0~300，用于前端总进度条。"""
        return (max(0, self.stage) - 1) * 100.0 + self.stage_growth


@dataclass
class DailyEconomy:
    """当天的经济统计（文档 14）。跨天由引擎清零。"""

    day_index: int = 0
    seed_cost: int = 0
    fertilizer_cost: int = 0
    medicine_cost: int = 0
    land_unlock_cost: int = 0
    gross_income: int = 0
    plant_count: int = 0
    harvest_count: int = 0

    @property
    def net_income(self) -> int:
        return self.gross_income - self.seed_cost - self.fertilizer_cost - self.medicine_cost

    def to_dict(self) -> Dict[str, object]:
        return {
            "dayIndex": self.day_index,
            "seedCost": self.seed_cost,
            "fertilizerCost": self.fertilizer_cost,
            "medicineCost": self.medicine_cost,
            "landUnlockCost": self.land_unlock_cost,
            "grossIncome": self.gross_income,
            "netIncome": self.net_income,
            "plantCount": self.plant_count,
            "harvestCount": self.harvest_count,
        }

    @staticmethod
    def from_dict(row: Dict[str, object] | None) -> "DailyEconomy":
        row = row or {}
        return DailyEconomy(
            day_index=int(row.get("dayIndex", 0) or 0),
            seed_cost=int(row.get("seedCost", 0) or 0),
            fertilizer_cost=int(row.get("fertilizerCost", 0) or 0),
            medicine_cost=int(row.get("medicineCost", 0) or 0),
            land_unlock_cost=int(row.get("landUnlockCost", 0) or 0),
            gross_income=int(row.get("grossIncome", 0) or 0),
            plant_count=int(row.get("plantCount", 0) or 0),
            harvest_count=int(row.get("harvestCount", 0) or 0),
        )


@dataclass
class GameAggregate:
    user_id: int
    username: str
    region: str
    created_at_ms: int
    coins: int = 100
    diamonds: int = 0
    level: int = 1
    exp: int = 0
    energy: int = 100
    version: int = 1
    last_simulated_at_ms: int = 0
    world_seed: str = ""
    inventory: Dict[str, InventoryEntry] = field(default_factory=dict)
    plots: Dict[int, Plot] = field(default_factory=dict)
    daily: DailyEconomy = field(default_factory=DailyEconomy)
    # 本次事务内产生的流水，由仓储层写入 player_actions 后清空。
    pending_actions: List[Dict[str, object]] = field(default_factory=list)

    def world_seed_value(self) -> str:
        """世界种子：早先账号没有该字段时，按账号确定性推导，保证重放一致。"""
        if self.world_seed:
            return self.world_seed
        return f"{self.user_id}:{self.created_at_ms}:farm"


@dataclass(frozen=True)
class ActionResult:
    message: str
