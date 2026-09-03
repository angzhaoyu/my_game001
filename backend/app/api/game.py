from __future__ import annotations

from flask import Blueprint, current_app, g

from .common import authenticated, json_body, ok

bp = Blueprint("game", __name__)


@bp.get("/game/bootstrap")
@authenticated
def bootstrap():
    return ok(current_app.extensions["game_service"].bootstrap(g.user_id))


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
