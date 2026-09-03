**图片资源清单（整理版）**

### 〇、作物图片（v1.10）

每种作物 3 个阶段图，命名为 `Crop_Data` 的 ID 加 `-01 / -02 / -03`，例如：

```text
assets/resources/farm/crop/
├─ longan-01.png   longan-02.png   longan-03.png
├─ lemon-01.png    …
└─ tomato-01.png   tomato-02.png   tomato-03.png
```

另外每种作物还有种子与果实图（土地上用不到，用于背包/商店）：

```text
assets/resources/textures/items/
├─ seed_longan.png   fruit_longan.png
└─ …
```

化肥图标为 `fert_<肥料ID>`（如 `fert_npk_15`、`fert_compost`），
药品图标为 `med_<药品ID>`（如 `med_insecticide_basic`、`med_fungicide_basic`）。

### 一、工具光标与用户动画

#### 1. 默认光标（推荐直接复用，无需新增）
- 直接复用 LeftBar 已有的 Sprite：
  - `nav_water`
  - `nav_fertilizer`
  - `nav_harvest`
  - `nav_shovel`
- 代码会把选中的 LeftBar Sprite 复制为约 **70% 透明** 的跟随光标。


#### 3. 四种操作动画（需由你制作并绑定到场景模板） 已经制作好
建议新增目录与资源：
```
assets/resources/farm/effects/
├─ water/                    # WaterEffect.anim + frames/帧图片
├─ fertilizer/               # FertilizerEffect.anim + frames/帧图片
├─ harvest/                  # HarvestEffect.anim + frames/帧图片
└─ shovel/                   # ShovelEffect.anim + frames/帧图片
```
- 具体节点绑定请参考：`../scenes/tool-effects.setup.md`
- 旧代码生成的水滴、肥雾、弹跳、飘字动画已全部移除。

---

### 二、原有资源完整清单

```
resources/
├─ TopBar/
│  ├─ bg.png
│  ├─ icon_coin.png
│  ├─ icon_diamond.png
│  └─ icon_energy.png
│
├─ LeftBar/
│  ├─ collapse.png
│  ├─ nav_bag_on.png
│  ├─ nav_expand.png
│  ├─ nav_fertilizer.png
│  ├─ nav_harvest.png
│  ├─ nav_shop.png
│  ├─ nav_shovel.png
│  └─ nav_water.png
│
├─ RightBar/
│  ├─ nav_friend.png
│  └─ nav_me_on.png
│
├─ Farm/
│  ├─ bg_ground.png
│  ├─ Lands_a1/
│  │  ├─ locked_1a.png
│  │  ├─ locked_2a.png
│  │  ├─ locked_3a.png
│  │  ├─ locked_4a.png
│  │  ├─ locked_5a.png
│  │  └─ locked_6a.png
│  ├─ Lands_b1/
│  │  ├─ locked_1b.png
│  │  ├─ locked_2b.png
│  │  ├─ locked_3b.png
│  │  ├─ locked_4b.png
│  │  ├─ locked_5b.png
│  │  └─ locked_6b.png
│  ├─ Lands_c1/
│  │  ├─ locked_1c.png
│  │  ├─ locked_2c.png
│  │  ├─ locked_3c.png
│  │  ├─ locked_4c.png
│  │  ├─ locked_5c.png
│  │  └─ locked_6c.png
│  └─ Lands_d1/
│     ├─ locked_1d.png
│     ├─ locked_2d.png
│     ├─ locked_3d.png
│     ├─ locked_4d.png
│     ├─ locked_5d.png
│     └─ locked_6d.png
│
└─ Textures/
   ├─ Items/
   │  ├─ fert_ash.png
   │  ├─ fert_bone.png
   │  ├─ fert_compost.png
   │  ├─ fert_compound.png
   │  ├─ fert_fish.png
   │  ├─ fert_k.png
   │  ├─ fert_liquid.png
   │  ├─ fert_n.png
   │  ├─ fert_organic.png
   │  ├─ fert_p.png
   │  ├─ fert_seaweed.png
   │  ├─ fert_slow.png
   │  ├─ fruit_apple.png
   │  ├─ fruit_banana.png
   │  ├─ fruit_bayberry.png
   │  ├─ fruit_blueberry.png
   │  ├─ fruit_carrot.png
   │  ├─ fruit_coconut.png
   │  ├─ fruit_corn.png
   │  ├─ fruit_eggplant.png
   │  ├─ fruit_grape.png
   │  ├─ fruit_hami.png
   │  ├─ fruit_kiwi.png
   │  ├─ fruit_lemon.png
   │  ├─ fruit_mango.png
   │  ├─ fruit_orange.png
   │  ├─ fruit_peach.png
   │  ├─ fruit_peanut.png
   │  ├─ fruit_pepper.png
   │  ├─ fruit_persimmon.png
   │  ├─ fruit_pineapple.png
   │  ├─ fruit_potato.png
   │  ├─ fruit_pumpkin.png
   │  ├─ fruit_rice.png
   │  ├─ fruit_soy.png
   │  ├─ fruit_strawberry.png
   │  ├─ fruit_tomato.png
   │  ├─ fruit_watermelon.png
   │  ├─ fruit_wheat.png
   │  ├─ seed_blueberry.png
   │  ├─ seed_carrot.png
   │  ├─ seed_corn.png
   │  ├─ seed_cotton.png
   │  ├─ seed_eggplant.png
   │  ├─ seed_garlic.png
   │  ├─ seed_grape.png
   │  ├─ seed_lettuce.png
   │  ├─ seed_onion.png
   │  ├─ seed_peanut.png
   │  ├─ seed_pepper.png
   │  ├─ seed_potato.png
   │  ├─ seed_pumpkin.png
   │  ├─ seed_rice.png
   │  ├─ seed_soy.png
   │  ├─ seed_spinach.png
   │  ├─ seed_strawberry.png
   │  ├─ seed_sunflower.png
   │  ├─ seed_tomato.png
   │  ├─ seed_watermelon.png
   │  └─ seed_wheat.png
   │
   └─ UI/
      ├─ buy_disabled.png
      ├─ buy_normal.png
      ├─ cell.png
      ├─ close_btn.png
      ├─ gold_hud.png
      ├─ ground_strip.png
      ├─ open_btn.png
      ├─ overlay_scrim.png
      ├─ panel.png
      ├─ panel_footer.png
      ├─ panel_header.png
      ├─ sell_badge.png
      ├─ shop_btn.png
      ├─ sort_active.png
      ├─ sort_normal.png
      ├─ stage_bg.png
      ├─ sun.png
      ├─ tab_active.png
      ├─ tab_normal.png
      ├─ toast.png
      └─ toolbar.png
```
