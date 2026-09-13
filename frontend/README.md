# Cocos / 微信小游戏前端接入

当前仓库保留 TypeScript 源码、场景节点契约和资源清单，不包含完整 Cocos 自动生成工程。建议在 Cocos Creator 3.8.x 工程的 `assets/` 下按以下方式接入：

```text
assets/
├── scripts/       <- 本目录 scripts/
├── resources/     <- 实际图片；路径见 resources/images.md
└── scenes/        <- 按 scenes/*.scene.md 创建/维护真实场景
```

## 场景入口

- `login` 场景 Canvas 挂 `LoginMain`；微信环境会自动调用 `wx.login`。
- `farm` 场景 Canvas 挂 `GameRoot`；完整节点层级、土地预制体与各面板见 `scenes/farm.scene.md`。
- 农场 UI 的编辑器搭建原则、可调参数与土地贴图约定统一见 [farm 场景契约](scenes/farm.scene.md)。登录 UI 当前仍由代码创建，见 [login 场景契约](scenes/login.scene.md)。

## API 地址

`core/config/RuntimeConfig.ts` 按顺序读取：

1. `wx.getExtConfigSync()`；
2. `globalThis.__GAME_CONFIG__`；
3. Cocos Creator `PreviewInEditor`、Electron 和普通 Web 本地预览默认 `http://127.0.0.1:8000/api/v1`；
4. 微信环境未配置时使用占位地址，并拒绝进入正式微信登录。

微信开发者工具可使用扩展配置（具体文件由真实 Cocos 构建流程生成/复制）：

```json
{
  "extEnable": true,
  "ext": {
    "apiBaseUrl": "https://api.your-domain.example/api/v1",
    "requestTimeoutMs": 8000,
    "maxRetries": 2
  }
}
```

不同 Cocos/微信工具版本的 `ext.json` 格式可能不同；发布前用 `wx.getExtConfigSync()` 打印非敏感配置确认。API 域名必须为 HTTPS 并加入微信公众平台 request 合法域名。

## 同步与配置

同步队列、重试、版本冲突和只读缓存见 [架构说明](../docs/ARCHITECTURE.md#3-网络延迟与响应丢失)。出现“操作已保留”时，以后端确认快照为准，UI 不自行加金币或扣背包。

`/game/bootstrap` 下发权威目录与世界状态，`farm/config/*` 仅为运行时镜像与展示算法；测试资产由后端 `seed-demo` 创建，见 [后端说明](../backend/README.md)。

## 检查

统一执行命令见 [本地检查](../docs/CONTRIBUTING.md#本地检查)。`npm run typecheck` 包含：

- `typecheck:core`：不依赖 Cocos 的核心层；
- `typecheck:farm`：包含 `scripts/farm/**` 的 UI 脚本，用仓库自带的最小 `cc` 类型声明
  （`typings/cc.d.ts`，**仅供类型检查，构建时请排除 `typings/` 目录**）。

`npm test` 使用最小引擎替身验证目录刷新、节点查找和图片加载回退，不替代引擎运行测试。

Cocos UI 脚本仍应在真实 Creator 工程中编译并做真机测试。弱网至少覆盖：高延迟、请求超时、响应丢失、断网恢复、切后台、多设备同时操作、快速连点。

本次源码整理将 `FertilizerConfig.ts`、`MedicineConfig.ts` 合并至 `ItemConfig.ts`，`Assets.ts` 合并至 `Ui.ts`；同步到已有 Cocos 工程时移除这三个旧脚本及对应 `.meta`，并同步引用它们的脚本。组件类名及场景挂载不变；自定义扩展如使用旧导入路径，也需同步更新。
