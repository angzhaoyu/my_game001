from __future__ import annotations

from functools import wraps
from typing import Any, Callable, Dict, TypeVar

from flask import current_app, g, jsonify, request

from ..domain.errors import AppError, UnauthorizedError

F = TypeVar("F", bound=Callable[..., Any])


def ok(data: Dict[str, Any] | None = None, *, status: int = 200):
    body: Dict[str, Any] = {"success": True, "requestId": getattr(g, "request_id", "")}
    if data is not None:
        body["data"] = data
    return jsonify(body), status


def json_body() -> Dict[str, Any]:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise AppError("INVALID_JSON", "请求体必须是 JSON 对象")
    return body


def authenticated(view: F) -> F:
    @wraps(view)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            raise UnauthorizedError()
        token = header[7:].strip()
        tokens = current_app.extensions["token_service"]
        g.user_id = tokens.verify(token)
        return view(*args, **kwargs)
    return wrapped  # type: ignore[return-value]
