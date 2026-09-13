"""不依赖 Flask/MySQL 的农场领域逻辑，可直接单元测试（数值系统 v1.10）。

新增普通玩法命令时只需要增加一个 ``_handle_<命令名>`` 方法；不需要新增 HTTP 路由。
``execute`` 会把该方法本身当作白名单，避免再维护一份重复的命令列表。

结算粒度：1 分钟。离线补算按整分钟依次重放，环境（季节/天气/温度）由
``world.py`` 的确定性函数给出，因此重放结果永远一致。
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

from .catalog import (
    CROPS,
    GROWTH_RULES,
    ITEMS,
    LAND_RULES,
    MEDICINES,
    SHOP_ITEMS,
    exp_for_next_level,
    fertilizer_by_item,
    land_unlock_row,
    medicine_by_item,
    quality_grade,
)
from .errors import AppError
from .models import (
    ActionResult,
    ActiveFertilizer,
    ActiveMedicine,
    DailyEconomy,
    GameAggregate,
    InventoryEntry,
    Plot,
)
from .rules import (
    appear_chance,
    clamp,
    event_level_delta,
    growth_context,
    mature_yield,
    quality_penalties,
)
from .world import MINUTE_MS, day_index, minute_index, rand01, world_state

MIN_SIMULATION_STEP_MS = MINUTE_MS
MAX_OFFLINE_MINUTES = 24 * 60  # 离线最多补算 24 小时，避免异常数据造成超长请求


class GameEngine:
    """玩家自己的农场命令 + 每分钟结算。"""

    # ------------------------------------------------------------------
    # 时间推进
    # ------------------------------------------------------------------

    def ensure_initialized(self, state: GameAggregate) -> None:
        """补齐地块、初始解锁与旧存档兼容（可重复调用）。"""
        initial_unlocked = int(LAND_RULES["initialUnlocked"])
        for plot_id in range(1, int(LAND_RULES["totalPlots"]) + 1):
            plot = state.plots.get(plot_id)
            if plot is None:
                plot = Plot(plot_id)
                state.plots[plot_id] = plot
            if plot_id <= initial_unlocked and not plot.unlocked:
                plot.unlocked = True
            if plot.unlocked and plot.fertility <= 0 and plot.soil_health <= 0 and plot.moisture <= 0:
                plot.fertility = float(LAND_RULES["initialFertility"])
                plot.soil_health = float(LAND_RULES["initialSoilHealth"])
                plot.moisture = float(LAND_RULES["initialMoisture"])
            # 旧存档里已下线的作物直接清空，避免结算时崩溃
            if plot.crop_id and plot.crop_id not in CROPS:
                plot.reset_cycle()

    def advance(self, state: GameAggregate, now_ms: int) -> bool:
        """按服务端时间结算，客户端时间不会参与奖励判定。"""
        self.ensure_initialized(state)
        if state.last_simulated_at_ms <= 0:
            state.last_simulated_at_ms = now_ms
            return True

        last_minute = minute_index(state.last_simulated_at_ms)
        current_minute = minute_index(now_ms)
        if current_minute <= last_minute:
            return False

        start_minute = max(last_minute, current_minute - MAX_OFFLINE_MINUTES)
        for minute in range(start_minute + 1, current_minute + 1):
            self.settle_minute(state, minute * MINUTE_MS)
        # 余数（不足 1 分钟的部分）保留到下一次结算。
        state.last_simulated_at_ms = current_minute * MINUTE_MS
        return True

    def settle_minute(self, state: GameAggregate, timestamp_ms: int) -> None:
        """一次完整的分钟结算；玩法说明见 docs/GAME_RULES.md。"""
        world = world_state(state.world_seed_value(), timestamp_ms)
        day = int(world["dayIndex"])
        if state.daily.day_index != day:
            state.daily = DailyEconomy(day_index=day)
            for plot in state.plots.values():
                plot.daily_plant_count = 0
                plot.daily_net_income = 0.0
        for plot in state.plots.values():
            self.settle_plot(state, plot, world, timestamp_ms)

    def settle_plot(
        self,
        state: GameAggregate,
        plot: Plot,
        world: Dict[str, Any],
        timestamp_ms: int,
    ) -> None:
        if not plot.unlocked:
            return

        # 1) 自然失水（雨天湿度修正为负 → 反而补水）
        drain = float(LAND_RULES["moistureDrainPerHour"]) * float(world["humidityModifier"]) / 60.0
        plot.moisture = clamp(plot.moisture - drain, 0.0, 100.0)

        crop = CROPS.get(plot.crop_id) if plot.crop_id else None

        # 2) 有机肥按分钟释放
        for item in plot.active_fertilizers:
            if item.per_minute > 0:
                plot.fertility = clamp(plot.fertility + item.per_minute, 0.0, 100.0)

        # 3) 肥料 / 药品剩余时间递减
        plot.active_fertilizers = [
            item for item in plot.active_fertilizers
            if self._tick_remaining(item) > 0
        ]
        plot.active_medicines = [
            item for item in plot.active_medicines
            if self._tick_remaining(item) > 0
        ]

        # 4) 肥力消耗（成熟后停止）
        if crop and not plot.mature:
            plot.fertility = clamp(plot.fertility - crop.fertility_consumption, 0.0, 100.0)

        # 5) 病虫害判定 + 等级更新（必须早于成长与品质计算）
        if crop and not plot.mature:
            self._event_check(state, plot, crop, world, timestamp_ms)
            self._advance_event_levels(plot, timestamp_ms)

        # 6) 持续型药品（驱虫植物：每分钟 -10 害虫等级）
        self._apply_per_minute_medicines(plot)

        if not crop or plot.mature:
            return

        # 7) 成长
        context = growth_context(crop, plot, world)
        plot.stage_growth += context.growth_per_minute
        plot.plant_age_minutes += 1

        # 8) 品质
        self._settle_quality(plot, crop, world, context)

        # 9) 阶段完成 / 成熟锁定
        while plot.stage < 3 and plot.stage_growth >= 100.0:
            plot.stage_growth -= 100.0
            plot.stage += 1
        if plot.stage >= 3:
            plot.stage_growth = min(100.0, plot.stage_growth)
            if plot.stage_growth >= 100.0 and not plot.mature:
                self._lock_mature(plot)
        plot.progress = plot.total_growth() / 300.0  # 兼容旧字段

    def _lock_mature(self, plot: Plot) -> None:
        plot.mature = True
        plot.harvestable = True
        plot.mature_yield = mature_yield(plot)
        plot.harvest_quantity = plot.mature_yield
        plot.progress = 1.0

    @staticmethod
    def _tick_remaining(item: Any) -> float:
        item.remaining_minutes = round(item.remaining_minutes - 1.0, 6)
        return item.remaining_minutes

    def _event_check(
        self,
        state: GameAggregate,
        plot: Plot,
        crop: Any,
        world: Dict[str, Any],
        timestamp_ms: int,
    ) -> None:
        seed = state.world_seed_value()
        minute = int(world["minuteIndex"])
        for target in ("pest", "disease"):
            active = plot.pest_status if target == "pest" else plot.disease_status
            if active == "ACTIVE":
                continue
            chance = appear_chance(crop, plot, world, target)
            roll = rand01(seed, target, plot.id, minute)
            if roll < chance:
                onset_damage = float(GROWTH_RULES["onsetQualityDamage"])
                if target == "pest":
                    plot.pest_status = "ACTIVE"
                    plot.pest_onset_ms = timestamp_ms
                    plot.pest_level = 0.0
                else:
                    plot.disease_status = "ACTIVE"
                    plot.disease_onset_ms = timestamp_ms
                    plot.disease_level = 0.0
                plot.quality_score = clamp(plot.quality_score - onset_damage, 0.0, 100.0)

    @staticmethod
    def _advance_event_levels(plot: Plot, timestamp_ms: int) -> None:
        """事件等级按持续时间升级；药品降低的等级不会被曲线抹掉。"""
        for target in ("pest", "disease"):
            if target == "pest":
                status, onset, level = plot.pest_status, plot.pest_onset_ms, plot.pest_level
            else:
                status, onset, level = plot.disease_status, plot.disease_onset_ms, plot.disease_level
            if status != "ACTIVE" or onset is None:
                if target == "pest":
                    plot.pest_level = 0.0
                else:
                    plot.disease_level = 0.0
                continue
            age = max(0.0, (timestamp_ms - int(onset)) / 60000.0)
            delta = event_level_delta(max(0.0, age - 1.0), age)
            level = clamp(level + delta, 0.0, 100.0)
            if target == "pest":
                plot.pest_level = level
            else:
                plot.disease_level = level

    @staticmethod
    def _settle_quality(plot: Plot, crop: Any, world: Dict[str, Any], context: Any) -> None:
        score = plot.quality_score
        if plot.plant_age_minutes <= float(GROWTH_RULES["qualityWindowMinutes"]):
            score += float(GROWTH_RULES["baseQualityGainPerMinute"])
        score += context.best_fertilizer_quality_gain
        penalties = quality_penalties(crop, plot, world)
        score -= penalties["temperature"] + penalties["humidity"] + penalties["fertility"]
        score -= penalties["pest"] + penalties["disease"]
        plot.quality_score = clamp(score, 0.0, 100.0)

    @staticmethod
    def _apply_per_minute_medicines(plot: Plot) -> None:
        for item in plot.active_medicines:
            medicine = MEDICINES.get(item.medicine_id)
            if not medicine or not medicine.per_minute:
                continue
            if medicine.target == "pest" and plot.pest_status == "ACTIVE":
                plot.pest_level = max(0.0, plot.pest_level - medicine.power)
                if plot.pest_level <= 0:
                    plot.pest_status = "NONE"
                    plot.pest_onset_ms = None
            if medicine.target == "disease" and plot.disease_status == "ACTIVE":
                plot.disease_level = max(0.0, plot.disease_level - medicine.power)
                if plot.disease_level <= 0:
                    plot.disease_status = "NONE"
                    plot.disease_onset_ms = None

    # ------------------------------------------------------------------
    # 命令
    # ------------------------------------------------------------------

    def execute(self, state: GameAggregate, command_type: str, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        self.ensure_initialized(state)
        handler = getattr(self, f"_handle_{command_type}", None) if isinstance(command_type, str) else None
        if not callable(handler):
            raise AppError("UNKNOWN_COMMAND", "不支持的游戏操作")
        return handler(state, payload, now_ms)

    def _handle_buy_item(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        item_id = self._text(payload, "itemId", 64)
        quantity = self._quantity(payload)
        item = SHOP_ITEMS.get(item_id)
        if not item or item.price is None:
            raise AppError("ITEM_NOT_FOR_SALE", "该物品暂未出售")
        cost = item.price * quantity
        if state.coins < cost:
            raise AppError("INSUFFICIENT_COINS", "金币不足")
        state.coins -= cost
        self._add_item(state, item_id, quantity, now_ms)
        return ActionResult(f"购买 {item.name} ×{quantity}，消耗 {cost} 金币")

    def _handle_sell_item(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        item_id = self._text(payload, "itemId", 64)
        quantity = self._quantity(payload)
        item = ITEMS.get(item_id)
        if not item:
            raise AppError("ITEM_NOT_FOUND", "物品不存在")
        self._consume_item(state, item_id, quantity)
        gain = item.value * quantity
        state.coins += gain
        return ActionResult(f"出售 {item.name} ×{quantity}，获得 {gain} 金币")

    def _handle_unlock_land(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        row = land_unlock_row(plot.id)
        if not row:
            raise AppError("INVALID_PLOT", "地块不存在")
        if plot.unlocked:
            raise AppError("PLOT_ALREADY_UNLOCKED", "该土地已经解锁")
        if state.level < int(row["minLevel"]):
            raise AppError("PLOT_LOCKED", f"等级不足，{row['minLevel']} 级才能解锁这块土地")
        cost = int(row["price"])
        if state.coins < cost:
            raise AppError("INSUFFICIENT_COINS", f"金币不足，解锁需要 {cost} 金币")
        state.coins -= cost
        plot.unlocked = True
        plot.fertility = float(LAND_RULES["initialFertility"])
        plot.soil_health = float(LAND_RULES["initialSoilHealth"])
        plot.moisture = float(LAND_RULES["initialMoisture"])
        state.daily.land_unlock_cost += cost
        self._record_action(state, plot.id, "unlock_land", now_ms, cost=cost)
        return ActionResult(f"第 {plot.id} 块土地已解锁，消耗 {cost} 金币")

    def _handle_plant(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        crop_id = self._text(payload, "cropId", 64)
        crop = CROPS.get(crop_id)
        if not crop:
            raise AppError("CROP_NOT_FOUND", "作物不存在")
        if not plot.unlocked:
            raise AppError("PLOT_LOCKED", "该土地尚未解锁")
        if plot.crop_id:
            raise AppError("PLOT_OCCUPIED", "这块地已经种有作物")
        limit = int(LAND_RULES["dailyPlantLimit"])
        if plot.daily_plant_count >= limit:
            raise AppError("DAILY_PLANT_LIMIT", f"这块地今天已经播种 {limit} 次，明天再来")

        self._consume_item(state, crop.seed_item_id, 1)
        plot.reset_cycle()
        plot.crop_id = crop.id
        plot.stage = 1
        plot.stage_growth = 0.0
        plot.plant_age_minutes = 0.0
        plot.quality_score = float(GROWTH_RULES["initialQuality"])
        plot.planted_at_ms = now_ms
        plot.daily_plant_count += 1
        plot.daily_net_income -= crop.seed_price

        state.daily.seed_cost += crop.seed_price
        state.daily.plant_count += 1
        self._record_action(state, plot.id, "plant", now_ms, crop_id=crop.id, cost=crop.seed_price)
        remaining = limit - plot.daily_plant_count
        return ActionResult(f"种下了{crop.name}，今日还可播种 {remaining} 次")

    def _handle_water(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        self._require_unlocked(plot)
        times = self._count(payload, "times", 1, int(LAND_RULES["waterMaxTimes"]))
        amount = float(LAND_RULES["waterPerUse"]) * times
        before = plot.moisture
        plot.moisture = clamp(plot.moisture + amount, 0.0, 100.0)
        plot.last_watered_at_ms = now_ms
        self._record_action(state, plot.id, "water", now_ms)
        gained = int(round(plot.moisture - before))
        return ActionResult(f"浇水 ×{times}，湿度 +{gained}（当前 {plot.moisture:.0f}）")

    def _handle_fertilize(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        self._require_unlocked(plot)
        append_time = bool(payload.get("appendTime", False))
        rows = payload.get("items")
        if not isinstance(rows, list) or not rows:
            raise AppError("INVALID_ARGUMENT", "请选择要施用的肥料")
        if len(rows) > 12:
            raise AppError("INVALID_ARGUMENT", "一次最多选择 12 种肥料")

        names: List[str] = []
        total_cost = 0
        applied: List[Tuple[Any, int]] = []
        for row in rows:
            if not isinstance(row, dict):
                raise AppError("INVALID_ARGUMENT", "肥料参数无效")
            item_id = self._text(row, "itemId", 64)
            count = self._count(row, "count", 1, 99)
            fert = fertilizer_by_item(item_id)
            if not fert:
                raise AppError("INVALID_FERTILIZER", "请选择有效的肥料")
            entry = state.inventory.get(item_id)
            if not entry or entry.count < count:
                raise AppError("INSUFFICIENT_ITEM", f"{fert.name} 数量不足")
            applied.append((fert, count))
            total_cost += fert.price * count

        # 背包里的肥料在商店购买时已付费，这里只统计成本，不二次扣款。
        for fert, count in applied:
            self._consume_item(state, fert.item_id, count)
            if fert.type == "inorganic":
                plot.fertility = clamp(plot.fertility + fert.instant_fertility * count, 0.0, 100.0)
                per_minute = 0.0
            else:
                plot.soil_health = clamp(plot.soil_health + fert.soil_health * count, 0.0, 100.0)
                per_minute = fert.per_minute
            existing = next((item for item in plot.active_fertilizers
                             if item.fertilizer_id == fert.id), None)
            duration = fert.duration_minutes * count
            if existing is None:
                plot.active_fertilizers.append(
                    ActiveFertilizer(fert.id, duration, per_minute))
            elif append_time:
                existing.remaining_minutes += duration
                existing.per_minute = max(existing.per_minute, per_minute)
            else:
                existing.remaining_minutes = max(existing.remaining_minutes, duration)
                existing.per_minute = max(existing.per_minute, per_minute)
            plot.daily_net_income -= fert.price * count
            state.daily.fertilizer_cost += fert.price * count
            self._record_action(state, plot.id, "fertilize", now_ms,
                                fertilizer_id=fert.id, cost=fert.price * count)
            names.append(f"{fert.name}×{count}")

        return ActionResult("施肥成功：" + "、".join(names))

    def _handle_apply_medicine(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        self._require_unlocked(plot)
        item_id = self._text(payload, "itemId", 64)
        medicine = medicine_by_item(item_id)
        if not medicine:
            raise AppError("INVALID_MEDICINE", "请选择有效的药品")
        self._consume_item(state, item_id, 1)

        if medicine.per_minute:
            existing = next((item for item in plot.active_medicines
                             if item.medicine_id == medicine.id), None)
            if existing is None:
                plot.active_medicines.append(ActiveMedicine(medicine.id, medicine.duration_minutes))
            else:
                existing.remaining_minutes += medicine.duration_minutes
        else:
            if medicine.target == "pest":
                plot.pest_level = max(0.0, plot.pest_level - medicine.power)
                if plot.pest_level <= 0:
                    plot.pest_status = "NONE"
                    plot.pest_onset_ms = None
                    plot.pest_level = 0.0
            else:
                plot.disease_level = max(0.0, plot.disease_level - medicine.power)
                if plot.disease_level <= 0:
                    plot.disease_status = "NONE"
                    plot.disease_onset_ms = None
                    plot.disease_level = 0.0
            existing = next((item for item in plot.active_medicines
                             if item.medicine_id == medicine.id), None)
            if existing is None:
                plot.active_medicines.append(ActiveMedicine(medicine.id, medicine.duration_minutes))
            else:
                existing.remaining_minutes += medicine.duration_minutes

        plot.daily_net_income -= medicine.price
        state.daily.medicine_cost += medicine.price
        self._record_action(state, plot.id, "apply_medicine", now_ms,
                            medicine_id=medicine.id, cost=medicine.price)
        target_name = "害虫" if medicine.target == "pest" else "病害"
        return ActionResult(f"使用了{medicine.name}，{target_name}等级 -{medicine.power:.0f}")

    def _handle_harvest(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        if not plot.crop_id or not plot.mature:
            raise AppError("CROP_NOT_READY", "作物还没有成熟")
        crop = CROPS.get(plot.crop_id)
        if not crop:
            raise AppError("CROP_NOT_FOUND", "作物配置已失效")

        quantity = max(0, int(plot.harvest_quantity))
        grade, multiplier = quality_grade(plot.quality_score)
        income = int(math.floor(quantity * crop.base_price * multiplier))
        # 单块土地每日净收益硬上限（由 LAND_RULES 下发）
        cap = float(LAND_RULES["dailyNetIncomeCap"])
        if plot.daily_net_income + income > cap:
            income = max(0, int(cap - plot.daily_net_income))

        state.coins += income
        plot.daily_net_income += income
        state.daily.gross_income += income
        state.daily.harvest_count += 1
        plot.soil_health = clamp(plot.soil_health - float(GROWTH_RULES["harvestSoilHealthCost"]), 0.0, 100.0)

        exp_gain = max(1, int(math.ceil(income / 3)))
        levels = self._add_exp(state, exp_gain)
        name = crop.name
        quality = int(round(plot.quality_score))
        self._record_action(state, plot.id, "harvest", now_ms, crop_id=crop.id, income=income)
        plot.reset_cycle()
        suffix = f"，升到 {state.level} 级" if levels else ""
        return ActionResult(f"收获 {name} ×{quantity}（{grade} {quality}），获得 {income} 金币{suffix}")

    def _handle_shovel(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        self._require_unlocked(plot)
        if not plot.crop_id:
            raise AppError("NO_CROP", "这块地没有需要铲除的作物")
        crop = CROPS.get(plot.crop_id)
        crop_name = crop.name if crop else "作物"
        self._record_action(state, plot.id, "shovel", now_ms, crop_id=plot.crop_id)
        plot.reset_cycle()
        return ActionResult(f"已铲除{crop_name}，土地已恢复空置")

    # ------------------------------------------------------------------
    # 展示用上下文（前端进度条 / 土壤信息面板）
    # ------------------------------------------------------------------

    def describe_plot(self, state: GameAggregate, plot: Plot, now_ms: int) -> Dict[str, Any]:
        world = world_state(state.world_seed_value(), now_ms)
        crop = CROPS.get(plot.crop_id) if plot.crop_id else None
        row: Dict[str, Any] = {"world": world}
        if not crop or plot.mature:
            row["growthPerMinute"] = 0.0
            row["multipliers"] = {}
            return row
        context = growth_context(crop, plot, world)
        row["growthPerMinute"] = round(context.growth_per_minute, 3)
        row["multipliers"] = context.to_dict()
        return row

    # ------------------------------------------------------------------
    # 内部工具
    # ------------------------------------------------------------------

    @staticmethod
    def _record_action(
        state: GameAggregate,
        plot_id: int,
        action_type: str,
        now_ms: int,
        *,
        crop_id: str | None = None,
        fertilizer_id: str | None = None,
        medicine_id: str | None = None,
        cost: int = 0,
        income: int = 0,
    ) -> None:
        state.pending_actions.append({
            "timestampMs": now_ms,
            "dayIndex": day_index(now_ms),
            "plotId": plot_id,
            "actionType": action_type,
            "cropId": crop_id,
            "fertilizerId": fertilizer_id,
            "medicineId": medicine_id,
            "cost": int(cost),
            "income": int(income),
        })

    @staticmethod
    def _text(payload: Dict[str, Any], key: str, max_length: int) -> str:
        value = payload.get(key)
        if not isinstance(value, str) or not value or len(value) > max_length:
            raise AppError("INVALID_ARGUMENT", f"参数 {key} 无效")
        return value

    @staticmethod
    def _quantity(payload: Dict[str, Any]) -> int:
        value = payload.get("quantity", 1)
        if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 99:
            raise AppError("INVALID_QUANTITY", "数量必须为 1-99 的整数")
        return value

    @staticmethod
    def _count(payload: Dict[str, Any], key: str, low: int, high: int) -> int:
        value = payload.get(key, low)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise AppError("INVALID_ARGUMENT", f"参数 {key} 无效")
        number = int(value)
        if not low <= number <= high:
            raise AppError("INVALID_ARGUMENT", f"参数 {key} 必须在 {low}-{high} 之间")
        return number

    @staticmethod
    def _plot(state: GameAggregate, payload: Dict[str, Any]) -> Plot:
        plot_id = payload.get("plotId")
        if isinstance(plot_id, bool) or not isinstance(plot_id, int):
            raise AppError("INVALID_PLOT", "地块编号无效")
        plot = state.plots.get(plot_id)
        if not plot:
            raise AppError("INVALID_PLOT", "地块不存在")
        return plot

    @staticmethod
    def _require_unlocked(plot: Plot) -> None:
        if not plot.unlocked:
            raise AppError("PLOT_NOT_UNLOCKED", "请先解锁这块土地")

    @staticmethod
    def _consume_item(state: GameAggregate, item_id: str, count: int) -> None:
        entry = state.inventory.get(item_id)
        if not entry or entry.count < count:
            raise AppError("INSUFFICIENT_ITEM", "背包物品不足")
        entry.count -= count
        if entry.count <= 0:
            del state.inventory[item_id]

    @staticmethod
    def _add_item(state: GameAggregate, item_id: str, count: int, now_ms: int) -> None:
        entry = state.inventory.get(item_id)
        if entry:
            entry.count += count
        else:
            state.inventory[item_id] = InventoryEntry(item_id, count, now_ms)

    @staticmethod
    def _add_exp(state: GameAggregate, amount: int) -> int:
        max_level = int(LAND_RULES["level"]["maxLevel"])
        if state.level >= max_level:
            return 0
        state.exp += amount
        levels = 0
        while state.level < max_level:
            required = exp_for_next_level(state.level)
            if state.exp < required:
                break
            state.exp -= required
            state.level += 1
            levels += 1
        return levels
