# 团队协作约定

## 责任边界

| 角色 | 主目录 | 合作点 |
|---|---|---|
| 后端 | `backend/app/api,services,repositories` | API 契约、事务、监控 |
| 游戏逻辑/策划 | `backend/app/domain/catalog.py,game.py` | 数值版本、规则测试 |
| 客户端 | `frontend/scripts/core,farm` | 同步状态机、Cocos 表现 |
| UI/美术 | `frontend/scenes,resources` + 真实 Cocos assets | 节点/资源契约 |
| DBA/运维 | `backend/migrations,Dockerfile,compose` | 迁移、备份、部署 |
| 测试 | `backend/tests`、微信弱网用例 | 幂等、并发、真机 |

仓库有 CODEOWNERS 模板；组建团队后把占位团队名替换为真实 GitHub team。

## 改动规则

1. **接口先行**：先更新 `docs/API.md` 和 TypeScript contract，再分别实现服务端/客户端。
2. **配置有版本**：改商店/作物规则必须提升 `CATALOG_VERSION`，补领域测试，说明经济影响。
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

## 本地检查

```bash
PYTHONPATH=backend python -m unittest discover -s backend/tests -v
python -m compileall -q backend/app backend/tests
cd frontend
npm ci
npm run typecheck:core
```

完整 Cocos 脚本还需由真实 Creator 工程编译，因为本仓库没有提交引擎 `cc` 类型与生成资产。

`docs/ci.workflow.yml.example` 提供相同检查的 GitHub Actions 模板。仓库维护者可在具备 `workflows` 权限时将它复制到 `.github/workflows/ci.yml` 以启用自动检查。

## 节点与资源契约

改 Cocos 节点名/资源路径时，同一个 PR 更新：

- 真实 `.scene/.prefab/.meta`（在实际 Cocos 工程中）；
- `frontend/scenes/*.scene.md`；
- `frontend/resources/images.md`；
- 查找该名称/路径的 TypeScript。

推荐逐步将 `GameRoot` 的名字查找替换为编辑器 `@property` 显式引用；过渡期保留兼容查找。
