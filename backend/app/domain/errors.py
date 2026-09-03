from __future__ import annotations

from typing import Any, Dict, Optional


class AppError(Exception):
    """可安全返回给客户端的业务错误。"""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status: int = 400,
        retryable: bool = False,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable
        self.details = details or {}


class UnauthorizedError(AppError):
    def __init__(self, message: str = "登录状态已失效，请重新登录") -> None:
        super().__init__("UNAUTHORIZED", message, status=401)


class VersionConflictError(AppError):
    def __init__(self, current_version: int) -> None:
        super().__init__(
            "VERSION_CONFLICT",
            "游戏状态已在其他设备更新，正在重新同步",
            status=409,
            retryable=True,
            details={"currentVersion": current_version},
        )
