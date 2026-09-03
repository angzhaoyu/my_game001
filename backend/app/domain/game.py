"""不依赖 Flask/MySQL 的农场领域逻辑，可直接单元测试。"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict

from .catalog import (
    CROPS,
    ITEMS,
    LAND_RULES,
    SHOP_ITEMS,
    WEATHER,
    exp_for_next_level,
    fertilizer_amount,
    plots_unlocked,
)
from .errors import AppError
from .models import ActionResult, GameAggregate, InventoryEntry, Plot

HOUR_MS = 3_600_000
MIN_SIMULATION_STEP_MS = 60_000
MAX_OFFLINE_HOURS = 24 * 30


class GameEngine:
    """玩家自己的农场命令。

    新增普通玩法命令时只需要增加一个 ``_handle_<命令名>`` 方法；不需要新增 HTTP 路由。
    ``execute`` 会把该方法本身当作白名单，避免再维护一份重复的命令列表。
    """

    def advance(self, state: GameAggregate, now_ms: int) -> bool:
        """按服务端时间结算，客户端时间不会参与奖励判定。"""
        if state.last_simulated_at_ms <= 0:
            state.last_simulated_at_ms = now_ms
            return True
        elapsed = now_ms - state.last_simulated_at_ms
        if elapsed < MIN_SIMULATION_STEP_MS:
            return False

        # 限制一次离线结算窗口，避免异常旧数据造成超长请求。
        start = max(state.last_simulated_at_ms, now_ms - MAX_OFFLINE_HOURS * HOUR_MS)
        cursor = start
        while cursor < now_ms:
            step_end = min(cursor + HOUR_MS, now_ms)
            fraction = (step_end - cursor) / HOUR_MS
            self._tick(state, step_end, fraction)
            cursor = step_end
        state.last_simulated_at_ms = now_ms
        return True

    def execute(self, state: GameAggregate, command_type: str, payload: Dict[str, Any], now_ms: int) -> ActionResult:
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

    def _handle_develop_plot(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        if plot.id > plots_unlocked(state.level):
            raise AppError("PLOT_LOCKED", "等级不足，该土地尚未解锁")
        if plot.developed:
            raise AppError("PLOT_ALREADY_DEVELOPED", "该土地已经开发")
        cost = int(LAND_RULES["developCost"])
        if state.coins < cost:
            raise AppError("INSUFFICIENT_COINS", "金币不足，无法开发土地")
        state.coins -= cost
        plot.developed = True
        plot.water = float(LAND_RULES["dryThreshold"])
        return ActionResult(f"土地开发成功，消耗 {cost} 金币")

    def _handle_plant(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        crop_id = self._text(payload, "cropId", 64)
        crop = CROPS.get(crop_id)
        if not crop:
            raise AppError("CROP_NOT_FOUND", "作物不存在")
        if not plot.developed or plot.id > plots_unlocked(state.level):
            raise AppError("PLOT_LOCKED", "该土地尚不可种植")
        if plot.crop_id:
            raise AppError("PLOT_OCCUPIED", "这块地已经种有作物")
        self._consume_item(state, crop.seed_item_id, 1)
        plot.crop_id = crop.id
        plot.planted_at_ms = now_ms
        plot.progress = 0
        plot.harvestable = False
        plot.last_boost_key = ""
        return ActionResult(f"种下了{crop.name}")

    def _handle_water(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        self._require_developed(plot)
        cooldown = int(LAND_RULES["waterCooldownMs"])
        if now_ms - plot.last_watered_at_ms < cooldown:
            raise AppError("ACTION_TOO_FAST", "操作太快，请稍后再浇水", status=429, retryable=True)
        amount = float(LAND_RULES["waterPerUse"])
        plot.water = min(float(LAND_RULES["waterMax"]), plot.water + amount)
        plot.last_watered_at_ms = now_ms
        return ActionResult(f"浇水成功，水分 +{int(amount)}")

    def _handle_fertilize(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        self._require_developed(plot)
        item_id = self._text(payload, "itemId", 64)
        amount = fertilizer_amount(item_id)
        if amount <= 0:
            raise AppError("INVALID_FERTILIZER", "请选择有效的化肥")
        self._consume_item(state, item_id, 1)
        plot.fertilizer = min(float(LAND_RULES["fertilizerMax"]), plot.fertilizer + amount)
        return ActionResult(f"施肥成功，肥力 +{amount}")

    def _handle_shovel(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        self._require_developed(plot)
        if not plot.crop_id:
            raise AppError("NO_CROP", "这块地没有需要铲除的作物")
        crop = CROPS.get(plot.crop_id)
        crop_name = crop.name if crop else "作物"
        plot.crop_id = None
        plot.planted_at_ms = 0
        plot.progress = 0
        plot.harvestable = False
        plot.last_boost_key = ""
        return ActionResult(f"已铲除{crop_name}")

    def _handle_harvest(self, state: GameAggregate, payload: Dict[str, Any], now_ms: int) -> ActionResult:
        plot = self._plot(state, payload)
        if not plot.crop_id or not plot.harvestable:
            raise AppError("CROP_NOT_READY", "作物还没有成熟")
        crop = CROPS.get(plot.crop_id)
        if not crop:
            raise AppError("CROP_NOT_FOUND", "作物配置已失效")
        self._add_item(state, crop.fruit_item_id, 1, now_ms)
        exp_gain = max(1, math.ceil(crop.value / 2))
        levels = self._add_exp(state, exp_gain)
        plot.crop_id = None
        plot.planted_at_ms = 0
        plot.progress = 0
        plot.harvestable = False
        plot.last_boost_key = ""
        suffix = f"，升到 {state.level} 级" if levels else ""
        return ActionResult(f"收获 {crop.name} ×1，经验 +{exp_gain}{suffix}")

    def _tick(self, state: GameAggregate, step_end_ms: int, fraction: float) -> None:
        hour = datetime.fromtimestamp(step_end_ms / 1000, tz=timezone.utc).hour
        weather_type = WEATHER["schedule"][hour]
        water_drain = float(WEATHER["definitions"][weather_type]["drainPerHour"]) * fraction
        boost_key = datetime.fromtimestamp(step_end_ms / 1000, tz=timezone.utc).strftime("%Y%m%d%H")

        for plot in state.plots.values():
            if not plot.developed:
                continue
            plot.water = max(0.0, plot.water - water_drain)
            if not plot.crop_id or plot.harvestable:
                continue
            crop = CROPS.get(plot.crop_id)
            if not crop:
                continue
            plot.fertilizer = max(0.0, plot.fertilizer - crop.fertilizer_drain_per_hour * fraction)
            multiplier = self._environment_multiplier(plot, crop)
            plot.progress = min(1.0, plot.progress + (fraction * multiplier / crop.duration_hours))
            if hour in (0, 12) and plot.last_boost_key != boost_key:
                if plot.water >= crop.boost_water and plot.fertilizer >= crop.boost_fertilizer:
                    plot.last_boost_key = boost_key
                    plot.progress = min(1.0, plot.progress + crop.boost_hours / crop.duration_hours)
            plot.harvestable = plot.progress >= 1.0

    @staticmethod
    def _environment_multiplier(plot: Plot, crop: Any) -> float:
        value = 1.0
        water, fertilizer = plot.water, plot.fertilizer
        if water < crop.optimal_water[0]:
            value -= (crop.optimal_water[0] - water) * crop.dry_penalty
        elif water > crop.optimal_water[1]:
            value -= (water - crop.optimal_water[1]) * crop.over_water_penalty
        if fertilizer < crop.optimal_fertilizer[0]:
            value -= (crop.optimal_fertilizer[0] - fertilizer) * crop.low_fertilizer_penalty
        elif fertilizer > crop.optimal_fertilizer[1]:
            value -= (fertilizer - crop.optimal_fertilizer[1]) * crop.over_fertilizer_penalty
        if water < 20:
            value -= (20 - water) * 0.01
        return max(0.04, min(1.0, value))

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
    def _plot(state: GameAggregate, payload: Dict[str, Any]) -> Plot:
        plot_id = payload.get("plotId")
        if isinstance(plot_id, bool) or not isinstance(plot_id, int):
            raise AppError("INVALID_PLOT", "地块编号无效")
        plot = state.plots.get(plot_id)
        if not plot:
            raise AppError("INVALID_PLOT", "地块不存在")
        return plot

    @staticmethod
    def _require_developed(plot: Plot) -> None:
        if not plot.developed:
            raise AppError("PLOT_NOT_DEVELOPED", "请先开发这块土地")

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
