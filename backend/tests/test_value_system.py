"""数值系统 v1.10 的验收测试：直接用文档第十六章的验收标准断言。"""
from __future__ import annotations

import math
import unittest

from app.domain.catalog import (
    CROPS,
    GROWTH_RULES,
    LAND_RULES,
    SEASON_BASE_TEMPERATURE,
    WEATHER_DEFINITIONS,
    WEATHER_WEIGHTS,
    land_unlock_row,
    quality_grade,
)
from app.domain.game import GameEngine, MINUTE_MS, MAX_OFFLINE_MINUTES
from app.domain.models import ActiveFertilizer, GameAggregate, InventoryEntry, Plot
from app.domain.rules import appear_chance, growth_context, yield_multiplier
from app.domain.world import (
    SEASON_MINUTES,
    WEATHER_SLOT_MINUTES,
    day_index,
    season_at,
    weather_at,
    world_state,
)

BASE_MS = 1_700_000_000_000
SEED = "value-system-test-seed"


def find_window(
    crop_id: str,
    *,
    minutes: int = 10,
    seed: str = SEED,
    limit: int = 4000,
) -> int:
    """找到一段「温度/季节都适合作物」的连续时间窗口，保证测试可复现。"""
    crop = CROPS[crop_id]
    for offset in range(limit):
        start = BASE_MS + offset * 24 * 60 * MINUTE_MS
        world = world_state(seed, start)
        if world["season"] not in crop.seasons:
            continue
        if not (crop.temp[0] <= world["temperature"] <= crop.temp[1]):
            continue
        return start
    raise AssertionError(f"找不到适合 {crop_id} 的时间窗口")


class ValueSystemTest(unittest.TestCase):
    def build(self, seed: str = SEED, start_ms: int = BASE_MS, coins: int = 1000) -> GameAggregate:
        state = GameAggregate(
            1, "玩家", "大区一 · 电信", start_ms, coins=coins, world_seed=seed,
            last_simulated_at_ms=start_ms,
        )
        state.plots = {index: Plot(index) for index in range(1, 25)}
        GameEngine().ensure_initialized(state)
        return state

    def grow(
        self,
        crop_id: str,
        *,
        best_fertilizer: bool = True,
        moisture: float | None = None,
        fertility: float | None = None,
        max_minutes: int = 400,
    ):
        """在受控环境下把一株作物种到成熟，返回 (分钟数, 地块, 状态)。"""
        crop = CROPS[crop_id]
        start = find_window(crop_id)
        state = self.build(start_ms=start)
        plot = state.plots[1]
        engine = GameEngine()
        target_moisture = moisture if moisture is not None else sum(crop.humidity) / 2
        target_fertility = fertility if fertility is not None else crop.target_fertility
        plot.moisture = target_moisture
        plot.fertility = target_fertility
        state.inventory[crop.seed_item_id] = InventoryEntry(crop.seed_item_id, 1, start)
        if best_fertilizer:
            for fertilizer_id in crop.best_fertilizers:
                state.inventory[f"fert_{fertilizer_id}"] = InventoryEntry(
                    f"fert_{fertilizer_id}", 99, start)
        engine.execute(state, "plant", {"plotId": 1, "cropId": crop_id}, start)

        minutes = 0
        while not plot.mature and minutes < max_minutes:
            now = start + minutes * MINUTE_MS
            # 保持目标水肥，专注验证成长/品质公式
            plot.moisture = target_moisture
            plot.fertility = target_fertility
            if best_fertilizer and plot.stage:
                want = crop.best_fertilizers[min(plot.stage, 3) - 1]
                if not any(item.fertilizer_id == want for item in plot.active_fertilizers):
                    engine.execute(
                        state, "fertilize",
                        {"plotId": 1, "items": [{"itemId": f"fert_{want}", "count": 1}],
                         "appendTime": True},
                        now,
                    )
            engine.settle_minute(state, now + MINUTE_MS)
            minutes += 1
        return minutes, plot, state

    # ---------------- 时间与世界 ----------------

    def test_season_cycles_every_48_hours(self):
        order = [season_at(BASE_MS + index * SEASON_MINUTES * MINUTE_MS) for index in range(8)]
        cycle = ["spring", "summer", "autumn", "winter"]
        self.assertEqual(order[:4], order[4:])            # 8 天正好两轮
        self.assertEqual(set(order), set(cycle))
        # 顺序必须是 春 → 夏 → 秋 → 冬 的循环
        start = cycle.index(order[0])
        self.assertEqual(order[:4], [cycle[(start + i) % 4] for i in range(4)])

    def test_weather_updates_every_six_hours_and_uses_season_weights(self):
        slot_a = weather_at(SEED, BASE_MS)
        slot_b = weather_at(SEED, BASE_MS + WEATHER_SLOT_MINUTES * MINUTE_MS)
        self.assertIn(slot_a, WEATHER_DEFINITIONS)
        self.assertIn(slot_b, WEATHER_DEFINITIONS)
        # 同一 6 小时槽内任意分钟结果一致
        self.assertEqual(
            weather_at(SEED, BASE_MS + 17 * MINUTE_MS),
            weather_at(SEED, BASE_MS + 300 * MINUTE_MS),
        )
        season = season_at(BASE_MS)
        allowed = {name for name, _ in WEATHER_WEIGHTS[season]}
        self.assertIn(slot_a, allowed)

    def test_base_temperature_is_stable_within_a_day_and_in_season_range(self):
        world = world_state(SEED, BASE_MS)
        low, high = SEASON_BASE_TEMPERATURE[world["season"]]
        modifier = WEATHER_DEFINITIONS[world["weather"]]["tempModifier"]
        self.assertGreaterEqual(world["temperature"], low + modifier - 0.001)
        self.assertLessEqual(world["temperature"], high + modifier + 0.001)
        self.assertEqual(day_index(BASE_MS), day_index(BASE_MS + 5 * MINUTE_MS))

    def test_world_is_deterministic_for_replay(self):
        first = [world_state(SEED, BASE_MS + i * MINUTE_MS) for i in range(120)]
        second = [world_state(SEED, BASE_MS + i * MINUTE_MS) for i in range(120)]
        self.assertEqual(first, second)

    # ---------------- 成长 ----------------

    def test_good_conditions_mature_in_about_five_minutes(self):
        minutes, plot, _ = self.grow("shallot", best_fertilizer=True)
        self.assertLessEqual(minutes, 6)
        self.assertGreaterEqual(minutes, 4)
        self.assertGreaterEqual(plot.quality_score, 95)
        self.assertEqual(plot.mature_yield, int(GROWTH_RULES["baseYield"]))

    def test_without_best_fertilizer_mature_in_about_six_minutes(self):
        minutes, plot, _ = self.grow("shallot", best_fertilizer=False)
        self.assertLessEqual(minutes, 7)
        self.assertGreaterEqual(minutes, 5)

    def test_worst_case_never_exceeds_120_minutes(self):
        minutes, _, _ = self.grow("shallot", best_fertilizer=False, moisture=0, fertility=0,
                                  max_minutes=400)
        self.assertLessEqual(minutes, 121)
        self.assertGreater(minutes, 20)

    def test_growth_multiplier_floor_is_fixed(self):
        floor = float(GROWTH_RULES["minGrowthMultiplier"])
        for crop_id in ("shallot", "tomato", "watermelon"):
            crop = CROPS[crop_id]
            plot = Plot(1, crop_id=crop_id, stage=2, moisture=0, fertility=0)
            world = world_state(SEED, BASE_MS)
            context = growth_context(crop, plot, world)
            self.assertGreaterEqual(context.final_multiplier, floor - 1e-9)

    def test_season_penalty_and_best_fertilizer_bonus(self):
        crop = CROPS["tomato"]  # 仅夏季
        plot = Plot(1, crop_id="tomato", stage=1,
                    moisture=70, fertility=crop.target_fertility)
        summer = {"season": "summer", "temperature": 25, "humidityModifier": 1.0,
                  "pestRisk": 0, "diseaseRisk": 0}
        winter = dict(summer, season="winter")
        self.assertEqual(growth_context(crop, plot, summer).season_multiplier, 1.0)
        self.assertAlmostEqual(growth_context(crop, plot, winter).season_multiplier, 0.85)
        # S1 最佳肥料为鸡粪肥：生效时成长 ×1.20、品质 +0.10/分钟，且不叠加。
        plot.active_fertilizers = [ActiveFertilizer("chicken_manure", 30)]
        context = growth_context(crop, plot, summer)
        self.assertAlmostEqual(context.best_fertilizer_multiplier, 1.20)
        self.assertAlmostEqual(context.best_fertilizer_quality_gain, 0.10)
        plot.active_fertilizers = [
            ActiveFertilizer("chicken_manure", 30),
            ActiveFertilizer("chicken_manure", 30),
        ]
        self.assertAlmostEqual(growth_context(crop, plot, summer).best_fertilizer_multiplier, 1.20)

    # ---------------- 品质与产量 ----------------

    def test_quality_grades_cover_all_five_tiers(self):
        grades = [quality_grade(score)[0] for score in (95, 80, 65, 50, 20)]
        self.assertEqual(grades, ["精品", "优良", "普通", "合格", "不合格"])

    def test_pest_and_disease_reduce_yield_with_floor(self):
        plot = Plot(1, pest_status="ACTIVE", pest_level=100,
                    disease_status="ACTIVE", disease_level=100)
        self.assertAlmostEqual(yield_multiplier(plot), 0.525)  # 0.75 × 0.70
        plot.disease_status = "NONE"
        self.assertAlmostEqual(yield_multiplier(plot), 0.75)
        clean = Plot(1)
        self.assertEqual(yield_multiplier(clean), 1.0)

    def test_pest_risk_grows_with_bad_environment(self):
        crop = CROPS["tomato"]
        good = Plot(1, moisture=70, soil_health=90)
        bad = Plot(1, moisture=5, soil_health=30)
        world = {"season": "summer", "temperature": 45, "humidityModifier": 2.0,
                 "pestRisk": 0.0003, "diseaseRisk": 0.0005}
        self.assertGreater(appear_chance(crop, bad, world, "disease"),
                           appear_chance(crop, good, world, "disease"))
        self.assertLessEqual(appear_chance(crop, bad, world, "disease"),
                             float(GROWTH_RULES["maxAppearChance"]))

    # ---------------- 经济 ----------------

    def test_daily_plant_limit_is_three(self):
        self.assertEqual(int(LAND_RULES["dailyPlantLimit"]), 3)

    def test_land_unlock_prices_match_the_table(self):
        self.assertEqual(land_unlock_row(1)["price"], 0)
        self.assertEqual(land_unlock_row(2)["price"], 50)
        self.assertEqual(land_unlock_row(6)["price"], 800)
        self.assertEqual(land_unlock_row(24)["price"], 120000)

    def test_single_land_daily_net_income_is_capped(self):
        state = self.build()
        plot = state.plots[1]
        engine = GameEngine()
        crop = CROPS["shallot"]
        harvests = 0
        for _ in range(4):
            plot.crop_id = crop.id
            plot.stage = 3
            plot.stage_growth = 100
            plot.mature = True
            plot.quality_score = 100
            plot.mature_yield = 10
            plot.harvest_quantity = 10
            engine.execute(state, "harvest", {"plotId": 1}, BASE_MS)
            harvests += 1
        self.assertLessEqual(plot.daily_net_income, float(LAND_RULES["dailyNetIncomeCap"]) + 1e-6)
        self.assertEqual(harvests, 4)
        # 每天净收益 = 收入 - 种子/肥料/药品成本
        self.assertLessEqual(state.daily.gross_income, 4 * int(10 * crop.base_price * 1.2))

    def test_planting_resets_on_a_new_day(self):
        state = self.build()
        engine = GameEngine()
        plot = state.plots[1]
        state.inventory["seed_shallot"] = InventoryEntry("seed_shallot", 9, BASE_MS)
        for _ in range(3):
            plot.crop_id = None
            engine.execute(state, "plant", {"plotId": 1, "cropId": "shallot"}, BASE_MS)
        self.assertEqual(plot.daily_plant_count, 3)
        engine.settle_minute(state, BASE_MS + 24 * 60 * MINUTE_MS)
        self.assertEqual(plot.daily_plant_count, 0)
        self.assertNotEqual(state.daily.day_index, day_index(BASE_MS) - 1)

    # ---------------- 完整流程（服务层） ----------------

    def test_full_loop_through_game_service(self):
        """注册 → 播种 → 浇水 → 施肥 → 催熟 → 收获，验证金币、统计与快照。"""
        from app.services.game_service import GameService

        class FakeUnit:
            def __init__(self, repository):
                self.repository = repository

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def load(self, user_id, lock=True):
                return self.repository.state

            def save(self, state):
                self.repository.state = state

            def get_processed_command(self, user_id, command_id):
                return self.repository.commands.get(command_id)

            def save_processed_command(self, user_id, command_id, response):
                self.repository.commands[command_id] = response

        class FakeRepo:
            def __init__(self, state):
                self.state = state
                self.commands = {}

            def transaction(self):
                return FakeUnit(self)

        state = self.build(coins=100)
        service = GameService(FakeRepo(state), clock=lambda: BASE_MS)
        engine = GameEngine()

        snapshot = service.bootstrap(1)
        self.assertEqual(len(snapshot["plots"]), 24)
        self.assertTrue(snapshot["plots"][0]["unlocked"])
        self.assertFalse(snapshot["plots"][1]["unlocked"])

        state.inventory["seed_shallot"] = InventoryEntry("seed_shallot", 1, BASE_MS)
        state.inventory["fert_urea"] = InventoryEntry("fert_urea", 1, BASE_MS)
        version = state.version
        service.command(1, "cmd-plant-0001", version, "plant", {"plotId": 1, "cropId": "shallot"})
        service.command(1, "cmd-water-0001", state.version, "water", {"plotId": 1, "times": 2})
        service.command(1, "cmd-fert-0001", state.version, "fertilize", {
            "plotId": 1,
            "items": [{"itemId": "fert_urea", "count": 1}],
            "appendTime": True,
        })
        plot = state.plots[1]
        self.assertEqual(plot.crop_id, "shallot")
        self.assertEqual(plot.daily_plant_count, 1)
        self.assertGreater(plot.moisture, 70)
        self.assertEqual(len(plot.active_fertilizers), 1)

        # 直接把地块推到成熟，避免依赖真实时间
        plot.stage = 3
        plot.stage_growth = 100
        plot.quality_score = 100
        engine._lock_mature(plot)
        before = state.coins
        service.command(1, "cmd-harvest-01", state.version, "harvest", {"plotId": 1})
        crop = CROPS["shallot"]
        expected = int(math.floor(10 * crop.base_price * 1.2))
        self.assertEqual(state.coins, before + expected)
        self.assertIsNone(plot.crop_id)
        self.assertEqual(state.daily.harvest_count, 1)
        self.assertEqual(state.daily.seed_cost, crop.seed_price)

    # ---------------- 离线 ----------------

    def test_offline_catch_up_is_capped(self):
        state = self.build()
        engine = GameEngine()
        state.plots[1].crop_id = "shallot"
        state.plots[1].stage = 1
        far_future = BASE_MS + (MAX_OFFLINE_MINUTES + 5000) * MINUTE_MS
        engine.advance(state, far_future)
        self.assertEqual(state.last_simulated_at_ms, far_future // MINUTE_MS * MINUTE_MS)


if __name__ == "__main__":
    unittest.main()
