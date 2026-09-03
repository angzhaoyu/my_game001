# 随心农场 · 微信小游戏工程骨架

这是一个面向微信小游戏上线的 Cocos Creator + Flask + MySQL 农场项目。项目已把原先的客户端整包存档改为**服务端权威命令模型**，并补充微信登录、短期令牌、幂等写入、状态版本、弱网重试、数据库迁移、容器与自动测试。

团队日常开发只需要先看 [Explain.md 的“日常开发怎么分工”](Explain.md#日常开发怎么分工)；不要求每个人理解全部文件。

## 快速开始（本地联调）

### 1. 启动后端

Windows 本地开发直接双击：

```text
backend/启动游戏服务器.bat
```

脚本固定使用 `E:\soft\path\anaconda\envs\yolo_v5\python.exe`，不会创建环境或安装依赖。首次运行只会自动生成配置、迁移数据库并创建测试账号；以后仍然只双击该文件。默认沿用原项目 MySQL 配置 `root / 123456`，密码不同时修改一次 `backend/.env` 即可。

测试账号：`test / test12345 / 大区一 · 电信`。测试数据由后端创建，不存在客户端测试背包。

Docker 和生产启动属于部署方式，见 [backend/README.md](backend/README.md)，普通本地开发不需要执行那些命令。

### 2. 检查

```bash
PYTHONPATH=backend python -m unittest discover -s backend/tests -v
cd frontend && npm ci && npm run typecheck:core
```

### 3. 接入 Cocos

按 `frontend/README.md` 将 `frontend/scripts`、场景节点与资源放进 Cocos Creator 3.8.x 工程。本地预览默认访问 `http://127.0.0.1:8000/api/v1`；微信构建必须注入真实 HTTPS `apiBaseUrl`。

## 上线前必须完成

- 配置微信小游戏 AppID、服务端 `WECHAT_APP_ID/WECHAT_APP_SECRET`；
- 将 HTTPS API 域名加入微信公众平台“服务器域名/request 合法域名”；
- 使用生产随机 `APP_SECRET` 和独立 MySQL 账号，关闭密码登录与 demo seed；
- 在网关配置 TLS、限流、访问日志与告警；
- 执行迁移、备份和灰度/回滚演练；
- 用微信开发者工具测试 2G/高延迟/断网/切后台/重复点击。

完整清单见 [docs/WECHAT_RELEASE.md](docs/WECHAT_RELEASE.md)。
