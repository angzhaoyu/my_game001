from __future__ import annotations

from flask import Blueprint, current_app

from ..domain.catalog import public_catalog
from .common import json_body, ok

bp = Blueprint("auth", __name__)


@bp.get("/public/config")
def public_config():
    catalog = public_catalog()
    return ok({"regions": catalog["regions"], "catalogVersion": catalog["version"]})


@bp.post("/auth/wechat")
def wechat_login():
    body = json_body()
    result = current_app.extensions["auth_service"].wechat_login(body.get("code"))
    return ok(result)


@bp.post("/auth/password/login")
def password_login():
    body = json_body()
    result = current_app.extensions["auth_service"].password_login(
        body.get("username"), body.get("password"), body.get("region")
    )
    return ok(result)


@bp.post("/auth/password/register")
def password_register():
    body = json_body()
    result = current_app.extensions["auth_service"].password_register(
        body.get("username"), body.get("password"), body.get("region")
    )
    return ok(result, status=201)
