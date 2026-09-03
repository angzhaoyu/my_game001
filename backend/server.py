"""Windows 本地一键启动使用的唯一 Python 入口。

不创建环境、不安装依赖；只生成本地配置、迁移数据库、初始化一次测试账号并启动 Flask。
"""
from __future__ import annotations

import os
import sys
import traceback
import warnings
from importlib import import_module
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
ENV_FILE = BACKEND_DIR / ".env"
ERROR_LOG = BACKEND_DIR / "启动错误.log"

LOCAL_ENV = """APP_ENV=development
HOST=0.0.0.0
PORT=8000
APP_SECRET=local-double-click-development-secret
ACCESS_TOKEN_TTL_SECONDS=7200
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=123456
DB_NAME=game_db
DB_CONNECT_TIMEOUT_SECONDS=5
WECHAT_APP_ID=
WECHAT_APP_SECRET=
ENABLE_PASSWORD_AUTH=true
ALLOW_DEMO_SEED=true
ALLOWED_ORIGINS=http://localhost:7456,http://127.0.0.1:7456
"""


def ensure_local_config() -> None:
    if ENV_FILE.exists():
        print("[1/3] 本地配置已就绪。", flush=True)
        return
    ENV_FILE.write_text(LOCAL_ENV, encoding="utf-8")
    print("[1/3] 已生成本地配置 backend/.env。", flush=True)


def write_error_log() -> None:
    ERROR_LOG.write_text(traceback.format_exc(), encoding="utf-8")
    print(f"详细错误已保存到：{ERROR_LOG}", flush=True)


def save_local_database_credentials(username: str, password: str) -> None:
    """修复早期 .env.example 留下的 game/change-me，本地启动无需手工改文件。"""
    values = {"DB_USER": username, "DB_PASSWORD": password}
    lines = ENV_FILE.read_text(encoding="utf-8").splitlines() if ENV_FILE.exists() else []
    found = set()
    output = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line else ""
        if key in values:
            output.append(f"{key}={values[key]}")
            found.add(key)
        else:
            output.append(line)
    for key, value in values.items():
        if key not in found:
            output.append(f"{key}={value}")
    ENV_FILE.write_text("\n".join(output) + "\n", encoding="utf-8")
    # Settings.from_env 以真实环境变量为优先级，因此本进程也要同步更新。
    os.environ.update(values)


def main() -> int:
    ensure_local_config()
    warnings.filterwarnings("ignore", message="Python 3\.8 is no longer supported.*")
    try:
        import_module("flask")
        import_module("pymysql")
        from app import create_app
        from app.manage import migrate, seed_demo
        from app.repositories.mysql import MySQLRepository
        from app.settings import Settings
    except ModuleNotFoundError as exc:
        print(f"[启动失败] 指定的 yolo_v5 环境缺少模块：{exc.name}", flush=True)
        print("按要求，启动脚本不会创建环境，也不会自动安装依赖。", flush=True)
        write_error_log()
        return 1

    try:
        settings = Settings.from_env()
        repository = MySQLRepository(settings)

        print("[2/3] 正在检查数据库结构和测试账号...", flush=True)
        try:
            migrate(repository, settings)
        except Exception as database_error:
            error_code = database_error.args[0] if getattr(database_error, "args", None) else None
            can_use_legacy = (
                error_code == 1045
                and not settings.is_production
                and (settings.db_user, settings.db_password) != ("root", "123456")
            )
            if not can_use_legacy:
                raise
            print(
                f"检测到 MySQL 拒绝账号 {settings.db_user!r}，"
                "正在自动恢复原项目账号 root / 123456...",
                flush=True,
            )
            save_local_database_credentials("root", "123456")
            settings = Settings.from_env()
            repository = MySQLRepository(settings)
            migrate(repository, settings)

        seed_demo(repository, settings)
        app = create_app(settings, repository=repository)
        ERROR_LOG.unlink(missing_ok=True)
        print("[3/3] 游戏服务器启动完成：http://127.0.0.1:8000", flush=True)
        print("测试账号：test / test12345 / 大区一 · 电信", flush=True)
        print("关闭此窗口即可停止服务器。", flush=True)
        app.run(host=settings.host, port=settings.port, debug=False)
        return 0
    except KeyboardInterrupt:
        return 0
    except Exception:
        print("[启动失败] 数据库初始化或服务器启动失败，具体原因如下：", flush=True)
        traceback.print_exc()
        write_error_log()
        return 1


if __name__ == "__main__":
    sys.exit(main())
