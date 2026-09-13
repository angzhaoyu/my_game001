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

`server.py` 会像最初版本一样自动连接 MySQL、创建数据库和表，不需要手动执行 SQL 命令；Windows 的 MySQL 服务本身需处于运行状态（通常安装后会自动启动）。

以后每次仍然只双击同一个文件。关闭命令窗口即可停止服务器。即使启动失败，窗口也会停在 `pause`，并把 Python 详细异常写入 `backend/启动错误.log`，不会再一闪而过。

测试账号：`test / test12345 / 大区一 · 电信`。

如果旧 `.env` 仍是示例账号 `game/change-me`，而 MySQL 返回 1045，`server.py` 会自动恢复为原项目的 `root/123456` 并写回 `.env`。如果你的 root 密码也不是 `123456`，再修改 `backend/.env` 中的 `DB_PASSWORD`。

## 入口与数据

- `server.py`：Windows 本地初始化与开发服务器入口。
- `app/__init__.py`：Flask 应用工厂，生产由 Gunicorn 调用。
- `app/manage.py`：迁移、测试账号和定期清理命令。
- 业务分层、事务和权威数据边界见 [架构说明](../docs/ARCHITECTURE.md)。
- 旧原型表 `users/farm_plots/player_inventory` 不再读写；迁移 v1.10 的存档影响见 [数值落地记录](../docs/VALUE_SYSTEM_NOTES.md#迁移注意事项)。

## 维护命令（普通启动不需要手动执行）

以下命令在 `backend/` 目录执行。

```bat
REM 数据库迁移
E:\soft\path\anaconda\envs\yolo_v5\python.exe -m app.manage migrate

REM 首次创建测试账号；重复执行不会重置已有账号数据
E:\soft\path\anaconda\envs\yolo_v5\python.exe -m app.manage seed-demo

REM 清理 7 天前的幂等记录
E:\soft\path\anaconda\envs\yolo_v5\python.exe -m app.manage prune-commands --retention-days 7
```

## Docker / 生产部署

在 `backend/` 目录执行，不影响本地双击启动：

```bash
docker compose up -d --build
```

生产使用 Gunicorn：

```bash
gunicorn --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 30 'app:create_app()'
```

生产配置和安全要求统一见 [微信上线清单](../docs/WECHAT_RELEASE.md)。
