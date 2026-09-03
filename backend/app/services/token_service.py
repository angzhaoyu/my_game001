"""无额外依赖的短期 HS256 access token。微信端令牌过期后重新 wx.login 即可。"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import time
from typing import Any, Dict

from ..domain.errors import UnauthorizedError


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(raw: str) -> bytes:
    return base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))


class TokenService:
    def __init__(self, secret: str, ttl_seconds: int) -> None:
        self.secret = secret.encode("utf-8")
        self.ttl_seconds = ttl_seconds

    def issue(self, user_id: int, now_seconds: int | None = None) -> str:
        now = int(time.time() if now_seconds is None else now_seconds)
        header = {"alg": "HS256", "typ": "JWT"}
        payload = {"sub": str(user_id), "iat": now, "exp": now + self.ttl_seconds, "typ": "access"}
        head = _b64encode(json.dumps(header, separators=(",", ":")).encode())
        body = _b64encode(json.dumps(payload, separators=(",", ":")).encode())
        signature = _b64encode(hmac.new(self.secret, f"{head}.{body}".encode(), hashlib.sha256).digest())
        return f"{head}.{body}.{signature}"

    def verify(self, token: str, now_seconds: int | None = None) -> int:
        try:
            head, body, signature = token.split(".")
            expected = _b64encode(hmac.new(self.secret, f"{head}.{body}".encode(), hashlib.sha256).digest())
            if not hmac.compare_digest(signature, expected):
                raise ValueError("signature")
            payload: Dict[str, Any] = json.loads(_b64decode(body))
            if not isinstance(payload, dict):
                raise ValueError("payload")
            now = int(time.time() if now_seconds is None else now_seconds)
            if payload.get("typ") != "access" or int(payload["exp"]) <= now:
                raise ValueError("expired")
            return int(payload["sub"])
        except (ValueError, KeyError, TypeError, AttributeError, UnicodeDecodeError, binascii.Error, json.JSONDecodeError):
            raise UnauthorizedError()
