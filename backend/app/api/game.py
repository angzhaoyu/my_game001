from __future__ import annotations

from flask import Blueprint, current_app, g, request

from .common import authenticated, json_body, ok

bp = Blueprint("game", __name__)


@bp.get("/game/bootstrap")
@authenticated
def bootstrap():
    # 轮询刷新（?catalog=0）不重复下发目录，减少小游戏流量。
    flag = request.args.get("catalog", "1").strip().lower()
    include_catalog = flag not in {"0", "false", "no"}
    service = current_app.extensions["game_service"]
    return ok(service.bootstrap(g.user_id, include_catalog=include_catalog))


@bp.post("/game/commands")
@authenticated
def command():
    body = json_body()
    result = current_app.extensions["game_service"].command(
        g.user_id,
        body.get("commandId"),
        body.get("expectedVersion"),
        body.get("type"),
        body.get("payload", {}),
    )
    return ok(result)
