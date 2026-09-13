# 开发协作指南

## 责任边界

| 角色 | 主目录 | 合作点 |
|---|---|---|
| 后端 | `backend/app/api,services,repositories` | API 契约、事务、监控 |
| 游戏逻辑/策划 | `frontend/resources/datas`、`backend/app/domain/game.py` | 数值版本、规则测试 |
| 客户端 | `frontend/scripts/core,farm` | 同步状态机、Cocos 表现 |
| UI/美术 | `frontend/scenes,resources` + 真实 Cocos assets | 节点/资源契约 |
| DBA/运维 | `backend/migrations,Dockerfile,compose` | 迁移、备份、部署 |
| 测试 | `backend/tests`、微信弱网用例 | 幂等、并发、真机 |

仓库有 CODEOWNERS 模板；组建团队后把占位团队名替换为真实 GitHub team。

## 改动规则

1. **接口先行**：先更新 `docs/API.md` 和 TypeScript contract，再分别实现服务端/客户端。
2. **配置有版本**：改 `frontend/resources/datas/*.csv` 后配置版本由内容哈希自动更新，需重启服务端、补领域测试并说明经济影响。
3. **迁移只追加**：创建新的 `NNN_description.sql`；已在线执行的迁移禁止修改。
4. **不跨层**：UI 不直接调用 `wx.request`；route 不写 SQL；repository 不决定价格；客户端不生成测试资产。
5. **幂等优先**：新增有副作用 API 前先设计幂等键、事务边界、重试语义。
6. **安全默认**：不提交 `.env`、密码、AppSecret、token、openid 数据集或生产日志。
7. **兼容发布**：schema/API 先扩展、双读写/兼容、再清理，不在一次发布里直接破坏旧客户端。

## PR 最小要求

- 使用 PR 模板说明影响、迁移和回滚；
- 后端规则至少包含成功、非法输入、重放/冲突测试；
- 核心 TypeScript 类型检查通过；
- UI 改动提供 Cocos 预览/真机截图或录屏；
- 网络改动覆盖超时、重试、断网恢复；
- 一次 PR 聚焦一个功能，纯重构与数值修改尽量分开。

## 新增功能流程

### 玩家操作

普通农场操作复用 `POST /api/v1/game/commands`，不另建路由：

1. 在 [API 契约](API.md) 约定命令、payload、成功结果与错误码。
2. 更新 `frontend/scripts/core/network/Contracts.ts` 的命令类型及必要的快照类型。
3. UI 通过 `GameAction` / `onAction` 发送命令，不直接修改金币或背包。
4. 在 `backend/app/domain/game.py` 实现 `_handle_<命令名>`，补规则测试；幂等、重试、事务复用现有基础层。

已有铲除命令为 `shovel`，不要另建重复的 `remove_crop`。新增有配置依赖的操作时，同步维护服务端目录和前端配置镜像。

### 持久化字段

按顺序更新 `domain/models.py` → 追加 `migrations/NNN_*.sql` → `repositories/mysql.py` 读写 → `domain/serialization.py` 快照 → 前端 contract/投影，并补迁移与兼容测试。

迁移执行器按 `;` 切分语句，SQL 字符串中不要包含分号。只有需永久保存的数据才增加数据库字段，纯 UI 动画不落库。

### 独立系统

好友、排行榜、邮件等独立系统才新增 API/Service，并在 `backend/app/__init__.py` 注册 Blueprint。先约定接口，再由前后端并行实现，最后联调和弱网验收。

分层和公共基础设施职责见 [架构与数据流](ARCHITECTURE.md)；普通玩法开发无需重复实现鉴权、HTTP、同步队列或数据库事务。

## 本地检查

以下命令从仓库根目录执行，使用已准备好的 Python 环境；若系统提示 externally-managed-environment，请先创建并激活虚拟环境（`python -m venv .venv`，POSIX 下执行 `source .venv/bin/activate`）：

```bash
python -m pip install -r backend/requirements-dev.txt
PYTHONPATH=backend python -m unittest discover -s backend/tests -v
python -m ruff check backend
python -m compileall -q backend/app backend/server.py backend/tests
(cd frontend && npm ci && npm run typecheck && npm test)
```

`PYTHONPATH=backend` 是 POSIX shell 写法；Windows 可先进入 `backend`，执行 `python -m unittest discover -s tests -v`。依赖安装只需首次或依赖更新时执行，Windows 一键启动脚本不会自动安装。

类型检查覆盖 core + farm（含最小 `cc` 声明），但不替代真实 Creator 编译和真机测试。接入与声明排除方式见 [前端说明](../frontend/README.md#检查)。

[CI 模板](ci.workflow.yml.example) 提供自动检查；维护者具备 `workflows` 权限时可复制到 `.github/workflows/ci.yml` 启用。

## 节点与资源契约

改 Cocos 节点名/资源路径时，同一个 PR 更新：

- 真实 `.scene/.prefab/.meta`（在实际 Cocos 工程中）；
- `frontend/scenes/*.scene.md`；
- `frontend/README.md` 的图片与动画资源约定；
- 查找该名称/路径的 TypeScript。

推荐逐步将 `GameRoot` 的名字查找替换为编辑器 `@property` 显式引用；过渡期保留兼容查找。
