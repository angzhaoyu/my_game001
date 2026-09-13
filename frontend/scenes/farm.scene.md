# Farm 场景节点契约（数值系统 v1.10）

> 总原则：**先在 Cocos Creator 里把节点、动画、进度条、面板全部搭好，土地代码只负责「唤醒 / 切图 / 填字」，动画由预制体负责。**
> 代码不再在运行时创建 UI 节点；列表类单元格用编辑器预置的节点（不够时克隆第一个作为模板）。
>
> 需要调的参数（阈值、路径模板、次数上限等）都做成了组件上的 `@property`，可以在属性检查器里直接改。

---

## 0. 全局约定

| 约定 | 说明 |
|---|---|
| 命名 | 节点名与下表完全一致；代码按名字查找，找不到时会 `console.warn` 并跳过（不会报错崩溃） |
| 动画 | 土块 `fx_*` 根节点只切 `active`，动画放子 `Sprite`；详见土地预制体约定 |
| 进度条 | `bg` + `fill`（Sprite）。`fill.fillRange` 为 0~1；如果组件上填了 `growthFillMaxWidth`，则改为按 width 缩放 |
| 点击外部关闭 | 面板根节点铺满全屏，根节点自身接收 `TOUCH_END`（`event.target === 根节点`）时关闭 |
| 土地图片 | 同一列有 6 张图：`farm/lands_{state}1/locked_{col}{state}`（`state` 取 a/b/c/d，`col` 取 1..6），**不要遗漏任何一列** |

土块状态与图片后缀：

| 状态 | 后缀 | 判定（代码） |
|---|---|---|
| 正常 | `a` | 默认 |
| 未解锁 | `b` | `plot.unlocked === false` |
| 缺肥 | `c` | `fertility < 目标肥力 - fertilityAlertGap`（默认 10，可在预制体上改） |
| 缺水 | `d` | `moisture < 作物 Hmin - moistureAlertGap`（默认 10） |

---

## 1. 场景层级

```
Canvas（挂载 GameRoot.ts）
│
├─ bg_ground                              Sprite        背景
├─ Camera                                 Camera        相机
│
├─ lands                                  Node          土地根节点（不挂脚本）
│  ├─ lands_1                             Node          第 1 行
│  │  ├─ 1 … 6                            Prefab        土地预制体实例（不挂脚本）
│  ├─ lands_2                             Node          第 2 行（结构相同）
│  ├─ lands_3                             Node
│  └─ lands_4                             Node
│     └─ 每行都用 "1".."6"；兼容旧名 land_1..land_6
│
├─ WeatherHud                             Node          天气栏（挂载 WeatherHud.ts，只有 Label，不做动画）
│  ├─ lb_season                           Label         「季节：夏」
│  ├─ lb_weather                          Label         「天气：晴」
│  ├─ lb_temp                             Label         「温度：28.4℃」
│  └─ lb_day                              Label         「第 19675 天」
│
├─ ToolCursorLayer                        Node          工具光标层
│  └─ ToolCursor                          Node          Sprite + UIOpacity(≈180)，代码只改位置/贴图/显隐
│
├─ TopBar                                 Node          玩家信息栏（结构不变）
│  └─ PlayerInfoSection
│     ├─ ExpBar/Bar                       Sprite        经验条
│     ├─ LevelLabel                       Label         Lv.N
│     ├─ GoldHud/CoinsLabel               Label         金币
│     ├─ DiamondsSection/DiamondsLabel    Label
│     └─ Energy/EnergyLabel               Label
│
├─ LeftBar                                Node          左侧工具栏（结构不变，新增提示）
│  ├─ ShopBtn / BackpackBtn               Node
│  ├─ Water                               Node          浇水（点一下弹次数框，再点一下取消）
│  ├─ Shovel                              Node          铲子（无选择框）
│  ├─ Harvest                             Node          采摘（无选择框）
│  └─ Fertilizer                          Node          施肥（弹施肥选择框）
│
├─ RightBar                               Node          右侧栏（好友，未实现）
│
├─ Toast                                  Node          提示（挂载 Toast.ts）
│  └─ ToastLabel                          Label
│
├─ SoilInfoPanel                          Node          土壤信息框（挂 SoilInfoPanel.ts，全屏根节点）
│  └─ Panel                               Node          固定大小，可在下面添加 ScrollView/view/content
│     ├─ plotId                           Label         土地编号
│     ├─ season / weather / temp          Label         分别为季节 / 天气 / 温度
│     ├─ moisture / fertility / soilState Label         分别为湿度 / 肥力 / 土地状态
│     ├─ cropName / cropStage             Label         分别为作物名称 / 生长阶段
│     ├─ growth / growthSpeed             Label         分别为成长值 / 当前阶段成长速度
│     ├─ remainingTime / harvestCount     Label         分别为预计剩余时间 / 预计产量
│     ├─ fertilizerName                   Label         生效肥料列表（多行）
│     ├─ fertilizerType                   Label         对应每行无机 / 有机
│     ├─ fertilizerTime                   Label         对应每行剩余分钟
│     ├─ pest / disease                   Label         分别为害虫 / 病害
│     ├─ matureState / harvestYield       Label         分别为成熟状态 / 可收获数量
│     ├─ quality                          Label         品质等级 / 分数 / 倍率
│     ├─ lockPrice                        Label         解锁金币及等级要求
│     ├─ plantLimit                       Label         今日播种次数 / 上限
│     ├─ medicine                         Label         可选：生效药品及时间，保留用药信息
│     ├─ btn_medicine                     Button        可选：处理病虫害（保留药品入口）
│     └─ btn_close                        Button        可选：关闭；点击根节点空白也关闭
│
├─ WaterPrompt                            Node          浇水次数框（挂载 WaterPrompt.ts，全屏根节点）
│  └─ Panel
│     ├─ lb_title                         Label         「浇水」
│     ├─ times                            Node          次数按钮容器
│     │  ├─ btn_1 … btn_5                 Button        名称里带数字，代码读取数字作为次数
│     ├─ lb_hint                          Label         每次 +5 湿度，共 +N
│     ├─ btn_confirm                      Button
│     └─ btn_close                        Button
│
├─ FertilizePanel                         Node          施肥框（挂载 FertilizePanel.ts，全屏根节点）
│  └─ Panel
│     ├─ header/Title                     Label         「给第 3 块土地施肥」
│     ├─ header/CloseBth                  Button
│     ├─ top/ScrollView/view/content      Node          已选肥料（Cell 预制体实例）
│     ├─ bottom/ScrollView/view/content   Node          背包已有的肥料（Cell 预制体实例）
│     ├─ toggle_append                    Node          追加时间（子节点 checkmark 表示勾选）
│     ├─ lb_hint                          Label         已选提示
│     ├─ btn_shop                         Button        跳转商店（关闭商店后自动回到本框）
│     └─ btn_confirm                      Button
│
├─ SeedPanel                              Node          种子选择（挂载 ItemPickerPanel.ts，全屏根节点）
│  └─ Panel
│     ├─ lb_title / lb_hint               Label
│     ├─ ScrollView/view/content          Node          Cell 预制体实例
│     └─ btn_close                        Button
│
├─ MedicinePanel                          Node          药品选择（挂载 ItemPickerPanel.ts，结构同 SeedPanel）
│
├─ BackpackPanel                          Node          背包（挂载 BackpackPanel.ts）
│  └─ Panel
│     ├─ header / toolbar                               分类 tab：tab / tab-001 / tab-002 / tab-003 / tab-004
│     │                                                 = 全部 / 种子 / 果实 / 化肥 / 药品
│     ├─ ScrollView/view/content          Node          CellItem 预制体实例
│     └─ footer
│
└─ ShopPanel                              Node          商店（挂载 ShopPanel.ts）
   └─ Panel
      ├─ header
      ├─ toolbar                                        分类 tab：tab / tab-001 / tab-002
      │                                                 = 种子 / 化肥 / 药品
      ├─ ScrollView/view/content          Node          ShopItem 预制体实例
      └─ footer
```

---

## 2. LandPlot 土地预制体

路径建议：`assets/resources/farm/prefabs/LandPlot.prefab`。**预制体不挂脚本，`lands` 也不挂脚本**。
`LandView.ts` 已合并原 `LandPlot.ts` 的显示功能，是普通 TypeScript 控制器，不是 Cocos 组件。
Canvas 上的 `GameRoot` 创建它，并在 `update/onDestroy` 调用刷新与释放。

```text
LandPlot                             Node（本行是预制体名，实例名为 1..6）
├─ soil                              Sprite（始终显示，每种状态 6 张位置图按列 1..6 选择）
├─ crop                              Node（有作物且未成熟时显示）
│  ├─ stage                          Sprite（只有一个，切换作物三阶段图片）
│  └─ growth                         Node（成长值 0..100，成熟后隐藏）
│     ├─ bg                          Sprite
│     ├─ fill                        Sprite（Filled 模式或宽度缩放）
│     └─ lb_growth                   Label（成长值 / 可采摘）
├─ ToolEffect                        Node（父节点保持 active）
│  ├─ fx_watering                    Node（默认隐藏）
│  │  └─ Sprite                      Sprite + 自制动画
│  ├─ fx_shovel                      Node（同上，子 Sprite 放动画）
│  ├─ fx_fertilize                   Node（同上）
│  ├─ fx_harvest                     Node（同上）
│  └─ fx_unlock                      Node（可选：解锁成功动画，同上）
├─ pest                              Node（病虫害任一存在时显示）
│  ├─ fx_pest                        Node / Sprite 子节点（害虫常驻动画）
│  └─ fx_disease                     Node / Sprite 子节点（病害常驻动画）
├─ mature                            Node（成熟后常驻显示，动画放子 Sprite）
├─ lockPrice                         Label（可选：地块上显示解锁价格/等级）
└─ plantLimit                        Label（可选：地块上显示今日播种次数）
```

`soil` 也可以作为其余节点的父节点，查找会遍历地块子树。节点名在同一地块内应唯一。
所有图片路径大小写必须与真实资源一致，默认使用小写 `farm/lands_*`。

### 显示与动画约定

- 土壤优先级：未解锁 `b` → 缺水 `d` → 缺肥 `c` → 正常 `a`。
- **湿度 < 作物湿度下限 − 15** 时缺水；**肥力 < 作物目标肥力 − 15** 时缺肥。刚好相差 15 不切图，空地保持正常；同时缺水缺肥优先缺水。
- 删除旧 `fx_dry`、`fx_lowfert`，不再维护缺水/缺肥动画；正常情况下显示 `soil` 的正常图。
- `stage` 根据当前阶段取 `crops.csv` 的 `stage_icons`，默认 `<cropId>-01/-02/-03`。成熟隐藏整个 `crop`，改显示 `mature`；隐藏的 `lb_growth` 仍会写入“可采摘”。
- `fx_*` 的子 `Sprite` 负责动画，土地控制器不调用 `Animation.play()`，不克隆效果节点。操作成功后激活对应根节点，默认按子动画剪辑时长 + 0.05 秒关闭（无剪辑时约 1 秒）。
- **需在真实 Cocos 预制体中保证动画在每次激活时重播**，例如已有的激活播放组件/动画状态机；仅勾选 `Animation.playOnLoad` 不保证反复切换 active 会重播。病虫害与成熟表现由预制体配置为常驻/循环。这里不生成动画或激活播放脚本。
- `ToolEffect` 保持 active，单个 `fx_*` 默认 inactive。已移除全局 `ToolEffectLayer` 模板与动态创建光标的兜底；请预置 `ToolCursorLayer/ToolCursor`（Sprite、UITransform、UIOpacity）。

### GameRoot 属性（统一在 Canvas 调整）

| 属性 | 默认 | 说明 |
|---|---|---|
| `landsNode` | 按名查找 | 可直接拖入 lands |
| `soilPathPattern` | `farm/lands_{state}1/locked_{col}{state}/spriteFrame` | `{state}` 为 a/b/c/d，`{col}` 为 1..6 |
| `growthFillMaxWidth` | 0 | >0 按宽度缩放；0 使用 Sprite fillRange |
| `fertilityAlertGap` / `moistureAlertGap` | 0 | 0 使用 CSV 下发值（15），>0 覆盖显示阈值，不改变服务端规则 |

### 旧场景迁移

1. 从 `lands` 移除旧 `LandView` 组件，从所有土地预制体移除旧 `LandPlot` 组件，再删除旧 `LandPlot.ts/.meta`。
2. 将三个 `stage_1/2/3` 合为一个 `stage`；`states` 改为 `ToolEffect`，删除缺水/缺肥节点与全局效果模板。
3. 按上面的 Label 名称重建 SoilInfoPanel；旧进度条/区间属性不再使用。名称用 `/` 分隔的行表示多个独立 Label，不是一个带斜线的节点名。
4. 所有阈值/路径/宽度迁到 Canvas 的 GameRoot；刷新源码后检查 Missing Script 并做 Creator 预览。

---

## 3. 交互流程（代码只负责唤醒）

| 操作 | 流程 |
|---|---|
| **浇水** | 点 LeftBar/Water → 弹 `WaterPrompt` 选次数 → 确认后 `ToolCursor` 跟随鼠标 → 点土块 → 发 `water` 命令 → 光标消失 + 播 `fx_watering`。再点一次 Water 取消 |
| **铲子** | 点 Shovel → 光标跟随（**没有选择框**）→ 点土块 → 发 `shovel` 命令 → 播 `fx_shovel`（初始化土块） |
| **施肥** | 点 Fertilizer → 点土块 → 弹 `FertilizePanel` → 点下面的肥料加入上面（已选则数量 +1，点上面的格子 -1）→ 可选「追加时间」→ 确认发 `fertilize` 命令 → 播 `fx_fertilize` |
| **去商店** | 施肥框里点 `btn_shop` → 打开商店 → 关闭商店后**自动回到施肥框** |
| **采摘** | 点 Harvest → 光标跟随 → 点成熟土块 → 发 `harvest` 命令 → 播 `fx_harvest` |
| **播种** | 未选工具时点**空地** → 弹 `SeedPanel` → 选种子 → 发 `plant` 命令 |
| **看土壤** | 未选工具时点**有作物的地**，或**双击**任意土块 → 开 `SoilInfoPanel`；点框外关闭 |
| **解锁** | 未选工具时点**未解锁**的土块 → 金币+等级满足则发 `unlock_land`，否则 Toast 提示 |
| **除虫/治病** | `SoilInfoPanel` 里出现 `btn_medicine` → 打开 `MedicinePanel` → 选药品 → 发 `apply_medicine` |

信息框按同名 Label 自动绑定，可直接放面板下或 ScrollView/content 下；剩余时间按当前环境估算，并非固定倒计时承诺。预计产量与成熟后实际可收获数量分开显示。

---

## 4. 资源约定

图片路径和物品命名统一见 [前端资源说明](../README.md#图片与动画资源)，具体作物/肥料/药品 ID 以 [CSV 配置表](../resources/datas/README.md) 为准。

## 5. 与服务端的关系

- 客户端不做任何权威计算：成长、品质、产量、天气、病虫害全部来自 `/api/v1/game/bootstrap` 的 `plots` / `world`。
- 客户端每 15 秒用 `GET /game/bootstrap?catalog=0` 轮询刷新；进度条在两次快照之间按服务端给出的 `growthPerMinute` 做平滑插值（只影响观感）。
- 所有写操作（播种/浇水/施肥/用药/收获/铲除/解锁）统一走 `POST /game/commands`，带 `commandId` 幂等。
