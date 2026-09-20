# 图片资源清单（v1.10 更新）

### 〇、作物图片

每种作物 3 个阶段图，放在 `resources/farm/crop/`：
```
resources/farm/crop/
├─ cabbage-01.png   cabbage-02.png   cabbage-03.png
├─ eggplant-01.png  eggplant-02.png  eggplant-03.png
├─ tomato-01.png    tomato-02.png    tomato-03.png
└─ ... (所有24种作物)
```

### 一、物品图标（按类别分文件夹）

```
resources/textures/
├─ fruit/           # 果实图标：fruit_{cropId}.png
│  ├─ fruit_cabbage.png
│  ├─ fruit_eggplant.png
│  └─ ...
├─ seed/            # 种子图标：seed_{cropId}.png
│  ├─ seed_cabbage.png
│  ├─ seed_eggplant.png
│  └─ ...
├─ fertilizer/      # 化肥图标：fertilizer_{fertId}.png 或 fert_{fertId}.png
│  ├─ fertilizer_urea.png
│  ├─ fertilizer_chicken_manure.png
│  └─ ...
└─ pesticide/       # 药剂图标：med_{pesticideId}.png
   ├─ med_insecticide_basic.png
   ├─ med_grass.png
   └─ ...
```

### 二、工具与 UI

#### LeftBar 按钮图标
```
resources/LeftBar/
├─ nav_bag_on.png      背包
├─ nav_shop.png        商店
├─ nav_shovel.png      铲子
├─ nav_harvest.png     采摘
├─ nav_water.png       浇水
├─ nav_fertilizer.png  施肥
├─ nav_expand.png      展开
└─ collapse.png        折叠
```

#### UI 素材
```
resources/textures/ui/
├─ cell.png           单元格背景
├─ panel.png          面板背景
├─ panel_header.png   面板头部
├─ panel_footer.png   面板底部
├─ close_btn.png      关闭按钮
├─ gold_hud.png       金币框
├─ buy_normal.png     购买按钮
├─ buy_disabled.png   购买按钮（禁用）
├─ sell_badge.png     出售标记
├─ sort_active.png    排序激活
├─ sort_normal.png    排序普通
├─ tab_active.png     Tab 激活
├─ tab_normal.png     Tab 普通
├─ toast.png          提示背景
└─ toolbar.png        工具栏背景
```

### 三、土地图片

```
resources/Farm/
├─ bg_ground.png
├─ Lands_a1/          正常土地
│  ├─ locked_1a.png ... locked_6a.png
├─ Lands_b1/          未解锁土地
│  ├─ locked_1b.png ... locked_6b.png
├─ Lands_c1/          缺肥土地
│  ├─ locked_1c.png ... locked_6c.png
└─ Lands_d1/          缺水土地
   ├─ locked_1d.png ... locked_6d.png
```

### 四、图片路径加载规则

代码使用以下路径规则加载图标（按优先级尝试）：

1. `textures/{category}/{icon}/spriteFrame` — 新路径
2. `textures/{category}/{icon}` — 新路径无子资产
3. `textures/items/{icon}/spriteFrame` — 旧路径兼容
4. `textures/items/{icon}` — 旧路径兼容
5. `farm/crop/{icon}/spriteFrame` — 作物阶段图

其中 category 映射：
- `fruit` → `textures/fruit/`
- `seed` → `textures/seed/`
- `fert` → `textures/fertilizer/`
- `pesticide` → `textures/pesticide/`
