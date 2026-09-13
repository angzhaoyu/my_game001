# Farm 场景节点契约（数值系统 v1.10 · 土地合并版）

> 总原则：**先在 Cocos Creator 里把节点、动画、进度条、面板全部搭好，代码只负责「唤醒 / 换图 / 填字 / 播动画」。**
> 代码不在运行时创建 UI 节点；列表类单元格用编辑器预置的节点（不够时克隆第一个当模板）。
>
> 本版三处变化：
> 1. `LandView.ts` 与 `LandPlot.ts` **合并成一个文件**：`lands` 节点上只挂 `LandView`，
>    **土地预制体不再需要挂脚本**（代码按节点名找引用）；
> 2. **删除 `fx_dry` / `fx_lowfert` 动画**：缺水、缺肥直接换 `soil` 贴图（4 状态 × 6 列），
>    阈值 = 作物需求 − `Game_Rule.soilAlertGap`（默认 15 点）；
> 3. 静态数值全部移到 `resources/datas/*.csv`（见 `frontend/resources/datas/README.md`）。

---

## 0. 全局约定

| 约定 | 说明 |
|---|---|
| 命名 | 节点名与下表完全一致。查找是**递归 + 容错**的：`lb_growth`、`growth`、`Growth` 都能匹配；找不到只打 warn，不会崩 |
| 动画 | 任何 `fx_*` 节点挂 `Animation` + 默认 `AnimationClip`；代码只做 `active=true` → `play()` → 播完 `active=false` |
| 进度条 | `bg` + `fill`（Sprite）。默认写 `fill.fillRange`（0~1）；在 `LandView.growthFillMaxWidth` 填了宽度时改为按 width 缩放 |
| 点击外部关闭 | 面板根节点铺满全屏，根节点自身收到 `TOUCH_END`（`event.target === 根节点`）时关闭 |
| 土块贴图 | 路径模板与判定都写在表 `Soil_Data` 里，默认 `farm/lands_{state}1/locked_{col}{state}/spriteFrame`；同一列 6 张图，**不要漏列** |

土块状态（只有 4 种，全部靠 `soil` 换图表达，**不再有状态动画节点**）：

| 状态 | 后缀 | 显示名 | 判定（代码） |
|---|---|---|---|
| `normal` | `a` | 正常 | 默认 |
| `locked` | `b` | 未解锁 | `plot.unlocked === false` |
| `lowfert` | `c` | 缺肥 | 有作物且 `肥力 < 目标肥力 − soilAlertGap` |
| `dry` | `d` | 缺水 | 有作物且 `湿度 < 作物湿度下限 − soilAlertGap` |

`soilAlertGap` 来自表 `Game_Rule.csv`（服务端 catalog 到达后以服务端值为准），
也可以在 `LandView.soilAlertGap` / `SoilInfoPanel.soilAlertGap` 上单独覆盖（填 0 = 用表值）。

---

## 1. 场景层级

```
Canvas（挂载 GameRoot.ts）
│
├─ bg_ground                              Node/Sprite   背景
├─ Camera                                 Camera        相机
│
├─ lands                                  Node          土地根节点（只挂 LandView.ts）
│  ├─ lands_1                             Node          第 1 行
│  │  ├─ 1 … 6                            Prefab        土地预制体实例（不需要挂脚本，见 §2）
│  ├─ lands_2 … lands_4                   Node          结构相同
│  └─（子节点名也支持 land_1 / land_7 两种写法；块数与行数读表 Game_Rule）
│
├─ WeatherHud                             Node          天气栏（挂 WeatherHud.ts，只有 Label，不做动画）
│  ├─ lb_season                           Label         「季节：夏」
│  ├─ lb_weather                          Label         「天气：晴」
│  ├─ lb_temp                             Label         「温度：28.4℃」
│  └─ lb_day                              Label         「第 19675 天」
│
├─ ToolCursorLayer                        Node          工具光标层（可选：没有就不显示光标，代码只提示一次）
│  └─ ToolCursor                          Node          Sprite + UIOpacity(≈180)，代码只改位置/贴图/显隐
│
├─ TopBar                                 Node          玩家信息栏
│  └─ PlayerInfoSection
│     ├─ ExpBar/Bar                       Sprite        经验条
│     ├─ LevelLabel                       Label         Lv.N
│     ├─ GoldHud/CoinsLabel               Label         金币
│     ├─ DiamondsSection/DiamondsLabel    Label
│     └─ Energy/EnergyLabel               Label
│
├─ LeftBar                                Node          左侧工具栏
│  ├─ ShopBtn / BackpackBtn               Node
│  ├─ Water                               Node          浇水（点一下弹次数框，再点一下取消）
│  ├─ Shovel                              Node          铲子（无选择框）
│  ├─ Harvest                             Node          采摘（无选择框）
│  └─ Fertilizer                          Node          施肥（弹施肥选择框）
│
├─ RightBar                               Node          右侧栏（好友，未实现）
│
├─ Toast                                  Node          提示（挂 Toast.ts）
│  └─ ToastLabel                          Label
│
├─ SoilInfoPanel                          Node          土壤信息框（挂 SoilInfoPanel.ts，全屏根节点，见 §3）
├─ WaterPrompt                            Node          浇水次数框（挂 WaterPrompt.ts）
│  └─ Panel
│     ├─ lb_title                         Label         「浇水」
│     ├─ times                            Node          次数按钮容器
│     │  └─ btn_1 … btn_5                 Button        名称里的数字 = 次数
│     ├─ lb_hint                          Label         每次 +N 湿度，共 +M
│     └─ btn_confirm / btn_close          Button
│
├─ FertilizePanel                         Node          施肥框（挂 FertilizePanel.ts）
│  └─ Panel
│     ├─ header/Title                     Label         「给第 3 块土地施肥」
│     ├─ header/CloseBth                  Button
│     ├─ top/ScrollView/view/content      Node          已选肥料（Cell 预制体实例）
│     ├─ bottom/ScrollView/view/content   Node          背包已有的肥料
│     ├─ toggle_append                    Node          追加时间（子节点 checkmark 或 Toggle）
│     ├─ lb_hint                          Label
│     ├─ btn_shop                         Button        跳商店（关闭商店后自动回到本框）
│     └─ btn_confirm                      Button
│
├─ SeedPanel                              Node          种子选择（挂 ItemPickerPanel.ts）
│  └─ Panel
│     ├─ lb_title / lb_hint               Label
│     ├─ ScrollView/view/content          Node          每格：icon + lb_name + lb_count
│     └─ btn_close                        Button
│
├─ MedicinePanel                          Node          药品选择（挂 ItemPickerPanel.ts，结构同 SeedPanel）
│
├─ BackpackPanel                          Node          背包（挂 BackpackPanel.ts）
│  └─ Panel
│     ├─ header（Title + CloseBth）
│     ├─ toolbar                          Node          tab / tab-001…tab-004 = 全部/种子/果实/化肥/药品
│     │                                                 btn_time / btn_name = 排序
│     ├─ ScrollView/view/content          Node          CellItem 预制体实例
│     └─ footer                           Label         「共 N 件物品」
│
└─ ShopPanel                              Node          商店（挂 ShopPanel.ts）
   └─ Panel
      ├─ header / toolbar                  tab / tab-001 / tab-002 = 种子/化肥/药品
      ├─ ScrollView/view/content           Node          ShopItem 预制体实例
      └─ footer                            Label         「金币：N · 在售 M 种」
```

> `ToolEffectLayer` 及 `WaterEffectTemplate` 等兜底模板已经删掉：四种工具动画都在地块预制体的
> `ToolEffect` 里做好，预制体缺节点时就不播动画，不再在运行时实例化模板。

---

## 2. LandPlot 土地预制体

路径建议：`assets/resources/farm/prefabs/LandPlot.prefab`。
**预制体是纯节点树，不挂任何脚本**（原来的 `LandPlot.ts` 已合并进 `LandView.ts`）。

```
LandPlot（预制体根节点）
├─ soil                     Sprite   土地图片（4 状态 × 6 列，按表 Soil_Data 换图）
│
├─ crop                     Node     作物（有作物时常驻，成熟后隐藏）
│  ├─ stage                 Sprite   阶段图（{cropId}-01 / -02 / -03），代码在 3 个阶段之间换图
│  └─ growth                Node     成长进度条（成长值 0~100）
│     ├─ bg                 Sprite
│     ├─ fill               Sprite
│     └─ lb_growth          Label    成长值 / 「可采摘」
│
├─ ToolEffect               Node     工具动画容器（代码只切 active）
│  ├─ fx_watering           Node     浇水动画（内含 Sprite 承载动画，下面几个 fx 同理）
│  ├─ fx_shovel             Node     铲地 / 初始化土块动画
│  ├─ fx_fertilize          Node     施肥动画
│  └─ fx_harvest            Node     采摘动画
│
├─ pest                     Node     病虫害（常驻显示）
│  ├─ fx_pest               Node     害虫动画（plot.pest 激活时唤醒）
│  └─ fx_disease            Node     病害动画（plot.disease 激活时唤醒）
│
├─ mature                   Node     成熟表现（成熟后唤醒）
│  ├─ fx_mature             Node     成熟 / 可采摘动画（成熟瞬间播一次）
│  └─ lb_mature             Label    「西红柿 ×10」
│
├─ lock                     Node     未解锁（未解锁时唤醒）
│  ├─ icon_lock             Sprite   锁图标
│  └─ fx_unlock             Node     可解锁时循环提示 + 解锁成功时播一次
│
└─ notify                   Node     （可选）文字提醒「播种 3/3」，不想要就删掉，改用 Toast
   └─ label                 Label
```

要点：

- `crop` / `stage` / `growth` 都挂在 `soil` 下面也可以、和 `soil` 平级也可以——**代码是递归按名字找的**；
- 缺水 / 缺肥**不需要**任何 `fx` 节点，只换 `soil` 的贴图（`Soil_Data` 里改路径即可）；
- 一列 6 块地共用同一条 `soil` 路径模板，列号由「行内第几个子节点」推出（`1…6` → `col`）。

`LandView` 组件属性（属性检查器可调，全部有兜底值）：

| 属性 | 默认 | 说明 |
|---|---|---|
| `toolCursorLayer` | — | 工具光标层；不填则自动找名为 `ToolCursorLayer` 的节点 |
| `soilAlertGap` | `0` | 换图阈值：低于作物需求多少点时切成缺水 / 缺肥图；`0` = 读 `Game_Rule.soilAlertGap`（15） |
| `cropPathPattern` | `farm/crop/{icon}/spriteFrame` | 作物阶段图路径模板，`{icon}` = `longan-01` 这类图名 |
| `growthFillMaxWidth` | `0` | 进度条按宽度缩放时的最大宽度；`0` = 用 `fillRange` |

---

## 3. SoilInfoPanel（双击土地唤醒）

Label 的**节点名就是字段名**（写成 `lb_plotId` 也一样能匹配）；加一行只要在这里加一个节点，
并在 `SoilInfoPanel.TEXT` 里加一个键。

```
SoilInfoPanel（全屏根节点，挂 SoilInfoPanel.ts）
└─ Panel                        Sprite    固定大小
   ├─ bar_moisture              Node      湿度条：bg / fill / range（range = 作物适宜区间）
   ├─ bar_fertility             Node      肥力条：bg / fill / range（range = 目标肥力 ± 换图阈值）
   ├─ ScrollView/view/content   Node      可上下拉动
   │  ├─ plotId                 Label     土地编号
   │  ├─ season                 Label     季节
   │  ├─ weather                Label     天气
   │  ├─ temp                   Label     温度
   │  ├─ moisture               Label     湿度
   │  ├─ fertility              Label     肥力
   │  ├─ soilState              Label     土地状态（读 Soil_Data 的「名称」列）
   │  ├─ cropName               Label     作物名称
   │  ├─ cropStage              Label     生长阶段（第 N / 3 阶段）
   │  ├─ growth                 Label     成长值
   │  ├─ growthSpeed            Label     成长速度（+X/分钟）
   │  ├─ remainingTime          Label     剩余时间（按服务端成长速度线性外推）
   │  ├─ harvestCount           Label     预计产量
   │  ├─ fertilizerName         Label     肥料名称（多行，与下面两列按行对齐）
   │  ├─ fertilizerType         Label     无机 / 有机（多行）
   │  ├─ fertilizerTime         Label     剩余时间（多行）
   │  ├─ pest                   Label     害虫
   │  ├─ disease                Label     病害
   │  ├─ matureState            Label     成熟状态
   │  ├─ harvestYield           Label     收获数量
   │  ├─ quality                Label     品质
   │  ├─ lockPrice              Label     解锁价格 / 等级（读 Land_Data）
   │  └─ plantLimit             Label     播种次数（今日 N/上限）
   └─ btn_medicine              Button    「处理病虫害」→ 打开 MedicinePanel（有病虫害时才唤醒）
```

组件属性：`moistureBar`、`fertilityBar`、`scrollViewComp` 可以拖（不拖就按名字找），
`soilAlertGap` 填 0 = 用表值。

---

## 4. 交互流程（代码只负责唤醒）

| 操作 | 流程 |
|---|---|
| **浇水** | 点 LeftBar/Water → 弹 `WaterPrompt` 选次数 → 确认后 `ToolCursor` 跟随 → 点土块 → 发 `water` 命令 → 光标消失 + 播 `fx_watering`。再点一次 Water 取消 |
| **铲子** | 点 Shovel → 光标跟随（**没有选择框**）→ 点土块 → 发 `shovel` → 播 `fx_shovel` |
| **施肥** | 点 Fertilizer → 弹 `FertilizePanel` → 点下面的肥料加入上面（已选则数量 +1，点上面的格子 −1）→ 可选「追加时间」→ 确认发 `fertilize` → 播 `fx_fertilize` |
| **去商店** | 施肥框点 `btn_shop` → 打开商店 → 关闭商店后**自动回到施肥框** |
| **采摘** | 点 Harvest → 光标跟随 → 点成熟土块 → 发 `harvest` → 播 `fx_harvest`（不选工具时直接点成熟地块也会采摘） |
| **播种** | 未选工具时点**空地** → 弹 `SeedPanel` → 选种子 → 发 `plant`；当日次数用尽时直接 Toast 提示，不弹选择框 |
| **看土壤** | 未选工具时点**有作物的地**，或**双击**任意土块 → 开 `SoilInfoPanel`；点框外关闭 |
| **解锁** | 未选工具时点**未解锁**的地 → 金币 + 等级满足则发 `unlock_land` 并播 `fx_unlock`，否则 Toast 提示 |
| **除虫/治病** | `SoilInfoPanel` 里唤醒 `btn_medicine` → 打开 `MedicinePanel` → 选药品 → 发 `apply_medicine` |

## 5. 资源与服务端

- 作物三阶段图：`{cropId}-01 / -02 / -03`（如 `longan-01`），放 `assets/resources/farm/crop/`；
  种子 `seed_<cropId>`、果实 `fruit_<cropId>`、化肥 `fert_<肥料ID>`、药品 `med_<药品ID>` 放 `assets/resources/textures/items/`；
  土块图 4 组 × 6 列放 `assets/resources/farm/lands_{a|b|c|d}1/`。清单见 `../resources/images.md`。
- 静态定义（作物 / 肥料 / 药品 / 土地 / 全局数值 / 土块状态 / 品质 / 季节 / 天气）全部在
  `assets/resources/datas/*.csv`，改数值先改服务端 `catalog.py` 再跑 `python tools/gen_client_tables.py`。
- 客户端不做任何权威计算：成长、品质、产量、天气、病虫害都来自 `/api/v1/game/bootstrap` 的 `plots` / `world`；
  每 15 秒轮询一次，进度条在两次快照之间按服务端 `growthPerMinute` 平滑插值（只影响观感）。
- 所有写操作（播种 / 浇水 / 施肥 / 用药 / 收获 / 铲除 / 解锁）统一走 `POST /game/commands`，带 `commandId` 幂等。
