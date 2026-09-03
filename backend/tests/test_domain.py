from __future__ import annotations

import unittest

from app.domain.catalog import LAND_RULES
from app.domain.errors import AppError
from app.domain.game import GameEngine, HOUR_MS
from app.domain.models import GameAggregate, InventoryEntry, Plot
from app.services.passwords import hash_password, verify_password
from app.services.token_service import TokenService


class DomainTest(unittest.TestCase):
    def state(self):
        state = GameAggregate(1, "玩家", "大区一 · 电信", 0, last_simulated_at_ms=HOUR_MS)
        state.plots = {index: Plot(index) for index in range(1, 25)}
        return state

    def test_server_validates_price_and_inventory(self):
        state = self.state()
        engine = GameEngine()
        result = engine.execute(state, "buy_item", {"itemId": "seed_wheat", "quantity": 1}, HOUR_MS)
        self.assertIn("小麦种子", result.message)
        self.assertEqual(state.coins, 482)
        self.assertEqual(state.inventory["seed_wheat"].count, 1)
        with self.assertRaises(AppError):
            engine.execute(state, "buy_item", {"itemId": "seed_wheat", "quantity": 0}, HOUR_MS)

    def test_unknown_command_is_rejected(self):
        with self.assertRaises(AppError) as caught:
            GameEngine().execute(self.state(), "not_a_real_command", {}, HOUR_MS)
        self.assertEqual(caught.exception.code, "UNKNOWN_COMMAND")

    def test_develop_and_plant_use_authoritative_rules(self):
        state = self.state()
        state.inventory["seed_wheat"] = InventoryEntry("seed_wheat", 1, HOUR_MS)
        engine = GameEngine()
        engine.execute(state, "develop_plot", {"plotId": 1}, HOUR_MS)
        self.assertEqual(state.coins, 500 - LAND_RULES["developCost"])
        engine.execute(state, "plant", {"plotId": 1, "cropId": "wheat"}, HOUR_MS)
        self.assertEqual(state.plots[1].crop_id, "wheat")
        self.assertNotIn("seed_wheat", state.inventory)

    def test_shovel_removes_crop_without_client_state_upload(self):
        state = self.state()
        state.plots[1].developed = True
        state.plots[1].crop_id = "wheat"
        state.plots[1].progress = 0.5
        result = GameEngine().execute(state, "shovel", {"plotId": 1}, HOUR_MS)
        self.assertIn("小麦", result.message)
        self.assertIsNone(state.plots[1].crop_id)
        self.assertEqual(state.plots[1].progress, 0)

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
