# 项目结构说明

本项目由 **Cocos Creator 3.8.x 微信小游戏前端**和 **Flask + MySQL 后端**组成。当前结构按“领域、应用、基础设施、表现”拆分，目的是让客户端、后端、策划、UI/美术和运维可以并行工作。

> `frontend/scenes/*.scene.md` 与 `frontend/resources/images.md` 是场景/资源契约说明，不是 Cocos 自动生成的 `.scene`、`.meta` 或图片文件。把代码合入真实 Cocos 工程时，应按这些契约挂载组件和资源。

## 顶层结构

```text
my_game/
├── backend/                       # 服务端（权威数据与规则）
│   ├── app/
│   │   ├── api/                   # HTTP 适配层：鉴权、参数接收、统一响应
│   │   ├── domain/                # 纯领域：农场规则、目录、模型、错误
│   │   ├── services/              # 用例：登录、bootstrap、幂等命令
│   │   ├── repositories/          # MySQL 适配器与事务
│   │   ├── __init__.py            # 唯一 Flask 应用工厂
│   │   ├── manage.py              # migrate / seed-demo
│   │   └── settings.py            # 环境配置
│   ├── migrations/                # 可审查、可追踪的 SQL 迁移
│   ├── tests/                     # 不依赖 MySQL 的自动测试
│   ├── 启动游戏服务器.bat          # Windows 一键启动（普通开发只用它）
│   ├── server.py                  # 唯一本地入口：自动建库/迁移并启动
│   ├── compose.yaml               # Docker 部署方式
│   └── Dockerfile
├── frontend/
│   ├── scripts/
│   │   ├── core/                  # 与 Cocos 解耦的客户端基础设施
│   │   │   ├── auth/              # 微信登录、短期会话
│   │   │   ├── config/            # API 地址/超时等环境配置
│   │   │   ├── game/              # 游戏 API 与远端配置装载
│   │   │   ├── network/           # wx.request/XHR、超时、退避重试
│   │   │   ├── storage/           # wx/localStorage 统一适配
│   │   │   └── sync/              # 幂等命令队列、版本冲突恢复
│   │   ├── login/                 # 登录场景表现层
│   │   └── farm/
│   │       ├── config/            # 服务端配置的运行时镜像（只用于显示）
│   │       ├── data/              # 客户端展示模型
│   │       ├── ui/                # Cocos 组件
│   │       ├── GameAction.ts      # UI 到应用层的命令接口
│   │       └── GameRoot.ts        # 场景装配与快照投影
│   ├── scenes/                    # 场景节点契约文档
│   ├── resources/                 # 资源契约文档
│   ├── package.json
│   └── tsconfig.core.json         # 不依赖 cc 的核心模块类型检查
├── docs/                           # 架构、API、上线、协作说明
├── .github/                        # CODEOWNERS、PR 模板
└── docs/ci.workflow.yml.example   # GitHub Actions 模板（需维护者启用）
```

## 日常开发怎么分工

文件多不代表每个人都要理解全部文件。日常开发按下面四个区域认领即可：

| 负责人 | 主要目录 | 不需要关心 |
|---|---|---|
| UI/交互 | `frontend/scripts/farm/ui/`、场景、资源 | HTTP、MySQL、令牌 |
| 前端逻辑 | `frontend/scripts/farm/GameRoot.ts`、`frontend/scripts/core/network/Contracts.ts` | SQL、Flask 路由细节 |
| 后端玩法 | `backend/app/domain/game.py`、`catalog.py`、`backend/tests/` | Cocos 节点和动画 |
| 后端数据 | `backend/app/domain/models.py`、`repositories/mysql.py`、`migrations/` | Cocos UI |

`frontend/scripts/core/network/HttpClient.ts`、`sync/GameSyncService.ts` 以及后端鉴权、事务基础设施已经封装好。开发普通玩法时不要重复修改这些基础文件。

## 前端新增功能，对应后端怎么增加

### 情况一：普通玩家操作

例如新增“铲除作物”，**不需要新增 API 文件，也不需要新增路由**。所有玩家操作统一走 `/api/v1/game/commands`。

只做四步：

1. 前后端先约定命令：`remove_crop`，参数 `{ plotId: number }`；
2. 前端在 `frontend/scripts/core/network/Contracts.ts` 的 `GameCommandType` 增加 `'remove_crop'`；
3. UI 调用已有入口：`this.onAction('remove_crop', { plotId })`；
4. 后端只在 `backend/app/domain/game.py` 增加 `_handle_remove_crop(...)`，并在 `backend/tests/` 增加测试。

后端方法示意：

```python
def _handle_remove_crop(self, state, payload, now_ms):
    plot = self._plot(state, payload)
    if not plot.crop_id:
        raise AppError("NO_CROP", "地块上没有作物")
    plot.crop_id = None
    plot.progress = 0
    plot.harvestable = False
    return ActionResult("作物已铲除")
```

网络超时、重试、幂等、版本冲突、保存 MySQL 都由现有基础层处理，功能开发者不需要再写一遍。

### 情况二：新增数据字段

例如任务系统需要 `daily_task_count`：

1. 后端数据负责人修改 `domain/models.py`；
2. 新增一个 `migrations/002_*.sql`；
3. 在 `repositories/mysql.py` 增加读取和保存；
4. 玩法负责人在 `domain/game.py` 使用该字段；
5. 前端只接收后端快照，不自己伪造字段。

只有需要永久保存的新数据才走这一步。不要为纯 UI 动画增加数据库字段。

### 情况三：独立系统

好友、排行榜、邮件这类不属于单个玩家农场命令的系统，才新增独立 API/Service，例如：

```text
backend/app/api/friends.py
backend/app/services/friend_service.py
frontend/scripts/friends/
```

这类功能应先在 `docs/API.md` 写清请求、响应和错误码，再让前后端并行开发；后端负责人最后在 `app/__init__.py` 注册一次新的 Blueprint。

### 一个功能的协作顺序

```text
产品/负责人确定命令和参数
        ↓
后端实现规则 + 单元测试       前端实现 UI + 调用 onAction
        ↓                         ↓
           使用同一命令名联调
                    ↓
              弱网/重复点击验收
```

提交新功能时至少写清：命令名、payload、成功结果、错误码、是否新增数据库字段。这样接手的人只看对应功能文件，不需要从整个项目里寻找调用链。

## 关键边界

1. **后端权威**：价格、初始背包、金币、经验、成长、收获和土地状态都由后端创建与校验；前端不能上传整包数据覆盖数据库。
2. **前端快照**：前端模型只是最近一次服务端快照的投影。离线缓存仅用于只读首屏，不作为服务端恢复来源。
3. **弱网命令**：每个写操作都有持久化 `commandId`，服务端幂等；客户端串行发送、超时重试，并用 `stateVersion` 处理多设备冲突。
4. **配置下发**：物品、商店、作物、土地、天气配置由 `/api/v1/game/bootstrap` 下发；客户端配置文件只保留启动默认形状和显示算法。
5. **微信鉴权**：小游戏调用 `wx.login`，后端调用微信 `jscode2session`。`WECHAT_APP_SECRET` 永远只存在服务端。

进一步阅读：

- [架构与数据流](docs/ARCHITECTURE.md)
- [接口契约](docs/API.md)
- [微信小游戏上线清单](docs/WECHAT_RELEASE.md)
- [协作约定](docs/CONTRIBUTING.md)
- [后端运行说明](backend/README.md)
- [前端接入说明](frontend/README.md)
