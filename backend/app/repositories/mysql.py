"""MySQL 持久化适配器。

领域层不知道 SQL；所有会修改金币/背包/农场的操作都在同一事务内执行，并锁定
player_states 行，从而保证多个设备/进程并发时不会重复扣款或重复收获。
"""
from __future__ import annotations

import json
from contextlib import AbstractContextManager
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from ..domain.catalog import ITEMS, REGIONS, initial_inventory
from ..domain.errors import AppError
from ..domain.models import GameAggregate, InventoryEntry, Plot
from ..settings import Settings

try:
    import pymysql
    from pymysql.cursors import DictCursor
except ImportError:  # 允许只运行不需要数据库的领域单元测试
    pymysql = None
    DictCursor = None


def _epoch_ms(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return int(value.timestamp() * 1000)
    return int(value)


class MySQLUnitOfWork(AbstractContextManager):
    def __init__(self, repository: "MySQLRepository") -> None:
        self.repository = repository
        self.conn = None

    def __enter__(self) -> "MySQLUnitOfWork":
        self.conn = self.repository.connect()
        self.conn.begin()
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        assert self.conn is not None
        try:
            if exc_type is None:
                self.conn.commit()
            else:
                self.conn.rollback()
        finally:
            self.conn.close()
        return False

    def load(self, user_id: int, *, lock: bool = True) -> GameAggregate:
        assert self.conn is not None
        suffix = " FOR UPDATE" if lock else ""
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT u.id,u.username,u.display_name,u.region,u.created_at,"
                "p.coins,p.diamonds,p.level,p.exp,p.energy,p.version,p.last_simulated_at_ms "
                "FROM accounts u JOIN player_states p ON p.user_id=u.id WHERE u.id=%s" + suffix,
                (user_id,),
            )
            row = cur.fetchone()
            if not row:
                raise AppError("USER_NOT_FOUND", "玩家不存在", status=404)
            cur.execute(
                "SELECT item_id,count,acquired_at_ms FROM player_items WHERE user_id=%s",
                (user_id,),
            )
            inventory_rows = cur.fetchall()
            cur.execute(
                "SELECT plot_index,developed,water,fertilizer,crop_id,planted_at_ms,progress,"
                "harvestable,last_boost_key,last_watered_at_ms FROM player_farm_plots "
                "WHERE user_id=%s ORDER BY plot_index",
                (user_id,),
            )
            plot_rows = cur.fetchall()

        aggregate = GameAggregate(
            user_id=row["id"],
            username=row["display_name"] or row["username"] or f"玩家{row['id']}",
            region=row["region"],
            created_at_ms=_epoch_ms(row["created_at"]),
            coins=int(row["coins"]),
            diamonds=int(row["diamonds"]),
            level=int(row["level"]),
            exp=int(row["exp"]),
            energy=int(row["energy"]),
            version=int(row["version"]),
            last_simulated_at_ms=int(row["last_simulated_at_ms"] or 0),
        )
        aggregate.inventory = {
            str(item["item_id"]): InventoryEntry(
                str(item["item_id"]), int(item["count"]), int(item["acquired_at_ms"])
            )
            for item in inventory_rows
            if item["item_id"] in ITEMS and int(item["count"]) > 0
        }
        aggregate.plots = {
            int(plot["plot_index"]): Plot(
                id=int(plot["plot_index"]),
                developed=bool(plot["developed"]),
                water=float(plot["water"]),
                fertilizer=float(plot["fertilizer"]),
                crop_id=plot["crop_id"],
                planted_at_ms=int(plot["planted_at_ms"] or 0),
                progress=float(plot["progress"]),
                harvestable=bool(plot["harvestable"]),
                last_boost_key=plot["last_boost_key"] or "",
                last_watered_at_ms=int(plot["last_watered_at_ms"] or 0),
            )
            for plot in plot_rows
        }
        # 对早期或不完整账号补齐地块，保存时会落库。
        for plot_id in range(1, 25):
            aggregate.plots.setdefault(plot_id, Plot(plot_id))
        return aggregate

    def save(self, state: GameAggregate) -> None:
        assert self.conn is not None
        with self.conn.cursor() as cur:
            cur.execute(
                "UPDATE player_states SET coins=%s,diamonds=%s,level=%s,exp=%s,energy=%s,"
                "version=%s,last_simulated_at_ms=%s WHERE user_id=%s",
                (
                    state.coins, state.diamonds, state.level, state.exp, state.energy,
                    state.version, state.last_simulated_at_ms, state.user_id,
                ),
            )
            plot_rows = [
                (
                    state.user_id, plot.id, plot.developed, plot.water, plot.fertilizer,
                    plot.crop_id, plot.planted_at_ms, plot.progress, plot.harvestable,
                    plot.last_boost_key, plot.last_watered_at_ms,
                )
                for plot in state.plots.values()
            ]
            cur.executemany(
                "INSERT INTO player_farm_plots "
                "(user_id,plot_index,developed,water,fertilizer,crop_id,planted_at_ms,progress,"
                "harvestable,last_boost_key,last_watered_at_ms) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON DUPLICATE KEY UPDATE developed=VALUES(developed),water=VALUES(water),"
                "fertilizer=VALUES(fertilizer),crop_id=VALUES(crop_id),"
                "planted_at_ms=VALUES(planted_at_ms),progress=VALUES(progress),"
                "harvestable=VALUES(harvestable),last_boost_key=VALUES(last_boost_key),"
                "last_watered_at_ms=VALUES(last_watered_at_ms)",
                plot_rows,
            )
            cur.execute("DELETE FROM player_items WHERE user_id=%s", (state.user_id,))
            inventory_rows = [
                (state.user_id, row.item_id, row.count, row.acquired_at_ms)
                for row in state.inventory.values()
                if row.count > 0 and row.item_id in ITEMS
            ]
            if inventory_rows:
                cur.executemany(
                    "INSERT INTO player_items (user_id,item_id,count,acquired_at_ms) VALUES (%s,%s,%s,%s)",
                    inventory_rows,
                )

    def get_processed_command(self, user_id: int, command_id: str) -> Optional[Dict[str, Any]]:
        assert self.conn is not None
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT response_json FROM processed_commands WHERE user_id=%s AND command_id=%s FOR UPDATE",
                (user_id, command_id),
            )
            row = cur.fetchone()
        if not row:
            return None
        raw = row["response_json"]
        return json.loads(raw) if isinstance(raw, str) else raw

    def save_processed_command(self, user_id: int, command_id: str, response: Dict[str, Any]) -> None:
        assert self.conn is not None
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO processed_commands (user_id,command_id,response_json) VALUES (%s,%s,%s)",
                (user_id, command_id, json.dumps(response, ensure_ascii=False, separators=(",", ":"))),
            )


class MySQLRepository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def connect(self, *, database: bool = True):
        if pymysql is None:
            raise RuntimeError("未安装 PyMySQL，请执行 pip install -r requirements.txt")
        kwargs = dict(
            host=self.settings.db_host,
            port=self.settings.db_port,
            user=self.settings.db_user,
            password=self.settings.db_password,
            charset="utf8mb4",
            cursorclass=DictCursor,
            autocommit=False,
            connect_timeout=self.settings.db_connect_timeout_seconds,
            read_timeout=10,
            write_timeout=10,
            init_command="SET time_zone = '+00:00'",
        )
        if database:
            kwargs["database"] = self.settings.db_name
        return pymysql.connect(**kwargs)

    def transaction(self) -> MySQLUnitOfWork:
        return MySQLUnitOfWork(self)

    def ping(self) -> None:
        conn = self.connect()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        finally:
            conn.close()

    def find_user_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        conn = self.connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id,username,password_hash,display_name,region FROM accounts WHERE username=%s",
                    (username,),
                )
                return cur.fetchone()
        finally:
            conn.close()

    def find_or_create_wechat_user(self, openid: str, now_ms: int) -> Dict[str, Any]:
        conn = self.connect()
        try:
            conn.begin()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id,username,display_name,region FROM accounts WHERE wx_openid=%s",
                    (openid,),
                )
                row = cur.fetchone()
                if not row:
                    display_name = f"农场主{openid[-6:]}"
                    cur.execute(
                        "INSERT INTO accounts (wx_openid,display_name,region) VALUES (%s,%s,%s)",
                        (openid, display_name, REGIONS[0]),
                    )
                    user_id = int(cur.lastrowid)
                    self._initialize_player(cur, user_id, now_ms)
                    row = {"id": user_id, "username": None, "display_name": display_name, "region": REGIONS[0]}
            conn.commit()
            return row
        except pymysql.err.IntegrityError:
            # 两个首次登录请求可能同时插入同一 openid；唯一键胜出的账号即为最终账号。
            conn.rollback()
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id,username,display_name,region FROM accounts WHERE wx_openid=%s",
                    (openid,),
                )
                row = cur.fetchone()
            if row:
                return row
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def create_password_user(
        self, username: str, password_hash: str, region: str, now_ms: int, *, display_name: str | None = None
    ) -> Dict[str, Any]:
        conn = self.connect()
        try:
            conn.begin()
            with conn.cursor() as cur:
                try:
                    cur.execute(
                        "INSERT INTO accounts (username,password_hash,display_name,region) VALUES (%s,%s,%s,%s)",
                        (username, password_hash, display_name or username, region),
                    )
                except pymysql.err.IntegrityError as exc:
                    raise AppError("DUPLICATE_USERNAME", "该账号已被注册", status=409) from exc
                user_id = int(cur.lastrowid)
                self._initialize_player(cur, user_id, now_ms)
            conn.commit()
            return {"id": user_id, "username": username, "display_name": display_name or username, "region": region}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def prune_processed_commands(self, retention_days: int = 7) -> int:
        conn = self.connect()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM processed_commands WHERE created_at < "
                    "DATE_SUB(UTC_TIMESTAMP(3), INTERVAL %s DAY)",
                    (max(1, retention_days),),
                )
                deleted = int(cur.rowcount)
            conn.commit()
            return deleted
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def grant_demo_items(self, user_id: int, items: Dict[str, int], coins: int, now_ms: int) -> None:
        conn = self.connect()
        try:
            conn.begin()
            with conn.cursor() as cur:
                cur.execute("UPDATE player_states SET coins=%s WHERE user_id=%s", (coins, user_id))
                for item_id, count in items.items():
                    if item_id not in ITEMS:
                        continue
                    cur.execute(
                        "INSERT INTO player_items (user_id,item_id,count,acquired_at_ms) VALUES (%s,%s,%s,%s) "
                        "ON DUPLICATE KEY UPDATE count=VALUES(count)",
                        (user_id, item_id, count, now_ms),
                    )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    @staticmethod
    def _initialize_player(cur, user_id: int, now_ms: int) -> None:
        cur.execute(
            "INSERT INTO player_states (user_id,last_simulated_at_ms) VALUES (%s,%s)",
            (user_id, now_ms),
        )
        cur.executemany(
            "INSERT INTO player_farm_plots (user_id,plot_index) VALUES (%s,%s)",
            [(user_id, index) for index in range(1, 25)],
        )
        cur.executemany(
            "INSERT INTO player_items (user_id,item_id,count,acquired_at_ms) VALUES (%s,%s,%s,%s)",
            [(user_id, item_id, count, now_ms) for item_id, count in initial_inventory().items()],
        )
