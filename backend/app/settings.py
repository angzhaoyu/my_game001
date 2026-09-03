from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple


def _load_local_env() -> None:
    """开发便利：读取 backend/.env；真实环境变量优先，不覆盖容器/密钥服务注入。"""
    path = Path(__file__).resolve().parents[1] / ".env"
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key.replace("_", "").isalnum():
            os.environ.setdefault(key, value)


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _origins(value: str) -> Tuple[str, ...]:
    return tuple(origin.strip().rstrip("/") for origin in value.split(",") if origin.strip())


@dataclass(frozen=True)
class Settings:
    environment: str
    host: str
    port: int
    app_secret: str
    access_token_ttl_seconds: int
    db_host: str
    db_port: int
    db_user: str
    db_password: str
    db_name: str
    db_connect_timeout_seconds: int
    wechat_app_id: str
    wechat_app_secret: str
    enable_password_auth: bool
    allow_demo_seed: bool
    allowed_origins: Tuple[str, ...]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @classmethod
    def from_env(cls) -> "Settings":
        _load_local_env()
        environment = os.getenv("APP_ENV", "development").strip().lower()
        settings = cls(
            environment=environment,
            host=os.getenv("HOST", "0.0.0.0"),
            port=int(os.getenv("PORT", "8000")),
            app_secret=os.getenv("APP_SECRET", "dev-only-change-me"),
            access_token_ttl_seconds=int(os.getenv("ACCESS_TOKEN_TTL_SECONDS", "7200")),
            db_host=os.getenv("DB_HOST", "127.0.0.1"),
            db_port=int(os.getenv("DB_PORT", "3306")),
            db_user=os.getenv("DB_USER", "game"),
            db_password=os.getenv("DB_PASSWORD", ""),
            db_name=os.getenv("DB_NAME", "game_db"),
            db_connect_timeout_seconds=int(os.getenv("DB_CONNECT_TIMEOUT_SECONDS", "5")),
            wechat_app_id=os.getenv("WECHAT_APP_ID", ""),
            wechat_app_secret=os.getenv("WECHAT_APP_SECRET", ""),
            enable_password_auth=_bool("ENABLE_PASSWORD_AUTH", environment != "production"),
            allow_demo_seed=_bool("ALLOW_DEMO_SEED", environment != "production"),
            allowed_origins=_origins(os.getenv(
                "ALLOWED_ORIGINS",
                "http://localhost:7456,http://127.0.0.1:7456" if environment != "production" else "",
            )),
        )
        settings.validate()
        return settings

    def validate(self) -> None:
        if not self.db_name.replace("_", "").isalnum():
            raise RuntimeError("DB_NAME 只能包含字母、数字和下划线")
        if self.is_production:
            if len(self.app_secret) < 32 or self.app_secret == "dev-only-change-me":
                raise RuntimeError("生产环境 APP_SECRET 必须是至少 32 位的随机字符串")
            if not self.db_password:
                raise RuntimeError("生产环境必须设置 DB_PASSWORD")
            if not self.wechat_app_id or not self.wechat_app_secret:
                raise RuntimeError("生产环境必须设置 WECHAT_APP_ID/WECHAT_APP_SECRET")
            if self.enable_password_auth:
                raise RuntimeError("生产环境应关闭 ENABLE_PASSWORD_AUTH")
