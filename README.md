# 随心农场 · 微信小游戏工程骨架

Cocos Creator 3.8.x + Flask + MySQL 农场项目，采用服务端权威命令模型：客户端展示快照，服务端负责规则、资产、幂等写入与状态版本。

仓库包含前后端源码、数据库迁移、测试和场景/资源契约，**不包含完整 Cocos 工程与实际美术资源**。

## 快速开始

1. **后端**：Windows 本地开发双击 `backend/启动游戏服务器.bat`。首次运行前的解释器、依赖、MySQL 要求及测试账号见 [后端说明](backend/README.md)。Docker/生产启动也在该文档。
2. **前端**：按 [前端接入说明](frontend/README.md) 将脚本和资源接入真实 Cocos 工程，并配置 API 地址。
3. **检查**：按 [本地检查](docs/CONTRIBUTING.md#本地检查) 运行后端测试和完整 TypeScript 类型检查。

## 文档导航

| 内容 | 唯一维护入口 |
|---|---|
| 玩法、数值摘要、待确认事项、存档迁移影响 | [玩法说明](docs/GAME_RULES.md) |
| 配置表字段、编辑与部署 | [CSV 配置说明](frontend/resources/datas/README.md) |
| 农场节点、土地预制体、工具交互与旧场景迁移 | [farm 场景契约](frontend/scenes/farm.scene.md) |
| 登录场景、图片路径、前端接入 | [前端说明](frontend/README.md) |
| 分工、新增功能、提交与检查 | [开发协作指南](docs/CONTRIBUTING.md) |
| 分层、同步、离线结算、事务 | [架构说明](docs/ARCHITECTURE.md) |
| 请求、响应、命令、错误码 | [API 契约](docs/API.md) |
| 生产配置、弱网验收、发布与回滚 | [微信上线清单](docs/WECHAT_RELEASE.md) |

数值只在 CSV 中维护，节点只在场景契约中维护；玩法说明不再复制整套表格或节点树。旧需求与旧数值文档已合并，其历史版本保留在 Git 中。
