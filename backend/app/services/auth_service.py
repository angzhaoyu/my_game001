from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict

from ..domain.catalog import REGIONS
from ..domain.errors import AppError
from ..settings import Settings
from .passwords import hash_password, verify_password
from .token_service import TokenService

_USERNAME_RE = re.compile(r"^[\w\u4e00-\u9fff]{3,16}$", re.UNICODE)


class WeChatGateway:
    ENDPOINT = "https://api.weixin.qq.com/sns/jscode2session"

    def __init__(self, app_id: str, app_secret: str) -> None:
        self.app_id = app_id
        self.app_secret = app_secret

    def exchange_code(self, code: str) -> str:
        if not self.app_id or not self.app_secret:
            raise AppError("WECHAT_NOT_CONFIGURED", "服务端尚未配置微信登录", status=503)
        query = urllib.parse.urlencode({
            "appid": self.app_id,
            "secret": self.app_secret,
            "js_code": code,
            "grant_type": "authorization_code",
        })
        try:
            with urllib.request.urlopen(f"{self.ENDPOINT}?{query}", timeout=5) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise AppError("WECHAT_UNAVAILABLE", "微信登录服务暂时不可用", status=503, retryable=True) from exc
        if payload.get("errcode") or not payload.get("openid"):
            raise AppError(
                "WECHAT_LOGIN_FAILED",
                "微信登录凭证无效，请重试",
                status=401,
                details={"wechatCode": payload.get("errcode")},
            )
        return str(payload["openid"])


class AuthService:
    def __init__(self, repository: Any, settings: Settings, tokens: TokenService, wechat: WeChatGateway) -> None:
        self.repository = repository
        self.settings = settings
        self.tokens = tokens
        self.wechat = wechat

    def wechat_login(self, code: str) -> Dict[str, Any]:
        if not isinstance(code, str) or not 6 <= len(code) <= 256:
            raise AppError("INVALID_WECHAT_CODE", "微信登录凭证无效")
        openid = self.wechat.exchange_code(code)
        now_ms = int(time.time() * 1000)
        user = self.repository.find_or_create_wechat_user(openid, now_ms)
        return self._session(user)

    def password_login(self, username: str, password: str, region: str) -> Dict[str, Any]:
        self._require_password_auth()
        username = username.strip() if isinstance(username, str) else ""
        if not isinstance(password, str):
            raise AppError("AUTH_FAILED", "账号或密码错误", status=401)
        user = self.repository.find_user_by_username(username)
        if not user or not verify_password(password, user.get("password_hash")):
            raise AppError("AUTH_FAILED", "账号或密码错误", status=401)
        if user["region"] != region:
            raise AppError("REGION_MISMATCH", f"该账号属于【{user['region']}】", status=403)
        return self._session(user)

    def password_register(self, username: str, password: str, region: str) -> Dict[str, Any]:
        self._require_password_auth()
        username = username.strip() if isinstance(username, str) else ""
        if not _USERNAME_RE.fullmatch(username):
            raise AppError("INVALID_USERNAME", "账号需为 3-16 位中文、字母、数字或下划线")
        if not isinstance(password, str) or not 8 <= len(password) <= 64:
            raise AppError("INVALID_PASSWORD", "密码长度需为 8-64 位")
        if region not in REGIONS:
            raise AppError("INVALID_REGION", "请选择正确的大区")
        user = self.repository.create_password_user(
            username, hash_password(password), region, int(time.time() * 1000)
        )
        return self._session(user)

    def _session(self, user: Dict[str, Any]) -> Dict[str, Any]:
        user_id = int(user["id"])
        return {
            "accessToken": self.tokens.issue(user_id),
            "expiresIn": self.settings.access_token_ttl_seconds,
            "user": {
                "id": user_id,
                "username": user.get("display_name") or user.get("username") or f"玩家{user_id}",
                "region": user["region"],
            },
        }

    def _require_password_auth(self) -> None:
        if not self.settings.enable_password_auth:
            raise AppError("PASSWORD_AUTH_DISABLED", "正式环境仅支持微信登录", status=404)
