# Farm 场景节点契约（数值系统 v1.10）

> 总原则：**先在 Cocos Creator 里把节点、动画、进度条、面板全部搭好，代码只负责「唤醒 / 切图 / 填字 / 播动画」。**
> 代码不再在运行时创建 UI 节点；列表类单元格用编辑器预置的节点（不够时克隆第一个作为模板）。
>
> 需要调的参数（阈值、路径模板、次数上限等）都做成了组件上的 `@property`，可以在属性检查器里直接改。

---

## 0. 全局约定

| 约定 | 说明 |
|---|---|
| 命名 | 节点名与下表完全一致；代码按名字查找，找不到时会 `console.warn` 并跳过（不会报错崩溃） |
| 动画 | 任何 `fx_*` 节点挂 `Animation` 组件 + 默认 `AnimationClip`；代码只 `active=true` → `play()` → 播完 `active=false` |
| 进度条 | `bg` + `fill`（Sprite）。`fill.fillRange` 为 0~1；如果组件上填了 `growthFillMaxWidth`，则改为按 width 缩放 |
| 点击外部关闭 | 面板根节点铺满全屏，根节点自身接收 `TOUCH_END`（`event.target === 根节点`）时关闭 |
| 土地图片 | 同一列有 6 张图：`farm/Lands_{state}1/locked_{col}{state}`（`state` 取 a/b/c/d，`col` 取 1..6），**不要遗漏任何一列** |

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
├─ lands                                  Node          土地根节点（挂载 LandView.ts）
│  ├─ lands_1                             Node          第 1 行
│  │  ├─ land_1 … land_6                  Prefab        土地预制体实例（每个挂 LandPlot.ts）
│  ├─ lands_2                             Node          第 2 行（结构相同）
│  ├─ lands_3                             Node
│  └─ lands_4                             Node
│     └─ 子节点名也支持 "1".."6"（老场景兼容）
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
├─ ToolEffectLayer                        Node          兜底动画模板层（地块预制体里没有对应 fx 时才用）
│  ├─ WaterEffectTemplate                 Node          Sprite + Animation
│  ├─ FertilizerEffectTemplate            Node
│  ├─ HarvestEffectTemplate               Node
│  └─ ShovelEffectTemplate                Node
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
├─ SoilInfoPanel                          Node          土壤信息框（挂载 SoilInfoPanel.ts，全屏根节点）
│  └─ Panel                               Sprite        固定大小的面板
│     ├─ header/Title                     Label         「第 3 块土地」
│     ├─ header/CloseBth                  Button
│     ├─ ScrollView                       ScrollView    可上下拉动
│     │  └─ view/content                  Node
│     │     ├─ row_moisture               Node          湿度
│     │     │  ├─ lb_title                Label         「湿度」
│     │     │  ├─ Bar/bg                  Sprite
│     │     │  ├─ Bar/fill                Sprite        代码写 fillRange
│     │     │  ├─ Bar/range               Sprite        作物适宜区间（有作物时唤醒）
│     │     │  └─ lb_value                Label
│     │     ├─ row_fertility              Node          肥力（结构同 row_moisture）
│     │     ├─ row_soil_health            Node          土壤健康（fill + lb_value）
│     │     ├─ row_crop                   Node          作物名/阶段（lb_crop）
│     │     ├─ row_quality                Node          品质（lb_quality）
│     │     ├─ row_yield                  Node          产量（lb_yield）
│     │     ├─ row_plant_count            Node          今日播种次数（lb_plant_count）
│     │     ├─ row_fertilizer             Node          生效肥料（lb_fertilizer，多行文本）
│     │     ├─ row_medicine               Node          生效药品（lb_medicine）
│     │     ├─ row_event                  Node          病虫害（lb_event）
│     │     └─ btn_medicine               Button        「处理病虫害」→ 打开 MedicinePanel
│     └─ footer/lb_footer                 Label
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

路径建议：`assets/resources/farm/prefabs/LandPlot.prefab`（挂 `LandPlot.ts`）。

```
LandPlot
├─ soil                     Sprite    土块图（6 列 × 4 状态）
│
├─ states                   Node      土块状态动画（代码只切 active）
│  ├─ fx_watering           Node      浇水动画
│  ├─ fx_shovel             Node      铲地 / 初始化土块动画
│  ├─ fx_fertilize          Node      施肥动画
│  ├─ fx_harvest            Node      采摘动画
│  ├─ fx_dry                Node      缺水（常驻显示，由代码按状态唤醒）
│  └─ fx_lowfert            Node      缺肥（常驻显示）
│
├─ crop                     Node      作物（有作物时常驻，成熟后隐藏）
│  ├─ stage_1               Sprite    第 1 阶段图（{cropId}-01）
│  ├─ stage_2               Sprite    第 2 阶段图（{cropId}-02）
│  ├─ stage_3               Sprite    第 3 阶段图（{cropId}-03）
│  └─ growth                Node      成长进度条（成长值 0~100）
│     ├─ bg                 Sprite
│     ├─ fill               Sprite
│     └─ lb_growth          Label     成长值 / 「可采摘」
│
├─ pest                     Node      病虫害（常驻显示）
│  ├─ fx_pest               Node      害虫动画
│  └─ fx_disease            Node      病害动画
│
├─ mature                   Node      成熟表现（成熟后唤醒）
│  ├─ fx_mature             Node      成熟 / 可采摘动画（成熟瞬间播一次）
│  └─ lb_mature             Label     「西红柿 ×10」
│
├─ lock                     Node      未解锁（未解锁时唤醒）
│  ├─ icon_lock             Sprite    锁图标
│  ├─ lb_price              Label     解锁价格
│  └─ fx_unlock             Node      可解锁时的动画（金币+等级满足）+ 解锁成功动画
│
└─ notify                   Node      文字提醒（今日播种次数用尽等）
   └─ label                 Label
```

### LandPlot 组件属性（属性检查器可调）

| 属性 | 默认 | 说明 |
|---|---|---|
| `soil` | — | 土块 Sprite |
| `soilPathPattern` | `farm/lands_{state}1/locked_{col}{state}/spriteFrame` | 贴图路径模板，占位符 `{state}` `{col}` |
| `cropNode` / `stage1..3` | — | 作物三阶段图 |
| `growthBar` / `growthFill` / `growthFillMaxWidth` | 0 | 进度条；`growthFillMaxWidth>0` 时按宽度缩放，否则用 `fillRange` |
| `pestFx` / `diseaseFx` / `dryFx` / `lowFertFx` | — | 状态动画节点 |
| `matureNode` / `matureFx` / `matureLabel` | — | 成熟表现 |
| `lockNode` / `lockPriceLabel` / `unlockableFx` | — | 未解锁 |
| `notifyNode` / `notifyLabel` | — | 文字提醒 |
| `fertilityAlertGap` | 0 | 缺肥阈值；**0 = 用服务端配置（默认 10 点）**，>0 时覆盖 |
| `moistureAlertGap` | 0 | 缺水阈值；同上 |

---

## 3. 交互流程（代码只负责唤醒）

| 操作 | 流程 |
|---|---|
| **浇水** | 点 LeftBar/Water → 弹 `WaterPrompt` 选次数 → 确认后 `ToolCursor` 跟随鼠标 → 点土块 → 发 `water` 命令 → 光标消失 + 播 `fx_watering`。再点一次 Water 取消 |
| **铲子** | 点 Shovel → 光标跟随（**没有选择框**）→ 点土块 → 发 `shovel` 命令 → 播 `fx_shovel`（初始化土块） |
| **施肥** | 点 Fertilizer → 弹 `FertilizePanel` → 点下面的肥料加入上面（已选则数量 +1，点上面的格子 -1）→ 可选「追加时间」→ 确认发 `fertilize` 命令 → 播 `fx_fertilize` |
| **去商店** | 施肥框里点 `btn_shop` → 打开商店 → 关闭商店后**自动回到施肥框** |
| **采摘** | 点 Harvest → 光标跟随 → 点成熟土块 → 发 `harvest` 命令 → 播 `fx_harvest` |
| **播种** | 未选工具时点**空地** → 弹 `SeedPanel` → 选种子 → 发 `plant` 命令 |
| **看土壤** | 未选工具时点**有作物的地**，或**双击**任意土块 → 开 `SoilInfoPanel`；点框外关闭 |
| **解锁** | 未选工具时点**未解锁**的土块 → 金币+等级满足则发 `unlock_land`，否则 Toast 提示 |
| **除虫/治病** | `SoilInfoPanel` 里出现 `btn_medicine` → 打开 `MedicinePanel` → 选药品 → 发 `apply_medicine` |

面板内部（湿度/肥力/土壤健康进度条、作物适宜区间、生效肥料与剩余时间、病虫害等级、今日播种次数）全部由 `SoilInfoPanel.render()` 填值，节点在 Cocos 里摆好。

---

## 4. 资源清单补充

- 作物三阶段图：`<cropId>-01 / -02 / -03`（例如 `longan-01`），种子 `seed_<cropId>`，果实 `fruit_<cropId>`。
- 化肥图标：`fert_<fertilizerId>`（如 `fert_npk_15`）；药品图标：`med_<medicineId>`（如 `med_fungicide_basic`）。
- 图标全部放在 `assets/resources/textures/items/` 下；作物图放 `assets/resources/farm/crop/`。

## 5. 与服务端的关系

- 客户端不做任何权威计算：成长、品质、产量、天气、病虫害全部来自 `/api/v1/game/bootstrap` 的 `plots` / `world`。
- 客户端每 15 秒用 `GET /game/bootstrap?catalog=0` 轮询刷新；进度条在两次快照之间按服务端给出的 `growthPerMinute` 做平滑插值（只影响观感）。
- 所有写操作（播种/浇水/施肥/用药/收获/铲除/解锁）统一走 `POST /game/commands`，带 `commandId` 幂等。
