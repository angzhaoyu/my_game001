from __future__ import annotations

import time
from typing import Any, Dict

from ..domain.errors import AppError, VersionConflictError
from ..domain.game import GameEngine
from ..domain.serialization import snapshot


class GameService:
    def __init__(self, repository: Any, engine: GameEngine | None = None, clock=None) -> None:
        self.repository = repository
        self.engine = engine or GameEngine()
        self.clock = clock or (lambda: int(time.time() * 1000))

    def bootstrap(self, user_id: int) -> Dict[str, Any]:
        now_ms = int(self.clock())
        with self.repository.transaction() as unit:
            state = unit.load(user_id, lock=True)
            if self.engine.advance(state, now_ms):
                state.version += 1
                unit.save(state)
            return snapshot(state, now_ms, include_catalog=True)

    def command(
        self,
        user_id: int,
        command_id: str,
        expected_version: int,
        command_type: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        self._validate_command_id(command_id)
        if isinstance(expected_version, bool) or not isinstance(expected_version, int) or expected_version < 1:
            raise AppError("INVALID_VERSION", "expectedVersion 必须是正整数")
        if not isinstance(payload, dict):
            raise AppError("INVALID_PAYLOAD", "payload 必须是对象")

        now_ms = int(self.clock())
        with self.repository.transaction() as unit:
            # 即使第一次响应丢失，重试相同 ID 也不会再次执行。返回“当前”快照而不是
            # 旧响应中的快照，避免另一台设备已前进后客户端状态倒退。
            state = unit.load(user_id, lock=True)
            processed = unit.get_processed_command(user_id, command_id)
            if processed is not None:
                replay = snapshot(state, now_ms, include_catalog=False)
                replay["message"] = processed.get("message", "操作已确认")
                replay["commandId"] = command_id
                return replay
            self.engine.advance(state, now_ms)
            if state.version != expected_version:
                raise VersionConflictError(state.version)

            result = self.engine.execute(state, command_type, payload, now_ms)
            state.version += 1
            unit.save(state)
            response = snapshot(state, now_ms, include_catalog=False)
            response["message"] = result.message
            response["commandId"] = command_id
            unit.save_processed_command(user_id, command_id, response)
            return response

    @staticmethod
    def _validate_command_id(command_id: str) -> None:
        if not isinstance(command_id, str) or not 8 <= len(command_id) <= 64:
            raise AppError("INVALID_COMMAND_ID", "commandId 长度必须为 8-64")
        allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
        if any(char not in allowed for char in command_id):
            raise AppError("INVALID_COMMAND_ID", "commandId 格式无效")
