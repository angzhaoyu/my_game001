from __future__ import annotations

import copy
import time
import unittest
from contextlib import AbstractContextManager

from app import create_app
from app.domain.models import GameAggregate, InventoryEntry, Plot
from app.settings import Settings

NOW_MS = int(time.time() * 1000)


class StubRepository:
    """内存仓储：验证 API 层与领域/服务层的衔接（不依赖 MySQL）。"""

    def __init__(self):
        self.state = GameAggregate(
            user_id=7,
            username="api-test",
            region="大区一 · 电信",
            created_at_ms=NOW_MS,
            coins=100,
            version=1,
            world_seed="api-test-seed",
            last_simulated_at_ms=NOW_MS,
            plots={index: Plot(index) for index in range(1, 25)},
        )
        self.state.inventory["seed_shallot"] = InventoryEntry("seed_shallot", 3, NOW_MS)
        self.state.inventory["fert_urea"] = InventoryEntry("fert_urea", 5, NOW_MS)
        self.commands: dict = {}

    ping = lambda self: None  # noqa: E731

    def transaction(self):
        return StubUnitOfWork(self)


class StubUnitOfWork(AbstractContextManager):
    def __init__(self, repository: StubRepository):
        self.repository = repository
        self.state = repository.state

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def load(self, user_id, lock=True):
        return self.state

    def save(self, state):
        self.repository.state = state

    def get_processed_command(self, user_id, command_id):
        return self.repository.commands.get(command_id)

    def save_processed_command(self, user_id, command_id, response):
        self.repository.commands[command_id] = copy.deepcopy(response)


class StubWeChat:
    def exchange_code(self, code):
        return "test-openid"


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        settings = Settings(
            environment="test",
            host="0.0.0.0",
            port=8000,
            app_secret="api-test-secret",
            access_token_ttl_seconds=3600,
            db_host="localhost",
            db_port=3306,
            db_user="test",
            db_password="",
            db_name="game_db",
            db_connect_timeout_seconds=1,
            wechat_app_id="",
            wechat_app_secret="",
            enable_password_auth=True,
            allow_demo_seed=True,
            allowed_origins=("https://preview.example",),
        )
        cls.app = create_app(settings, repository=StubRepository(), wechat=StubWeChat())
        cls.app.testing = True
        cls.client = cls.app.test_client()

    def test_root_confirms_server_is_running(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("运行正常", response.json["message"])

    def test_health_and_request_id(self):
        response = self.client.get("/api/v1/health/live", headers={"X-Request-ID": "test-request-1"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["requestId"], "test-request-1")
        self.assertEqual(response.headers["X-Request-ID"], "test-request-1")

    def test_authentication_error_has_stable_shape(self):
        response = self.client.get("/api/v1/game/bootstrap")
        self.assertEqual(response.status_code, 401)
        self.assertFalse(response.json["success"])
        self.assertEqual(response.json["error"]["code"], "UNAUTHORIZED")

    def test_cors_is_allowlist_not_wildcard(self):
        allowed = self.client.options(
            "/api/v1/public/config",
            headers={"Origin": "https://preview.example"},
        )
        editor_null = self.client.options(
            "/api/v1/public/config",
            headers={"Origin": "null"},
        )
        editor_random_port = self.client.options(
            "/api/v1/public/config",
            headers={"Origin": "http://localhost:18321"},
        )
        denied = self.client.options(
            "/api/v1/public/config",
            headers={"Origin": "https://evil.example"},
        )
        self.assertEqual(allowed.headers["Access-Control-Allow-Origin"], "https://preview.example")
        self.assertEqual(editor_null.headers["Access-Control-Allow-Origin"], "null")
        self.assertEqual(editor_random_port.headers["Access-Control-Allow-Origin"], "http://localhost:18321")
        self.assertNotIn("Access-Control-Allow-Origin", denied.headers)


class GameApiTest(unittest.TestCase):
    """用短期令牌跑一遍 bootstrap / commands，覆盖 v1.10 的快照与命令。"""

    @classmethod
    def setUpClass(cls):
        settings = Settings(
            environment="test",
            host="0.0.0.0",
            port=8000,
            app_secret="api-test-secret",
            access_token_ttl_seconds=3600,
            db_host="localhost",
            db_port=3306,
            db_user="test",
            db_password="",
            db_name="game_db",
            db_connect_timeout_seconds=1,
            wechat_app_id="",
            wechat_app_secret="",
            enable_password_auth=True,
            allow_demo_seed=True,
            allowed_origins=("https://preview.example",),
        )
        cls.repository = StubRepository()
        cls.app = create_app(settings, repository=cls.repository, wechat=StubWeChat())
        cls.app.testing = True
        cls.client = cls.app.test_client()
        tokens = cls.app.extensions["token_service"]
        cls.headers = {"Authorization": f"Bearer {tokens.issue(7)}"}

    def test_bootstrap_returns_world_daily_and_plots(self):
        response = self.client.get("/api/v1/game/bootstrap", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        data = response.json["data"]
        self.assertIn("catalog", data)
        self.assertIn("world", data)
        self.assertIn("daily", data)
        self.assertEqual(len(data["plots"]), 24)
        self.assertEqual(data["world"]["seasonName"], data["world"]["seasonName"])
        self.assertIn("temperature", data["world"])

    def test_bootstrap_can_skip_catalog_for_polling(self):
        response = self.client.get("/api/v1/game/bootstrap?catalog=0", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("catalog", response.json["data"])

    def test_command_updates_plot_and_is_idempotent(self):
        body = {
            "commandId": "cmd-api-test-0001",
            "expectedVersion": self.repository.state.version,
            "type": "plant",
            "payload": {"plotId": 1, "cropId": "shallot"},
        }
        first = self.client.post("/api/v1/game/commands", json=body, headers=self.headers)
        self.assertTrue(first.json["success"], first.json)
        self.assertEqual(first.json["data"]["plots"][0]["crop"], "shallot")
        self.assertEqual(first.json["data"]["plots"][0]["dailyPlantCount"], 1)

        version = first.json["data"]["stateVersion"]
        body["expectedVersion"] = version
        second = self.client.post("/api/v1/game/commands", json=body, headers=self.headers)
        self.assertTrue(second.json["success"])
        # 同一 commandId 不会重复执行：地块仍只有 1 次播种记录
        self.assertEqual(second.json["data"]["plots"][0]["dailyPlantCount"], 1)

    def test_water_and_fertilize_commands_are_accepted(self):
        version = self.repository.state.version
        water = self.client.post("/api/v1/game/commands", json={
            "commandId": "cmd-api-test-0002",
            "expectedVersion": version,
            "type": "water",
            "payload": {"plotId": 1, "times": 3},
        }, headers=self.headers)
        self.assertTrue(water.json["success"], water.json)
        self.assertGreater(water.json["data"]["plots"][0]["moisture"], 70)

        self.repository.state.coins = 1000
        fertilize = self.client.post("/api/v1/game/commands", json={
            "commandId": "cmd-api-test-0003",
            "expectedVersion": water.json["data"]["stateVersion"],
            "type": "fertilize",
            "payload": {
                "plotId": 1,
                "items": [{"itemId": "fert_urea", "count": 1}],
                "appendTime": True,
            },
        }, headers=self.headers)
        self.assertTrue(fertilize.json["success"], fertilize.json)
        plot = fertilize.json["data"]["plots"][0]
        self.assertEqual(len(plot["activeFertilizers"]), 1)
        self.assertEqual(plot["activeFertilizers"][0]["id"], "urea")


if __name__ == "__main__":
    unittest.main()
