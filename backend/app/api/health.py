from __future__ import annotations

from flask import Blueprint, current_app

from .common import ok

bp = Blueprint("health", __name__)


@bp.get("/health/live")
def live():
    return ok({"status": "up"})


@bp.get("/health/ready")
def ready():
    current_app.extensions["repository"].ping()
    return ok({"status": "ready"})
