# Farm 场景完整节点契约（v1.10 终版）

> **核心原则**：节点在 Cocos Creator 编辑器里搭好，代码只做「取组件 → 填数据 → 切 active → 播动画」。
> 代码 **不会** 在运行时创建 UI 节点（列表不够时克隆第一个子节点作为模板）。

---

## 0. 约定

| 约定 | 说明 |
|------|------|
| **命名** | 节点名必须与本表完全一致（区分大小写）；代码按名字查找，找不到时跳过（不崩溃） |
| **Button** | 所有可点击节点必须挂 `Button` 组件；代码会 `addComponent(Button)` 兜底但建议编辑器预挂 |
| **面板初始状态** | 所有弹窗/面板节点 **默认 active = false**；代码在 `onLoad()` 里也会设 `active = false` |
| **全屏遮罩** | 弹窗根节点铺满 Canvas（Widget 四边=0），挂 `BlockInputEvents` 阻止穿透；根节点自身的 `TOUCH_END`（`event.target === this.node`）触发关闭 |
| **@property 拖绑** | 标记「拖绑」的属性必须在属性检查器里手动拖入对应子节点；标记「自动」的代码按名字查找 |

---

## 1. 场景层级总览

```
Canvas                           ← 挂载 GameRoot.ts
├─ bg_ground                     Sprite          全局背景图
├─ Camera                        Camera + UITransform
│
├─ lands                         Node            ← 挂载 LandView.ts
│  ├─ lands_1                    Node            第 1 行
│  │  ├─ 1 (或 land_1)          Prefab          土地预制体实例（挂 LandPlot.ts）
│  │  ├─ 2 … 6                  Prefab          同上
│  ├─ lands_2 … lands_4          Node            结构同 lands_1
│
├─ WeatherHud                    Node            ← 挂载 WeatherHud.ts
├─ ToolCursorLayer               Node            工具光标层
├─ ToolEffectLayer               Node            兜底动画模板层
├─ TopBar                        Node            玩家信息栏
├─ LeftBar                       Node            左侧功能栏
├─ RightBar                      Node            右侧栏（占位）
├─ Toast                         Node            ← 挂载 Toast.ts
├─ SoilInfoPanel                 Node            ← 挂载 SoilInfoPanel.ts       [默认 active=false]
├─ FertilizePanel                Node            ← 挂载 FertilizePanel.ts      [默认 active=false]
├─ SeedPanel                     Node            ← 挂载 ItemPickerPanel.ts     [默认 active=false]
├─ PesticidePanel                Node            ← 挂载 ItemPickerPanel.ts     [默认 active=false]
├─ BackpackPanel                 Node            ← 挂载 BackpackPanel.ts       [默认 active=false]
├─ ShopPanel                     Node            ← 挂载 ShopPanel.ts           [默认 active=false]
├─ Buy                           Node            ← 挂载 BuyPanel.ts            [默认 active=false]
├─ Sell                          Node            ← 挂载 SellPanel.ts           [默认 active=false]
└─ WaterPrompt                   Node            ← 挂载 WaterPrompt.ts         [默认 active=false]
```

---

## 2. GameRoot（Canvas 根节点）

### 挂载脚本：`GameRoot.ts`

### @property 拖绑清单

| 属性名 | 类型 | 拖入节点 | 备注 |
|--------|------|----------|------|
| `landsNode` | Node | `lands` | 土地根节点 |
| `leftBar` | Node | `LeftBar` | 左侧工具栏 |
| `backpackButton` | Node | `LeftBar > BackpackBtn` | 可留空，代码按名字找 |
| `shopButton` | Node | `LeftBar > ShopBtn` | 可留空，代码按名字找 |
| `backpackPanelNode` | Node | `BackpackPanel` | 可留空 |
| `shopPanelNode` | Node | `ShopPanel` | 可留空 |
| `buyPanelNode` | Node | `Buy` | 可留空 |
| `sellPanelNode` | Node | `Sell` | 可留空 |
| `goldLabelNode` | Node | `TopBar > CoinsLabel` | 可留空 |
| `toastNode` | Node | `Toast` | 可留空 |
| `weatherHudNode` | Node | `WeatherHud` | 可留空 |
| `soilInfoNode` | Node | `SoilInfoPanel` | 可留空 |
| `waterPromptNode` | Node | `WaterPrompt` | 可留空 |
| `fertilizePanelNode` | Node | `FertilizePanel` | 可留空 |
| `seedPanelNode` | Node | `SeedPanel` | 可留空 |
| `pesticidePanelNode` | Node | `PesticidePanel` | 可留空 |

> 所有 `@property` 都可留空——代码会按名字递归查找（`findNode`）。但 **建议拖绑** 以避免同名节点误匹配。

### 运行时按名字查找的节点（代码自动绑定）

| 查找名 | 用途 | 必需 |
|--------|------|------|
| `CoinsLabel` / `gold_hud` | 金币数字 Label | ✅ |
| `LevelLabel` | 等级 Label | 可选 |
| `DiamondsLabel` | 钻石 Label | 可选 |
| `EnergyLabel` | 体力 Label | 可选 |
| `Toast` | Toast 节点 | ✅ |
| `lands` | 土地根节点 | ✅ |
| `ToolCursorLayer` | 工具光标层 | 可选 |
| `ToolEffectLayer` | 特效模板层 | 可选 |
| `SoilInfoPanel` | 土壤信息面板 | ✅ |
| `WaterPrompt` | 浇水次数框 | ✅ |
| `FertilizePanel` | 施肥面板 | ✅ |
| `SeedPanel` | 种子选择面板 | ✅ |
| `PesticidePanel` / `MedicinePanel` | 药剂选择面板 | ✅ |
| `WeatherHud` | 天气栏 | ✅ |
| `LeftBar` / `LefttBar` | 左侧栏 | ✅ |
| `BackpackPanel` | 背包面板 | ✅ |
| `ShopPanel` | 商店面板 | ✅ |
| `Buy` | 购买确认面板 | 可选（兜底直接购买） |
| `Sell` | 出售确认面板 | 可选（兜底直接出售） |

---

## 3. LeftBar（左侧功能栏）

```
LeftBar                          Node + Widget(left, top, bottom)
├─ BgSprite                      Sprite          背景图片
├─ BackpackBtn                   Node + Button   背包按钮
│  └─ Icon                       Sprite          图标（可选）
├─ ShopBtn                       Node + Button   商店按钮
├─ ShovelBtn                     Node + Button   铲子按钮
├─ HarvestBtn                    Node + Button   采摘按钮
├─ WaterBtn                      Node + Button   浇水按钮（点击弹 WaterPrompt）
├─ FertilizerBtn                 Node + Button   施肥按钮
├─ PesticideBtn                  Node + Button   药剂按钮（暂未使用）
└─ expand                        Node + Button   展开/折叠按钮
```

### 交互说明

| 按钮 | 点击行为 |
|------|----------|
| `BackpackBtn` | 关闭 ShopPanel（如果开着）→ 打开 BackpackPanel |
| `ShopBtn` | 关闭 BackpackPanel（如果开着）→ 打开 ShopPanel |
| `ShovelBtn` | 切换铲子工具 → 鼠标跟随铲子图标 → 点土地铲除作物 |
| `HarvestBtn` | 切换采摘工具 → 鼠标跟随 → 点成熟土地采摘 |
| `WaterBtn` | **直接弹出 WaterPrompt** → 确认后鼠标跟随水壶 → 点土地浇水 |
| `FertilizerBtn` | 切换施肥工具 → 点土地弹出 FertilizePanel |
| `expand` / `collapse` | 展开/折叠 LeftBar 动画（子按钮 x 位移） |

> 代码兼容旧名称：`Water`、`Fertilizer`、`Harvest`、`Shovel` 也会被绑定。

---

## 4. TopBar（顶部状态栏）

```
TopBar                           Node + Widget(top, left, right)
├─ BgSprite                      Sprite
├─ PlayerInfoSection             Node
│  ├─ LevelLabel                 Label           「Lv.1」
│  ├─ ExpBar                     Node
│  │  └─ Bar / fill              Sprite          经验条
│  ├─ CoinsLabel                 Label           金币数字（代码写 string）
│  ├─ DiamondsLabel              Label           钻石数字
│  └─ EnergyLabel                Label           体力数字
```

---

## 5. WeatherHud（天气栏）

### 挂载脚本：`WeatherHud.ts`

```
WeatherHud                       Node + WeatherHud.ts
├─ lb_info                       Label           「季节：夏    天气：晴    温度：28.4℃」
```

### @property 拖绑

| 属性名 | 类型 | 拖入节点 | 备注 |
|--------|------|----------|------|
| `infoLabel` | Label | `lb_info` | 单 Label 模式（推荐） |
| `seasonLabel` | Label | — | 旧场景兼容，可留空 |
| `weatherLabel` | Label | — | 同上 |
| `temperatureLabel` | Label | — | 同上 |
| `dayLabel` | Label | — | 同上 |

---

## 6. Toast（飘字提示）

### 挂载脚本：`Toast.ts`

```
Toast                            Node + Toast.ts + UIOpacity
└─ ToastLabel                    Label           提示文字
```

> 默认 `active = false`，代码调用 `show()` 时自动唤醒。

---

## 7. BackpackPanel（背包面板）

### 挂载脚本：`BackpackPanel.ts`

```
BackpackPanel                    Node + BackpackPanel.ts + Widget(四边=0) + BlockInputEvents
├─ Header                        Node
│  ├─ Title                      Label           「背包」
│  └─ CloseBth                   Node + Button   关闭按钮
├─ Toolbar                    Node
│  ├─ left                    Node
│  │  ├─ sort                 Label           「排序」
│  │  ├─ time                 Node + Button   时间排序
   │  │  │  └─ Label             Label           「时间」
│  │  └─ name                 Node + Button   名称排序
   │  │     └─ Label             Label           「名称」
│  └─ right                   Node
   │     ├─ all                  Node + Button   全部筛选
   │     ├─ fruit                Node + Button   果实筛选
   │     ├─ seed                 Node + Button   种子筛选
   │     ├─ fertilizer           Node + Button   化肥筛选
   │     └─ pesticide            Node + Button   药剂筛选
├─ ScrollView                 ScrollView
│  └─ view                    Node + Mask
   │     └─ content              Node + Layout   列表容器（放 BackpackItem 预制体实例）
├─ Footer                     Node
│  └─ lb_hint                 Label           「共 N 件物品」
├─ Separator_1                Sprite          分割线
├─ Separator_2                Sprite          分割线
├─ Separator_3                Sprite          分割线
└─ Border                     Sprite          边框
```

### 运行时查找

| 查找路径 | 用途 |
|----------|------|
| `Panel` | 面板容器（做缩放/透明动画） |
| `Header` / `header` | 头部 → 取 `CloseBth` 绑关闭 |
| `Toolbar` / `toolbar` | 工具栏 → 取 `left`/`right` 子按钮 |
| `ScrollView` | 滚动容器 → 取 `view > content` |
| `Footer` / `footer` | 底部 → 取 Label |
| `right > all/fruit/seed/fertilizer/pesticide` | 分类筛选按钮 |
| `left > time/name` | 排序按钮 |

### 交互流程

```
BackpackBtn 点击
  → BackpackPanel.open()
  → content 填充 BackpackItem 预制体实例
  → 点 right 按钮 → 按类别筛选
  → 点 left 按钮 → 按时间/名称排序
  → 点 BackpackItem 的 btn_buy（出售按钮）
    → 弹出 SellPanel（如果场景有 Sell 节点）
    → 否则直接出售 1 个
  → 点 BackpackItem 格子本身 → Toast 显示详情
  → 点 CloseBth / 点面板外部 → close()
```

---

## 8. ShopPanel（商店面板）

### 挂载脚本：`ShopPanel.ts`

```
ShopPanel                        Node + ShopPanel.ts + Widget(四边=0) + BlockInputEvents

├─ Header                     Node
│  ├─ Title                   Label           「商店」
│  └─ CloseBth                Node + Button   关闭按钮
├─ Toolbar                    Node
│  ├─ left                    Node
│  │  ├─ sort                 Label           「排序」
│  │  ├─ time                 Node + Button   时间（价格）排序
│  │  │  └─ Label             Label           「时间」
│  │  └─ name                 Node + Button   名称排序
│  │     └─ Label             Label           「名称」
│  └─ right                   Node
│     ├─ all                  Node + Button   全部筛选
│     ├─ seed                 Node + Button   种子筛选
│     ├─ fertilizer           Node + Button   化肥筛选
│     └─ pesticide            Node + Button   药剂筛选

├─ ScrollView                 ScrollView
│  └─ view                    Node + Mask
   │     └─ content              Node + Layout   列表容器（放 ShopItem 预制体实例）
├─ Footer                     Node
│  └─ lb_hint                 Label           「金币：N · 在售 M 种」
├─ Separator_1~3              Sprite
└─ Border                     Sprite
```

### 交互流程

```
ShopBtn 点击
  → ShopPanel.open()
  → content 填充 ShopItem 预制体实例（按当前分类）
  → 点 time/name → 排序切换
  → 点 ShopItem 的 btn_buy（购买按钮）
    → 弹出 BuyPanel（如果场景有 Buy 节点）
    → 否则直接购买 1 个
  → 点 CloseBth / 点面板外部 → close()
  → close() 触发 onClose 回调（FertilizePanel 恢复显示）
```

---

## 9. Buy（购买确认面板）

### 挂载脚本：`BuyPanel.ts`

```
Buy                              Node + BuyPanel.ts + Widget(四边=0) + BlockInputEvents
├─ Header                        Node
│  ├─ header                     Sprite          头部背景
│  ├─ close                      Node + Button   关闭按钮
│  └─ title                      Label           「购买」
└─ Body                          Node
   ├─ Icon                       Node
   │  └─ ShopItem                Node + ShopItem.ts（显示商品信息）
   │     ├─ cell_bg              Sprite
   │     ├─ icon                 Sprite
   │     ├─ lb_name              Label
   │     ├─ price                Node            ← open() 时自动 active=false
   │     └─ buy                  Node            ← open() 时自动 active=false
   ├─ numbers                    Node
   │  ├─ bg                      Sprite          背景
   │  ├─ minus                   Node + Button   减号
   │  ├─ munber                  Node            数量显示区（双击可输入）
   │  │  └─ number               Label           默认「1」
   │  ├─ plus                    Node + Button   加号
   │  ├─ lb_name-001             Label           「单价：5 金币」
   │  └─ lb_name-002             Label           「总价：5 金币」
   ├─ cancel                     Node + Button
   │  └─ label                   Label           「取消」
   └─ confirm                    Node + Button
      └─ label                  Label           「确认」
```

### @property 拖绑

| 属性名 | 类型 | 拖入节点 |
|--------|------|----------|
| `shopItemNode` | Node | `Body > Icon > ShopItem` |
| `minusBtn` | Node | `Body > numbers > minus` |
| `plusBtn` | Node | `Body > numbers > plus` |
| `numberNode` | Node | `Body > numbers > munber`（或其子节点 `number`） |
| `unitPriceLabel` | Label | `Body > numbers > lb_name-001` 上的 Label |
| `totalPriceLabel` | Label | `Body > numbers > lb_name-002` 上的 Label |
| `cancelBtn` | Node | `Body > cancel` |
| `confirmBtn` | Node | `Body > confirm` |
| `closeBtn` | Node | `Header > close` |

### 运行时按名字查找

| 查找名 | 用途 |
|--------|------|
| `price` | ShopItem 内的价格节点 → `active = false` |
| `buy` | ShopItem 内的购买按钮节点 → `active = false` |
| `munber` | 双击弹出 EditBox 输入 |

### 交互流程

```
ShopItem.btn_buy 点击
  → BuyPanel.open(shopDef)
  → ShopItem 隐藏 price/buy 节点
  → 显示商品信息 + 单价/总价
  → minus → quantity-- (最小1)
  → plus → quantity++ (最大=金币/单价)
  → 双击 munber → EditBox 手动输入
  → cancel / close / 点外部 → close()
  → confirm → 发送 buy_item 命令 → close() + 刷新 ShopPanel/BackpackPanel/HUD
```

---

## 10. Sell（出售确认面板）

### 挂载脚本：`SellPanel.ts`

> 结构与 Buy 完全相同，区别：ShopItem 换成 BackpackItem，数量上限 = 背包持有数。

```
Sell                             Node + SellPanel.ts + Widget(四边=0) + BlockInputEvents
├─ Header                        Node
│  ├─ header                     Sprite
│  ├─ close                      Node + Button
│  └─ title                      Label           「出售」
└─ Body                          Node
   ├─ Icon                       Node
   │  └─ BackpackItem            Node + BackpackItem.ts
   │     ├─ cell_bg              Sprite
   │     ├─ icon                 Sprite
   │     ├─ lb_name              Label
   │     ├─ lb_count             Label
   │     ├─ price                Node            ← open() 时自动 active=false
   │     └─ buy                  Node            ← open() 时自动 active=false
   ├─ numbers                    Node
   │  ├─ bg                      Sprite
   │  ├─ minus                   Node + Button
   │  ├─ munber                  Node
   │  │  └─ number               Label           默认「1」
   │  ├─ plus                    Node + Button
   │  ├─ lb_name-001             Label           「单价：X 金币」
   │  └─ lb_name-002             Label           「总价：X 金币」
   ├─ cancel                     Node + Button
   │  └─ label                   Label           「取消」
   └─ confirm                    Node + Button
      └─ label                  Label           「确认」
```

### @property 拖绑

| 属性名 | 类型 | 拖入节点 |
|--------|------|----------|
| `backpackItemNode` | Node | `Body > Icon > BackpackItem` |
| `minusBtn` | Node | `Body > numbers > minus` |
| `plusBtn` | Node | `Body > numbers > plus` |
| `numberNode` | Node | `Body > numbers > munber` |
| `unitPriceLabel` | Label | `Body > numbers > lb_name-001` 上的 Label |
| `totalPriceLabel` | Label | `Body > numbers > lb_name-002` 上的 Label |
| `cancelBtn` | Node | `Body > cancel` |
| `confirmBtn` | Node | `Body > confirm` |
| `closeBtn` | Node | `Header > close` |

---

## 11. WaterPrompt（浇水次数框）

### 挂载脚本：`WaterPrompt.ts`

```
WaterPrompt                      Node + WaterPrompt.ts + Widget(四边=0) + BlockInputEvents
├─ Header                        Node
│  ├─ header                     Sprite
│  ├─ close                      Node + Button   关闭按钮
│  └─ title                      Label           「浇 水」
└─ Body                          Node
   ├─ numbers                    Node
   │  ├─ minus                   Node + Button   减号
   │  ├─ munber                  Node            数量显示区
   │  │  └─ number               Label           默认「1」
   │  └─ plus                    Node + Button   加号
   ├─ cancel                     Node + Button
   │  └─ label                   Label           「取消」
   └─ confirm                    Node + Button
      └─ label                  Label           「确认」
```

### @property 拖绑

| 属性名 | 类型 | 拖入节点 |
|--------|------|----------|
| `minusBtn` | Node | `Body > numbers > minus` |
| `plusBtn` | Node | `Body > numbers > plus` |
| `numberNode` | Node | `Body > numbers > munber`（或其子 `number`） |
| `confirmButton` | Node | `Body > confirm` |
| `closeButton` | Node | `Header > close` |
| `cancelBtn` | Node | `Body > cancel` |

### 交互流程

```
LeftBar.WaterBtn 点击
  → WaterPrompt.open()
  → minus → times-- (最小1)
  → plus → times++ (最大 WATER_MAX_TIMES=10)
  → cancel / close / 点外部 → close()
  → confirm → onConfirm(times)
    → LandView 设为 water 工具
    → 鼠标跟随水壶图标
    → 点土地 → 发送 water 命令 → 播浇水动画 → 光标消失
```

---

## 12. SoilInfoPanel（土壤信息面板）

### 挂载脚本：`SoilInfoPanel.ts`

```
SoilInfoPanel                    Node + SoilInfoPanel.ts + Widget(四边=0) + BlockInputEvents
└─ Panel                         Node + Sprite
   ├─ header                     Node
   │  ├─ Title                   Label           「第 N 块土地」
   │  └─ CloseBth                Node + Button   关闭按钮
   ├─ ScrollView                 ScrollView
   │  └─ view                    Node + Mask
   │     └─ content              Node
   │        ├─ row_moisture      Node
   │        │  ├─ lb_title       Label           「湿度」
   │        │  ├─ Bar/bg         Sprite
   │        │  ├─ Bar/fill       Sprite          代码写 fillRange
   │        │  ├─ Bar/range      Sprite          作物适宜区间（有作物时唤醒）
   │        │  └─ lb_value       Label           湿度数值
   │        ├─ row_fertility     Node            结构同 row_moisture
   │        ├─ row_soil_health   Node
   │        │  ├─ Bar/fill       Sprite
   │        │  └─ lb_value       Label
   │        ├─ row_crop          Node
   │        │  └─ lb_crop        Label           作物名/阶段
   │        ├─ row_quality       Node
   │        │  └─ lb_quality     Label           品质
   │        ├─ row_yield         Node
   │        │  └─ lb_yield       Label           产量
   │        ├─ row_plant_count   Node
   │        │  └─ lb_plant_count Label           今日播种次数
   │        ├─ row_fertilizer    Node
   │        │  └─ lb_fertilizer  Label           生效肥料
   │        ├─ row_medicine      Node
   │        │  └─ lb_medicine    Label           生效药剂
   │        ├─ row_event         Node
   │        │  └─ lb_event       Label           病虫害/杂草
   │        └─ btn_medicine      Node + Button   「处理病虫害」→ 打开 PesticidePanel
   └─ footer                     Node
      └─ lb_footer               Label
```

### @property 拖绑

| 属性名 | 类型 | 拖入节点 | 备注 |
|--------|------|----------|------|
| `panelNode` | Node | `Panel` | |
| `titleLabel` | Label | `header > Title` | |
| `moistureBar` | Node | `row_moisture > Bar` | |
| `moistureFill` | Sprite | `row_moisture > Bar > fill` | |
| `moistureRange` | Node | `row_moisture > Bar > range` | 有作物时唤醒 |
| `moistureValue` | Label | `row_moisture > lb_value` | |
| `fertilityBar` | Node | `row_fertility > Bar` | |
| `fertilityFill` | Sprite | `row_fertility > Bar > fill` | |
| `fertilityRange` | Node | `row_fertility > Bar > range` | |
| `fertilityValue` | Label | `row_fertility > lb_value` | |
| `soilHealthFill` | Sprite | `row_soil_health > Bar > fill` | |
| `soilHealthValue` | Label | `row_soil_health > lb_value` | |
| `cropLabel` | Label | `row_crop > lb_crop` | |
| `qualityLabel` | Label | `row_quality > lb_quality` | |
| `yieldLabel` | Label | `row_yield > lb_yield` | |
| `plantCountLabel` | Label | `row_plant_count > lb_plant_count` | |
| `fertilizerLabel` | Label | `row_fertilizer > lb_fertilizer` | |
| `medicineLabel` | Label | `row_medicine > lb_medicine` | |
| `eventLabel` | Label | `row_event > lb_event` | |
| `medicineButton` | Node | `btn_medicine` | 有病虫害时唤醒 |
| `scrollView` | ScrollView | `ScrollView` | |
| `fertilityAlertGap` | number | — | 0=用服务端值 |
| `moistureAlertGap` | number | — | 0=用服务端值 |

### 触发方式

```
双击任意土地 / 单击有作物的土地
  → SoilInfoPanel.open(plot, farmModel)
  → 填充所有 Label + 进度条
  → 有作物时唤醒 moistureRange / fertilityRange
  → 有病虫害/杂草时唤醒 btn_medicine
  → btn_medicine 点击 → PesticidePanel 选择药剂
  → CloseBth / 点外部 → close()
```

---

## 13. FertilizePanel（施肥面板）

### 挂载脚本：`FertilizePanel.ts`

```
FertilizePanel                   Node + FertilizePanel.ts + Widget(四边=0) + BlockInputEvents
└─ Panel                         Node + Sprite
   ├─ header                     Node
   │  ├─ Title                   Label           「给第 N 块土地施肥」
   │  └─ CloseBth                Node + Button
   ├─ top                        Node            已选肥料
   │  └─ ScrollView
   │     └─ view
   │        └─ content           Node + Layout   已选肥料列表（Cell 预制体实例）
   ├─ bottom                     Node            背包已有肥料
   │  └─ ScrollView
   │     └─ view
   │        └─ content           Node + Layout   背包肥料列表（Cell 预制体实例）
   ├─ toggle_append              Node            追加时间开关（子节点 checkmark）
   ├─ lb_hint                    Label           已选提示
   ├─ btn_shop                   Node + Button   跳转商店
   └─ btn_confirm                Node + Button   确认施肥
```

### @property 拖绑

| 属性名 | 类型 | 拖入节点 |
|--------|------|----------|
| `topContent` | Node | `top > ScrollView > view > content` |
| `bottomContent` | Node | `bottom > ScrollView > view > content` |
| `appendToggle` | Node | `toggle_append` |
| `shopButton` | Node | `btn_shop` |
| `confirmButton` | Node | `btn_confirm` |
| `closeButton` | Node | `header > CloseBth` |
| `titleLabel` | Label | `header > Title` |
| `hintLabel` | Label | `lb_hint` |

### 交互流程

```
LeftBar.FertilizerBtn → 点土地
  → FertilizePanel.open(plotId)
  → bottom 显示背包里的肥料
  → 点 bottom 肥料 → 加入 top（已选则+1）
  → 点 top 格子 → 数量-1（=0则移除）
  → toggle_append → 切换追加时间模式
  → btn_shop → 隐藏自己，打开 ShopPanel（关闭商店后自动恢复）
  → btn_confirm → 发送 fertilize 命令 → close()
  → CloseBth / 点外部 → close()
```

---

## 14. SeedPanel（种子选择面板）

### 挂载脚本：`ItemPickerPanel.ts`

```
SeedPanel                        Node + ItemPickerPanel.ts + Widget(四边=0) + BlockInputEvents
├─ Header                        Node
│  ├─ Title                      Label           「选择种子」
│  └─ CloseBth                   Node + Button   关闭按钮
├─ Toolbar                       Node
│  └─ left                       Node
│     ├─ sort                    Label           「排序」
│     ├─ time                    Node
│     │  └─ Label                Label           「生长时间」
│     └─ name                    Node
│        └─ Label                Label           「种子名称」
├─ ScrollView                    ScrollView
│  └─ view                       Node + Mask
│     └─ content                 Node + Layout   BaseItem 预制体实例
├─ Footer                        Node
│  └─ lb_hint                    Label           「点击种子即播种」
├─ Separator_1~3                 Sprite
└─ Border                        Sprite
```

### @property 拖绑

| 属性名 | 类型 | 拖入节点 | 备注 |
|--------|------|----------|------|
| `contentNode` | Node | `ScrollView > view > content` | 自动查找兜底 |
| `closeButton` | Node | `Header > CloseBth` | 自动查找兜底 |
| `titleLabel` | Label | `Header > Title` | 自动查找兜底 |
| `hintLabel` | Label | `Footer > lb_hint` | 自动查找兜底 |

### 触发方式

```
点击空地（无作物、已解锁）
  → LandView.openSeedPicker(plotId)
  → SeedPanel.open("选择种子", "点击种子即播种", rows, callback)
  → content 填充 BaseItem 预制体实例
  → 点 BaseItem.btn_select → close() → 发送 plant 命令
  → CloseBth / 点外部 → close()
```

---

## 15. PesticidePanel（药剂选择面板）

### 挂载脚本：`ItemPickerPanel.ts`（与 SeedPanel 相同脚本）

> 结构与 SeedPanel 完全相同，只是标题和物品不同。

```
PesticidePanel                   Node + ItemPickerPanel.ts + Widget(四边=0) + BlockInputEvents
├─ Header                        Node
│  ├─ Title                      Label           「处理病虫害」
│  └─ CloseBth                   Node + Button
├─ Toolbar                       Node
│  └─ left                       Node
│     ├─ sort                    Label
│     ├─ time                    Node
│     │  └─ Label                Label           「效果」
│     └─ name                    Node
│        └─ Label                Label           「名称」
├─ ScrollView                    ScrollView
│  └─ view
│     └─ content                 Node + Layout   BaseItem 预制体实例
├─ Footer                        Node
│  └─ lb_hint                    Label
├─ Separator_1~3                 Sprite
└─ Border                        Sprite
```

### 触发方式

```
SoilInfoPanel > btn_medicine 点击
  → LandView.openMedicinePicker(plotId)
  → PesticidePanel.open("处理病虫害", "选择要使用的药剂", rows, callback)
  → 点 BaseItem.btn_select → close() → 发送 apply_medicine 命令
```

---

## 16. 预制体

### 16.1 BackpackItem（背包物品单元格）

**挂载脚本：`BackpackItem.ts`**

```
BackpackItem                     Node + BackpackItem.ts + UITransform(97.33 × 97.33)
├─ cell_bg                       Sprite          单元格背景（果实时根据品质变色）
├─ icon                          Sprite          物品图标
├─ lb_name                       Label           物品名称
├─ lb_count                      Label           「剩余:10」
├─ price                         Node
│  ├─ Sprite                     Sprite          金币图标（固定）
│  └─ lb_price                   Label           价格数字
└─ buy                           Node
   ├─ btn_buy                    Node + Button   出售按钮
   └─ lb_buy_text                Label           「出售」
```

**代码按名字查找**：`cell_bg`, `icon`, `lb_name`, `lb_count`, `lb_price`, `btn_buy`, `lb_buy_text`

**品质颜色规则**（仅 `category === 'fruit'` 时生效）：

| 品质等级 | cell_bg 颜色 |
|----------|-------------|
| 精品 | RGB(255,215,0) 金色 |
| 优良 | RGB(100,200,100) 绿色 |
| 普通 | RGB(200,200,200) 灰白 |
| 合格 | RGB(150,150,200) 淡蓝 |
| 不合格 | RGB(200,100,100) 淡红 |
| 非果实 | Color.WHITE 不变色 |

---

### 16.2 ShopItem（商店物品单元格）

**挂载脚本：`ShopItem.ts`**

```
ShopItem                         Node + ShopItem.ts + UITransform(97.33 × 97.33)
├─ cell_bg                       Sprite          单元格背景（不变色，始终白色）
├─ icon                          Sprite          物品图标
├─ lb_name                       Label           物品名称
├─ price                         Node
│  ├─ Sprite                     Sprite          金币图标
│  └─ lb_price                   Label           价格数字
└─ buy                           Node
   ├─ btn_buy                    Node + Button   购买按钮
   └─ lb_buy_text                Label           「购买」
```

**代码按名字查找**：`cell_bg`, `icon`, `lb_name`, `lb_price`, `btn_buy`, `lb_buy_text`

---

### 16.3 BaseItem（通用选择单元格）

**挂载脚本：`BaseItem.ts`**

```
BaseItem                         Node + BaseItem.ts + UITransform(97.33 × 97.33)
├─ cell_bg                       Sprite          单元格背景（不变色）
├─ icon                          Sprite          物品图标
├─ lb_name                       Label           物品名称
├─ lb_count                      Label           「剩余:10」
└─ select                        Node
   ├─ btn_select                 Node + Button   选择按钮
   └─ Label                      Label           「选择」
```

**代码按名字查找**：`cell_bg`, `icon`, `lb_name`, `lb_count`, `btn_select`

---

### 16.4 LandPlot（土地预制体）

**挂载脚本：`LandPlot.ts`**

```
LandPlot (Prefab)                Node + LandPlot.ts
├─ soil                          Sprite          土块图
├─ states                        Node            状态动画父节点
│  ├─ fx_watering                Node + Animation
│  ├─ fx_shovel                  Node + Animation
│  ├─ fx_fertilize               Node + Animation
│  ├─ fx_harvest                 Node + Animation
│  ├─ fx_dry                     Node + Animation    缺水（代码按状态唤醒）
│  └─ fx_lowfert                 Node + Animation    缺肥
├─ crop                          Node            作物（有作物时唤醒，成熟后隐藏）
│  ├─ stage_1                    Sprite          第1阶段图
│  ├─ stage_2                    Sprite          第2阶段图
│  ├─ stage_3                    Sprite          第3阶段图
│  └─ growth                     Node            成长进度条
│     ├─ bg                      Sprite
│     ├─ fill                    Sprite          fillRange 或 width 缩放
│     └─ lb_growth               Label           成长值
├─ pest                          Node            病虫害
│  ├─ fx_pest                    Node + Animation
│  └─ fx_disease                 Node + Animation
├─ mature                        Node            成熟（成熟后唤醒）
│  ├─ fx_mature                  Node + Animation
│  └─ lb_mature                  Label           「西红柿 ×10」
├─ lock                          Node            未解锁（未解锁时唤醒）
│  ├─ icon_lock                  Sprite
│  ├─ lb_price                   Label           解锁价格
│  └─ fx_unlock                  Node + Animation
└─ notify                        Node            文字提醒
   └─ label                      Label
```

### @property 拖绑

| 属性名 | 类型 | 拖入 | 备注 |
|--------|------|------|------|
| `soil` | Sprite | `soil` | 自动 |
| `soilPathPattern` | string | — | `farm/lands_{state}1/locked_{col}{state}/spriteFrame` |
| `cropNode` | Node | `crop` | 自动 |
| `stage1` | Sprite | `crop > stage_1` | 自动 |
| `stage2` | Sprite | `crop > stage_2` | 自动 |
| `stage3` | Sprite | `crop > stage_3` | 自动 |
| `growthBar` | Node | `crop > growth` | 自动 |
| `growthFill` | Sprite | `crop > growth > fill` | 自动 |
| `growthFillMaxWidth` | number | — | 0=用 fillRange |
| `growthLabel` | Label | `crop > growth > lb_growth` | 自动 |
| `pestFx` | Node | `pest > fx_pest` | 自动 |
| `diseaseFx` | Node | `pest > fx_disease` | 自动 |
| `dryFx` | Node | `states > fx_dry` | 自动 |
| `lowFertFx` | Node | `states > fx_lowfert` | 自动 |
| `matureNode` | Node | `mature` | 自动 |
| `matureFx` | Node | `mature > fx_mature` | 自动 |
| `matureLabel` | Label | `mature > lb_mature` | 自动 |
| `lockNode` | Node | `lock` | 自动 |
| `lockPriceLabel` | Label | `lock > lb_price` | 自动 |
| `unlockableFx` | Node | `lock > fx_unlock` | 自动 |
| `notifyNode` | Node | `notify` | 自动 |
| `notifyLabel` | Label | `notify > label` | 自动 |
| `statesNode` | Node | `states` | 自动 |
| `fertilityAlertGap` | number | — | 0=跟随服务端 |
| `moistureAlertGap` | number | — | 0=跟随服务端 |

---

## 17. 完整交互流程图

```
┌──────────────────────────────────────────────────────────────────┐
│                        LeftBar 按钮                              │
├──────────┬───────────┬──────────┬──────────┬──────────┬──────────┤
│BackpackBtn│ ShopBtn  │ WaterBtn │Fertilizer│HarvestBtn│ShovelBtn │
│  Btn     │          │          │  Btn     │          │          │
├──────────┼───────────┼──────────┼──────────┼──────────┼──────────┤
│ 打开     │ 打开      │ 弹出     │ 切换     │ 切换     │ 切换     │
│ Backpack │ Shop      │ Water    │ 施肥     │ 采摘     │ 铲子     │
│ Panel    │ Panel     │ Prompt   │ 工具     │ 工具     │ 工具     │
└────┬─────┴─────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┘
     │           │          │          │          │          │
     ▼           ▼          ▼          ▼          ▼          ▼
┌─────────┐ ┌────────┐ ┌────────┐  鼠标跟随   鼠标跟随   鼠标跟随
│Backpack │ │ Shop   │ │ Water  │  肥料图标   采摘图标   铲子图标
│ Panel   │ │ Panel  │ │ Prompt │     │          │          │
│         │ │        │ │        │     │          │          │
│点出售按钮│ │点购买  │ │确认次数│     ▼          ▼          ▼
│  ▼      │ │按钮    │ │  ▼     │  点土地     点成熟地   点有作物地
│Sell     │ │  ▼     │ │鼠标跟随│  弹出       → harvest  → shovel
│Panel    │ │Buy     │ │水壶图标│  Fertilize  命令       命令
│         │ │Panel   │ │  ▼     │  Panel                │
│确认出售 │ │        │ │点土地  │     │                   │
│→ sell   │ │确认购买│ │→ water │  确认施肥               │
│  命令   │ │→ buy   │ │ 命令   │  → fertilize           │
│         │ │ 命令   │ │        │    命令                 │
└─────────┘ └────────┘ └────────┘                        │
                                                         │
┌──────────────────────────────────────────────────────────────────┐
│                       土地点击（无工具时）                         │
├──────────────────┬───────────────────┬────────────────────────────┤
│ 未解锁的土地      │ 有空地（已解锁）   │ 有作物的土地 / 双击任意地   │
├──────────────────┼───────────────────┼────────────────────────────┤
│ → unlock_land    │ → 弹出 SeedPanel  │ → 弹出 SoilInfoPanel       │
│   命令           │   选种子 → plant   │   查看信息                 │
│                  │   命令            │   点「处理病虫害」          │
│                  │                   │   → PesticidePanel         │
│                  │                   │   → apply_medicine 命令    │
└──────────────────┴───────────────────┴────────────────────────────┘
```

---

## 18. 常见陷阱

| 陷阱 | 说明 |
|------|------|
| 面板忘记 `active=false` | 所有弹窗必须默认隐藏，否则一进入场景就全部弹出 |
| Button 组件未挂 | 所有可点击节点必须有 Button 组件（代码会兜底 addComponent 但建议预挂） |
| 节点名拼写不一致 | `CloseBth`（不是 CloseBtn）、`munber`（不是 number）等拼写必须与代码一致 |
| ShopItem 内 price/buy 未隐藏 | BuyPanel.open() 会自动隐藏，但预制体里它们应默认 active=true（正常商店列表需要显示） |
| ScrollView content 没有 Layout | 代码会 addComponent(Layout) 兜底，但建议预挂并设 spacingX/spacingY |
| 土地列名 `lands_1` 不是 `land_1` | LandView 按 `lands_{row}` 查找行，行内按 `1..6` 或 `land_{col}` 查找列 |
| LeftBar 按钮子节点放 Icon Sprite | 工具光标用 `getComponentInChildren(Sprite).spriteFrame` 取图标，按钮内必须有 Sprite |
