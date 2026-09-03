from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from .repositories.mysql import MySQLRepository
from .services.passwords import hash_password
from .settings import Settings

MIGRATIONS_DIR = Path(__file__).resolve().parents[1] / "migrations"


def migrate(repository: MySQLRepository, settings: Settings) -> None:
    # 已存在的库无需 CREATE 全局权限；仅在库不存在时尝试创建。
    try:
        probe = repository.connect()
        probe.close()
    except Exception as exc:
        if getattr(exc, "args", [None])[0] != 1049:  # MySQL: Unknown database
            raise
        conn = repository.connect(database=False)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"CREATE DATABASE `{settings.db_name}` "
                    "DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            conn.commit()
        finally:
            conn.close()

    conn = repository.connect()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "version VARCHAR(64) PRIMARY KEY,"
                "applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) "
                "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            )
            cur.execute("SELECT version FROM schema_migrations")
            applied = {row["version"] for row in cur.fetchall()}
            for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
                if path.stem in applied:
                    continue
                statements = [part.strip() for part in path.read_text(encoding="utf-8").split(";") if part.strip()]
                for statement in statements:
                    cur.execute(statement)
                cur.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (path.stem,))
                print(f"applied migration: {path.name}")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def seed_demo(repository: MySQLRepository, settings: Settings) -> None:
    if not settings.allow_demo_seed:
        raise RuntimeError("演示数据已禁用；仅在非生产环境设置 ALLOW_DEMO_SEED=true")
    username, password = "test", "test12345"
    existing = repository.find_user_by_username(username)
    if existing:
        print("demo account already exists: test / test12345 / 大区一 · 电信")
        return

    now_ms = int(time.time() * 1000)
    user = repository.create_password_user(
        username, hash_password(password), "大区一 · 电信", now_ms, display_name="测试农场主"
    )
    user_id = int(user["id"])
    repository.grant_demo_items(
        user_id,
        {
            "seed_wheat": 20,
            "seed_corn": 10,
            "seed_strawberry": 5,
            "fert_organic": 10,
            "fert_compound": 10,
        },
        coins=5_000,
        now_ms=now_ms,
    )
    print("demo account ready: test / test12345 / 大区一 · 电信")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="农场服务管理命令")
    parser.add_argument("command", choices=["migrate", "seed-demo", "prune-commands"])
    parser.add_argument("--retention-days", type=int, default=7)
    args = parser.parse_args(argv)
    settings = Settings.from_env()
    repository = MySQLRepository(settings)
    if args.command == "migrate":
        migrate(repository, settings)
    elif args.command == "seed-demo":
        seed_demo(repository, settings)
    else:
        deleted = repository.prune_processed_commands(max(1, args.retention_days))
        print(f"deleted processed commands: {deleted}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
