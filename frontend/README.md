# Cocos / 微信小游戏前端接入

当前仓库保留 TypeScript 源码、场景节点契约和资源清单，不包含完整 Cocos 自动生成工程。建议在 Cocos Creator 3.8.x 工程的 `assets/` 下按以下方式接入：

```text
assets/
├── scripts/       <- 本目录 scripts/
├── resources/     <- 实际图片和 datas/ CSV；图片路径见下方资源约定
└── scenes/        <- 按 scenes/*.scene.md 创建/维护真实场景
```

## 场景入口

- `login` 场景 Canvas 挂 `LoginMain`；微信环境会自动调用 `wx.login`。
- `farm` 场景 Canvas 挂 `GameRoot`；完整节点层级、土地预制体与各面板见 `scenes/farm.scene.md`。
- 农场 UI 的编辑器搭建原则、可调参数与土地贴图约定统一见 [farm 场景契约](scenes/farm.scene.md)。登录 UI 当前仍由代码创建，见下方登录场景。

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

土地挂载与新节点迁移以 [farm 场景契约](scenes/farm.scene.md#2-landplot-土地预制体) 为准：只有 Canvas 挂 GameRoot，lands 和土地预制体不挂土地脚本。CSV 编辑与后端部署路径见 [配置表说明](resources/datas/README.md)。

## 登录场景

```text
Canvas  [挂载 LoginMain.ts]
└─ Camera
```

当前登录 UI 由 `LoginMain` 在运行时创建：

- 微信小游戏环境：启动后调用 `wx.login`，把一次性 code 发送到 `/api/v1/auth/wechat`；
- Cocos/Web 本地预览：显示账号/密码/大区，用于后端联调；生产后端关闭密码接口；
- 成功后只保存短期 access token 与非敏感用户摘要，切换到 `farm` 场景；
- 微信 AppSecret 不得存在该场景、脚本、ext 配置或小游戏包中。

若后续由 UI 同学改成编辑器场景/Prefab，请保持 `LoginMain` 只调用 `core/auth/AuthApi`，不要在 UI 组件中直接使用 `wx.request`。

## 图片与动画资源

资源需要在真实 Cocos 工程准备；仓库不包含图片。路径区分大小写，代码默认使用小写 `farm`、`textures`。

### 土壤图（不要漏掉 1..6）

每种状态都需要 6 张位置图，共 24 张，由地块所在列选择：

```text
assets/resources/farm/
├─ lands_a1/locked_1a.png … locked_6a.png   正常
├─ lands_b1/locked_1b.png … locked_6b.png   未解锁
├─ lands_c1/locked_1c.png … locked_6c.png   缺肥
└─ lands_d1/locked_1d.png … locked_6d.png   缺水
```

若旧资源是 `Farm/Lands_a1`，统一重命名或在 Canvas 的 `GameRoot.soilPathPattern` 修改模板，不能只依赖 Windows 忽略大小写。

### 作物与物品

| 资源 | 路径 / 配置来源 |
|---|---|
| 作物三阶段图 | `farm/crop/<cropId>-01.png / -02.png / -03.png`；具体名称由 [crops.csv](resources/datas/crops.csv) 的 `stage_icons` 指定 |
| 种子/果实图 | `textures/items/seed_<cropId>.png / fruit_<cropId>.png`；可在表中配置 `seed_icon/fruit_icon` |
| 肥料图 | `textures/items/<item_id>.png`，来自 [fertilizers.csv](resources/datas/fertilizers.csv)，默认 `fert_<id>` |
| 药品图 | `textures/items/<item_id>.png`，来自 [medicines.csv](resources/datas/medicines.csv)，默认 `med_<id>` |

24 种作物名与图片名以表格为准，不再维护另一份可能过时的逐项列表。单个 `stage` Sprite 根据阶段切图，不需要 3 个 Sprite 节点。

### 工具与动画

- 工具图直接在 LeftBar 的 Water/Fertilizer/Harvest/Shovel 挂 Sprite。
- 预置 `ToolCursorLayer/ToolCursor`：Sprite、UITransform、UIOpacity（约 180）。代码复制工具图并改变位置/显隐，不创建缺失节点。
- `ToolEffect/fx_watering`、`fx_shovel`、`fx_fertilize`、`fx_harvest` 的动画在各自子 `Sprite` 中制作；病虫害与成熟动画同理。
- 已删除缺水/缺肥动画以及全局 ToolEffectLayer 模板，土壤贴图承担缺水/缺肥提示。
- 每次激活重播、常驻循环、默认隐藏方式以 [farm 场景契约](scenes/farm.scene.md#2-landplot-土地预制体) 为准。
- 面板、按钮、背景和 HUD 图片在编辑器中直接绑定；不再保留不存在的模板说明或旧作物资源清单。
