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
- 土地用**预制体**（建议 `assets/resources/farm/prefabs/LandPlot.prefab`）：**预制体不挂脚本**，
  同一列 6 张土块图（`locked_1a`…`locked_6a`）由 `lands` 上的 `LandView` 按列号换图；
  缺水 / 缺肥也靠换图表达，不再有 `fx_dry` / `fx_lowfert` 动画节点。
- 所有节点、动画、进度条、面板都在 Cocos 里搭好，代码只负责切 `active` / 换图 / 填字 / 播 `Animation`。
- 可微调的参数（换图阈值、土块贴图路径模板、作物图路径、浇水次数上限等）都在 `LandView` /
  `SoilInfoPanel` 组件属性上，属性检查器里直接改即可；静态数值表在 `resources/datas/*.csv`，
  见 `resources/datas/README.md`。

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

- `resources/datas/*.csv` 是客户端的静态配置表（作物 / 肥料 / 药品 / 土地 / 全局数值 / 土块状态 /
  品质 / 季节 / 天气）。启动时 `loadResourceTables()` 读一次，之后 UI 只引用表格；
- `/game/bootstrap` 下发物品、商店、作物、肥料、药品、土地、数值、季节与天气配置，
  到达后**覆盖同名表**（服务端始终权威，表里数值过期也不会算错钱）；
- 季节 / 天气 / 温度由服务端随快照的 `world` 字段下发，客户端只显示（WeatherHud 三个 Label，不做动画）；
- `farm/config/*` 是表格读取器与展示算法（数值都在 `resources/datas/*.csv`），不再生成初始背包；
- 客户端已移除初始背包生成函数；
- 测试账号/初始物品运行 `backend` 的 `seed-demo` 创建。

## 检查

```bash
npm ci
npm run typecheck        # = typecheck:core + typecheck:farm
```

- `typecheck:core`：不依赖 Cocos 的核心层；
- `typecheck:farm`：包含 `scripts/farm/**` 的 UI 脚本，用仓库自带的最小 `cc` 类型声明
  （`typings/cc.d.ts`，**仅供类型检查，构建时请排除 `typings/` 目录**）。

Cocos UI 脚本仍应在真实 Creator 工程中编译并做真机测试。弱网至少覆盖：高延迟、请求超时、响应丢失、断网恢复、切后台、多设备同时操作、快速连点。
