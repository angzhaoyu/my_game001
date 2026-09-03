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
- `farm` 场景 Canvas 挂 `GameRoot`；节点命名见 `scenes/farm.scene.md`。
- 浇水、施肥、采摘、铲子的跟随图标与动画模板见 `scenes/tool-effects.setup.md`。
- 请在 Cocos 编辑器用 `@property` 显式拖拽关键节点。代码中的按名查找只为兼容已有场景，不应成为新场景的主要绑定方式。

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

## 弱网行为

- GET 和带 `commandId` 的 POST 最多重试 2 次，指数退避并带随机抖动；
- 写命令先持久化，再串行发送；响应丢失时重发相同 `commandId`；待确认命令最多保留 6 天（短于服务端默认 7 天幂等记录）；
- 后端 `stateVersion` 冲突时自动 bootstrap 后重试；
- 断网缓存只读，不允许客户端金币/背包覆盖服务端；
- 小游戏回前台会重新 bootstrap 并恢复未确认命令；
- UI 在单地块/单物品命令等待期间防重复点击。

注意：当出现“操作已保留”提示时，操作是否成功要以后端确认快照为准。不要在 UI 层自行加金币或扣背包。

## 配置与测试数据

- `/game/bootstrap` 下发物品、商店、作物、土地和天气配置；
- `farm/config/*` 是运行时镜像与展示算法，不再生成初始背包；
- 客户端已移除初始背包生成函数；
- 测试账号/初始物品运行 `backend` 的 `seed-demo` 创建。

## 检查

不依赖 Cocos `cc` 的核心层可以独立类型检查：

```bash
npm ci
npm run typecheck:core
```

Cocos UI 脚本应在真实 Creator 工程中编译并做真机测试。弱网至少覆盖：高延迟、请求超时、响应丢失、断网恢复、切后台、多设备同时操作、快速连点。
