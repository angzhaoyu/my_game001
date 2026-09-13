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
| 分工、新增功能流程、提交与检查 | [开发协作指南](docs/CONTRIBUTING.md) |
| 分层、幂等、同步、离线结算 | [架构与数据流](docs/ARCHITECTURE.md) |
| 请求、响应、命令、错误码 | [API 契约](docs/API.md) |
| 农场节点与土地预制体 | [farm 场景契约](frontend/scenes/farm.scene.md) |
| 登录节点与当前实现限制 | [login 场景契约](frontend/scenes/login.scene.md) |
| 图片路径与命名 | [资源清单](frontend/resources/images.md) |
| 生产配置、弱网验收与回滚 | [微信上线清单](docs/WECHAT_RELEASE.md) |
| 数值实现偏差与迁移注意事项 | [数值落地记录](docs/VALUE_SYSTEM_NOTES.md) |

## 设计依据

- [数值系统 v1.10](farm_game_value_system_final_v1.10.md)：保留正式设计；实现与设计的差异统一记录在数值落地记录中。
- [原始交互需求](我想实现的.md)：保留需求来源；实际节点与接入方法以场景契约为准，不作为功能已全部完成的声明。
- [CSV 配置表](frontend/resources/datas/README.md)：`frontend/resources/datas` 是唯一配置表来源，后端读取并通过 bootstrap 下发；旧 N/P/K 参考 CSV 已移除。
