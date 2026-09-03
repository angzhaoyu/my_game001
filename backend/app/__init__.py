from __future__ import annotations

import logging
import uuid
from urllib.parse import urlsplit

from flask import Flask, g, jsonify, request
from werkzeug.exceptions import HTTPException

from .api.auth import bp as auth_bp
from .api.game import bp as game_bp
from .api.health import bp as health_bp
from .domain.errors import AppError
from .repositories.mysql import MySQLRepository
from .services.auth_service import AuthService, WeChatGateway
from .services.game_service import GameService
from .services.token_service import TokenService
from .settings import Settings


def _is_local_preview_origin(origin: str, settings: Settings) -> bool:
    """仅开发环境允许 Cocos Editor 的 file/null/随机 localhost 预览来源。"""
    if settings.is_production:
        return False
    if origin == "null" or origin.startswith("file://"):
        return True
    try:
        parsed = urlsplit(origin)
        return parsed.scheme in {"http", "https"} and parsed.hostname in {"localhost", "127.0.0.1"}
    except ValueError:
        return False


def create_app(settings: Settings | None = None, *, repository=None, wechat=None) -> Flask:
    settings = settings or Settings.from_env()
    repository = repository or MySQLRepository(settings)
    tokens = TokenService(settings.app_secret, settings.access_token_ttl_seconds)
    wechat = wechat or WeChatGateway(settings.wechat_app_id, settings.wechat_app_secret)

    app = Flask(__name__, static_folder=None)
    app.json.ensure_ascii = False
    app.config.update(MAX_CONTENT_LENGTH=64 * 1024, JSON_SORT_KEYS=False)

    @app.get("/")
    def index():
        return jsonify({
            "success": True,
            "message": "随心农场游戏服务器运行正常",
            "health": "/api/v1/health/ready",
        })
    app.extensions["settings"] = settings
    app.extensions["repository"] = repository
    app.extensions["token_service"] = tokens
    app.extensions["auth_service"] = AuthService(repository, settings, tokens, wechat)
    app.extensions["game_service"] = GameService(repository)

    for blueprint in (health_bp, auth_bp, game_bp):
        app.register_blueprint(blueprint, url_prefix="/api/v1")

    @app.before_request
    def request_context():
        supplied = request.headers.get("X-Request-ID", "")
        g.request_id = supplied[:64] if supplied and supplied.replace("-", "").isalnum() else uuid.uuid4().hex
        if request.method == "OPTIONS":
            return "", 204
        return None

    @app.after_request
    def response_headers(response):
        response.headers["X-Request-ID"] = getattr(g, "request_id", "")
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        origin = request.headers.get("Origin", "").rstrip("/")
        origin_allowed = origin in settings.allowed_origins or _is_local_preview_origin(origin, settings)
        if origin and origin_allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
            response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Request-ID"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Access-Control-Max-Age"] = "600"
        return response

    @app.errorhandler(AppError)
    def app_error(error: AppError):
        return jsonify({
            "success": False,
            "requestId": getattr(g, "request_id", ""),
            "error": {
                "code": error.code,
                "message": error.message,
                "retryable": error.retryable,
                "details": error.details,
            },
        }), error.status

    @app.errorhandler(HTTPException)
    def http_error(error: HTTPException):
        return jsonify({
            "success": False,
            "requestId": getattr(g, "request_id", ""),
            "error": {"code": f"HTTP_{error.code}", "message": error.description, "retryable": False},
        }), error.code

    @app.errorhandler(Exception)
    def unexpected_error(error: Exception):
        app.logger.exception("unhandled request error request_id=%s", getattr(g, "request_id", ""))
        return jsonify({
            "success": False,
            "requestId": getattr(g, "request_id", ""),
            "error": {"code": "INTERNAL_ERROR", "message": "服务器开小差了，请稍后重试", "retryable": True},
        }), 500

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    return app
