# 后端说明

## Windows 本地启动：只需双击

启动脚本固定使用你指定的解释器：

```text
E:\soft\path\anaconda\envs\yolo_v5\python.exe
```

请确保该环境已经有 `Flask` 和 `PyMySQL`，并且 MySQL 已启动（沿用原项目配置：`root / 123456`）。脚本不会创建 Conda/venv 环境，也不会执行 pip 安装。

然后直接双击：

```text
启动游戏服务器.bat
```

第一次双击时脚本会自动完成：

- 生成本地 `.env`；
- 创建/升级数据库表；
- 创建后端测试账号；
- 启动 `http://127.0.0.1:8000`。

不会创建环境或安装依赖。`server.py` 会像最初版本一样自动连接 MySQL、创建数据库和表，不需要手动执行 SQL 命令；Windows 的 MySQL 服务本身需处于运行状态（通常安装后会自动启动）。

以后每次仍然只双击同一个文件。关闭命令窗口即可停止服务器。即使启动失败，窗口也会停在 `pause`，并把 Python 详细异常写入 `backend/启动错误.log`，不会再一闪而过。

测试账号：`test / test12345 / 大区一 · 电信`。

如果旧 `.env` 仍是示例账号 `game/change-me`，而 MySQL 返回 1045，`server.py` 会自动恢复为原项目的 `root/123456` 并写回 `.env`。如果你的 root 密码也不是 `123456`，再修改 `backend/.env` 中的 `DB_PASSWORD`。

## 后端文件是否有重复功能？

已再次合并和清理：删除了重复的 `factory.py`、`wsgi.py`，应用工厂统一放在 `app/__init__.py`。当前入口和目录各自只有一个职责：

| 文件/目录 | 唯一职责 |
|---|---|
| `启动游戏服务器.bat` | Windows 本地一键初始化并启动 |
| `server.py` | bat 调用的唯一 Python 入口；自动建库/迁移、测试账号并启动 Flask |
| `app/__init__.py` | 创建并装配 Flask 应用 |
| `app/api/` | HTTP 路由与鉴权边界 |
| `app/domain/` | 游戏规则、模型和服务端配置 |
| `app/services/` | 登录、bootstrap、幂等命令用例 |
| `app/repositories/` | MySQL 查询和事务 |
| `app/manage.py` | 数据库迁移、首次测试账号、定期清理 |
| `migrations/` | 有版本的数据库结构 |
| `tests/` | 自动测试，不参与运行 |
| `Dockerfile` / `compose.yaml` | 部署或 Docker 开发，不是 Windows 本地入口 |
| `requirements-dev.txt` | 只比正式依赖多测试工具 |

`api/auth.py`、`api/game.py`、`api/health.py` 看起来相似，但分别负责登录、游戏和健康检查，并非重复实现。

## 数据规则

- MySQL 是玩家金币、背包和农场的权威来源；
- 客户端不能提交整包数据覆盖数据库；
- 每个写操作使用 `commandId + stateVersion` 防重复扣款和多设备覆盖；
- 游戏配置和测试数据由后端创建；
- 旧原型表 `users/farm_plots/player_inventory` 不再读写，新表使用 `accounts/player_states/player_farm_plots/player_items`。

## 维护命令（普通启动不需要手动执行）

```bat
REM 数据库迁移
E:\soft\path\anaconda\envs\yolo_v5\python.exe -m app.manage migrate

REM 首次创建测试账号；重复执行不会重置已有账号数据
E:\soft\path\anaconda\envs\yolo_v5\python.exe -m app.manage seed-demo

REM 清理 7 天前的幂等记录
E:\soft\path\anaconda\envs\yolo_v5\python.exe -m app.manage prune-commands --retention-days 7
```

## Docker / 生产部署

这部分是部署人员使用的，不影响本地双击启动：

```bash
docker compose up -d --build
```

生产使用 Gunicorn：

```bash
gunicorn --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 30 'app:create_app()'
```

生产环境必须设置真实 `APP_SECRET`、`DB_*`、`WECHAT_APP_ID/WECHAT_APP_SECRET`，并关闭 `ENABLE_PASSWORD_AUTH` 与 `ALLOW_DEMO_SEED`。完整上线清单见 `../docs/WECHAT_RELEASE.md`。
