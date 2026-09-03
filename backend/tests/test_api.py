from __future__ import annotations

import unittest

from app import create_app
from app.settings import Settings


class StubRepository:
    def ping(self):
        return None


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


if __name__ == "__main__":
    unittest.main()
