from __future__ import annotations

import unittest

from app.domain.catalog import CROPS, LAND_RULES, land_unlock_row
from app.domain.errors import AppError
from app.domain.game import GameEngine, MINUTE_MS
from app.domain.models import GameAggregate, InventoryEntry, Plot
from app.domain.serialization import snapshot
from app.services.passwords import hash_password, verify_password
from app.services.token_service import TokenService

BASE_MS = 1_700_000_000_000


class DomainTest(unittest.TestCase):
    def state(self, coins: int = 1000) -> GameAggregate:
        state = GameAggregate(
            1, "玩家", "大区一 · 电信", BASE_MS, coins=coins,
            world_seed="domain-test-seed", last_simulated_at_ms=BASE_MS,
        )
        state.plots = {index: Plot(index) for index in range(1, 25)}
        GameEngine().ensure_initialized(state)
        return state

    def engine(self) -> GameEngine:
        return GameEngine()

    # ---------------- 商店 ----------------

    def test_server_validates_price_and_inventory(self):
        state = self.state(coins=100)
        engine = self.engine()
        result = engine.execute(state, "buy_item", {"itemId": "seed_shallot", "quantity": 2}, BASE_MS)
        self.assertIn("小葱种子", result.message)
        self.assertEqual(state.coins, 100 - 2 * CROPS["shallot"].seed_price)
        self.assertEqual(state.inventory["seed_shallot"].count, 2)
        with self.assertRaises(AppError):
            engine.execute(state, "buy_item", {"itemId": "seed_shallot", "quantity": 0}, BASE_MS)

    def test_unknown_command_is_rejected(self):
        with self.assertRaises(AppError) as caught:
            self.engine().execute(self.state(), "not_a_real_command", {}, BASE_MS)
        self.assertEqual(caught.exception.code, "UNKNOWN_COMMAND")

    # ---------------- 土地解锁 ----------------

    def test_land_one_is_free_and_others_cost_coins(self):
        state = self.state(coins=100)
        engine = self.engine()
        self.assertTrue(state.plots[1].unlocked)
        self.assertFalse(state.plots[2].unlocked)
        result = engine.execute(state, "unlock_land", {"plotId": 2}, BASE_MS)
        self.assertIn("已解锁", result.message)
        self.assertEqual(state.coins, 100 - int(land_unlock_row(2)["price"]))
        self.assertEqual(state.plots[2].fertility, float(LAND_RULES["initialFertility"]))
        with self.assertRaises(AppError):
            engine.execute(state, "unlock_land", {"plotId": 2}, BASE_MS)

    def test_land_unlock_needs_level_and_coins(self):
        row = next(item for item in LAND_RULES["unlock"] if item["minLevel"] > 1)
        state = self.state(coins=10 ** 6)
        state.level = 1
        with self.assertRaises(AppError) as caught:
            self.engine().execute(state, "unlock_land", {"plotId": row["index"]}, BASE_MS)
        self.assertEqual(caught.exception.code, "PLOT_LOCKED")
        state.level = row["minLevel"]
        state.coins = 0
        with self.assertRaises(AppError) as caught:
            self.engine().execute(state, "unlock_land", {"plotId": row["index"]}, BASE_MS)
        self.assertEqual(caught.exception.code, "INSUFFICIENT_COINS")

    # ---------------- 种植 / 浇水 / 铲除 ----------------

    def test_plant_consumes_seed_and_counts_daily_limit(self):
        state = self.state()
        engine = self.engine()
        state.inventory["seed_shallot"] = InventoryEntry("seed_shallot", 10, BASE_MS)
        for round_index in range(int(LAND_RULES["dailyPlantLimit"])):
            plot = state.plots[1]
            plot.crop_id = None
            plot.mature = False
            engine.execute(state, "plant", {"plotId": 1, "cropId": "shallot"}, BASE_MS)
            self.assertEqual(plot.daily_plant_count, round_index + 1)
        with self.assertRaises(AppError) as caught:
            state.plots[1].crop_id = None
            engine.execute(state, "plant", {"plotId": 1, "cropId": "shallot"}, BASE_MS)
        self.assertEqual(caught.exception.code, "DAILY_PLANT_LIMIT")
        self.assertEqual(state.daily.plant_count, int(LAND_RULES["dailyPlantLimit"]))

    def test_plant_on_locked_land_is_rejected(self):
        state = self.state()
        state.inventory["seed_shallot"] = InventoryEntry("seed_shallot", 1, BASE_MS)
        with self.assertRaises(AppError) as caught:
            self.engine().execute(state, "plant", {"plotId": 5, "cropId": "shallot"}, BASE_MS)
        self.assertEqual(caught.exception.code, "PLOT_LOCKED")

    def test_water_raises_moisture_and_is_capped(self):
        state = self.state()
        engine = self.engine()
        state.plots[1].moisture = 0
        engine.execute(state, "water", {"plotId": 1, "times": 3}, BASE_MS)
        self.assertAlmostEqual(state.plots[1].moisture, 3 * float(LAND_RULES["waterPerUse"]))
        state.plots[1].moisture = 99
        engine.execute(state, "water", {"plotId": 1, "times": 5}, BASE_MS)
        self.assertEqual(state.plots[1].moisture, 100)
        with self.assertRaises(AppError):
            engine.execute(state, "water", {"plotId": 1, "times": 999}, BASE_MS)

    def test_shovel_clears_crop_without_client_state_upload(self):
        state = self.state()
        plot = state.plots[1]
        plot.crop_id = "shallot"
        plot.stage = 2
        plot.stage_growth = 40
        result = self.engine().execute(state, "shovel", {"plotId": 1}, BASE_MS)
        self.assertIn("小葱", result.message)
        self.assertIsNone(plot.crop_id)
        self.assertEqual(plot.stage, 0)
        self.assertEqual(plot.stage_growth, 0)

    # ---------------- 肥料 ----------------

    def test_inorganic_fertilizer_is_instant_and_organic_releases_per_minute(self):
        state = self.state()
        engine = self.engine()
        plot = state.plots[1]
        plot.fertility = 50
        state.inventory["fert_urea"] = InventoryEntry("fert_urea", 5, BASE_MS)
        engine.execute(state, "fertilize",
                       {"plotId": 1, "items": [{"itemId": "fert_urea", "count": 2}]}, BASE_MS)
        self.assertAlmostEqual(plot.fertility, 50 + 5 * 2)
        active = {item.fertilizer_id: item for item in plot.active_fertilizers}
        self.assertAlmostEqual(active["urea"].remaining_minutes, 60)

        state.inventory["fert_compost"] = InventoryEntry("fert_compost", 5, BASE_MS)
        before = plot.fertility
        plot.soil_health = 60
        engine.execute(state, "fertilize",
                       {"plotId": 1, "items": [{"itemId": "fert_compost", "count": 1}],
                        "appendTime": True}, BASE_MS)
        self.assertAlmostEqual(plot.soil_health, 61)
        active = {item.fertilizer_id: item for item in plot.active_fertilizers}
        self.assertAlmostEqual(active["compost"].per_minute, 1.0)
        self.assertAlmostEqual(active["compost"].remaining_minutes, 5)
        engine.settle_plot(state, plot, engine.describe_plot(state, plot, BASE_MS)["world"],
                           BASE_MS + MINUTE_MS)
        self.assertAlmostEqual(plot.fertility, before + 1.0, places=3)

    def test_fertilize_requires_owned_items(self):
        state = self.state()
        with self.assertRaises(AppError) as caught:
            self.engine().execute(
                state, "fertilize", {"plotId": 1, "items": [{"itemId": "fert_urea", "count": 1}]}, BASE_MS)
        self.assertEqual(caught.exception.code, "INSUFFICIENT_ITEM")
        with self.assertRaises(AppError):
            self.engine().execute(
                state, "fertilize", {"plotId": 1, "items": [{"itemId": "seed_shallot", "count": 1}]}, BASE_MS)

    # ---------------- 病虫害与药品 ----------------

    def test_medicine_reduces_level_and_clears_event_at_zero(self):
        state = self.state()
        engine = self.engine()
        plot = state.plots[1]
        plot.pest_status = "ACTIVE"
        plot.pest_level = 45
        plot.pest_onset_ms = BASE_MS
        state.inventory["med_insecticide_basic"] = InventoryEntry("med_insecticide_basic", 1, BASE_MS)
        engine.execute(state, "apply_medicine", {"plotId": 1, "itemId": "med_insecticide_basic"}, BASE_MS)
        self.assertAlmostEqual(plot.pest_level, 5)
        state.inventory["med_insecticide_advanced"] = InventoryEntry("med_insecticide_advanced", 1, BASE_MS)
        engine.execute(state, "apply_medicine", {"plotId": 1, "itemId": "med_insecticide_advanced"}, BASE_MS)
        self.assertEqual(plot.pest_status, "NONE")
        self.assertIsNone(plot.pest_onset_ms)
        self.assertEqual(plot.pest_level, 0)

    def test_per_minute_medicine_ticks_every_minute(self):
        state = self.state()
        engine = self.engine()
        plot = state.plots[1]
        plot.pest_status = "ACTIVE"
        plot.pest_level = 50
        plot.pest_onset_ms = BASE_MS
        state.inventory["med_pest_repellent"] = InventoryEntry("med_pest_repellent", 1, BASE_MS)
        engine.execute(state, "apply_medicine", {"plotId": 1, "itemId": "med_pest_repellent"}, BASE_MS)
        world = engine.describe_plot(state, plot, BASE_MS)["world"]
        # 地块没有作物时仍会推进药品；这里手动调用持续药效，验证每分钟 -10 级。
        state.plots[1].crop_id = "shallot"
        engine.settle_plot(state, plot, world, BASE_MS + MINUTE_MS)
        # 本分钟曲线增量 +2（10 + 2×AgeMinutes），持续型药品 -10。
        self.assertAlmostEqual(plot.pest_level, 50 + 2 - 10)

    # ---------------- 收获 ----------------

    def test_harvest_settles_income_quality_multiplier_and_resets_cycle(self):
        state = self.state(coins=0)
        engine = self.engine()
        plot = state.plots[1]
        plot.crop_id = "shallot"
        plot.stage = 3
        plot.stage_growth = 100
        plot.mature = True
        plot.quality_score = 95          # 精品 ×1.20
        plot.mature_yield = 10
        plot.harvest_quantity = 10
        plot.soil_health = 70
        plot.active_fertilizers = []
        crop = CROPS["shallot"]
        expected = int(10 * crop.base_price * 1.20)
        result = engine.execute(state, "harvest", {"plotId": 1}, BASE_MS)
        self.assertIn(str(expected), result.message)
        self.assertEqual(state.coins, expected)
        self.assertEqual(state.daily.gross_income, expected)
        self.assertEqual(state.daily.harvest_count, 1)
        self.assertAlmostEqual(plot.soil_health, 70 - 2)
        self.assertIsNone(plot.crop_id)
        self.assertFalse(plot.mature)

    def test_harvest_before_mature_is_rejected(self):
        state = self.state()
        plot = state.plots[1]
        plot.crop_id = "shallot"
        plot.stage = 2
        with self.assertRaises(AppError) as caught:
            self.engine().execute(state, "harvest", {"plotId": 1}, BASE_MS)
        self.assertEqual(caught.exception.code, "CROP_NOT_READY")

    # ---------------- 快照 ----------------

    def test_snapshot_exposes_world_daily_and_plot_detail(self):
        state = self.state()
        plot = state.plots[1]
        plot.crop_id = "shallot"
        plot.stage = 2
        engine = self.engine()
        engine.execute(state, "water", {"plotId": 1, "times": 1}, BASE_MS)
        data = snapshot(state, BASE_MS + MINUTE_MS)
        self.assertIn("world", data)
        self.assertIn("daily", data)
        self.assertIn("season", data["world"])
        self.assertIn("temperature", data["world"])
        first = data["plots"][0]
        for key in ("fertility", "soilHealth", "moisture", "stage", "stageGrowth", "quality",
                    "pest", "disease", "activeFertilizers", "dailyPlantCount", "growthPerMinute"):
            self.assertIn(key, first)
        self.assertEqual(len(data["plots"]), 24)

    def test_password_hash_is_salted(self):
        one = hash_password("correct horse battery staple")
        two = hash_password("correct horse battery staple")
        self.assertNotEqual(one, two)
        self.assertTrue(verify_password("correct horse battery staple", one))
        self.assertFalse(verify_password("wrong", one))

    def test_token_signature_and_expiry(self):
        tokens = TokenService("a-secret-used-only-by-tests", 60)
        token = tokens.issue(42, now_seconds=100)
        self.assertEqual(tokens.verify(token, now_seconds=120), 42)
        with self.assertRaises(AppError):
            tokens.verify(token, now_seconds=160)
        with self.assertRaises(AppError):
            tokens.verify(token + "x", now_seconds=120)


if __name__ == "__main__":
    unittest.main()
