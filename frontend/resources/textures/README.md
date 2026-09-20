# 资源图片清单（v1.10 更新）

> 本文件为文字清单，不存放实际图片。图片需手动准备后放入对应目录。

## 图片路径规则

图标资源按类别分文件夹存放：

```
resources/
├─ farm/crop/              # 作物三阶段图（{cropId}-01, -02, -03）
├─ textures/fruit/         # 果实图标（fruit_{cropId}.png）
├─ textures/seed/          # 种子图标（seed_{cropId}.png）
├─ textures/fertilizer/    # 化肥图标（fertilizer_{fertId}.png 或 fert_{fertId}.png）
└─ textures/pesticide/     # 药剂图标（med_{pesticideId}.png）
```

代码加载路径（按优先级依次尝试）：
1. `textures/{categoryFolder}/{icon}/spriteFrame`
2. `textures/{categoryFolder}/{icon}`
3. `textures/items/{icon}/spriteFrame`（旧路径兼容）
4. `textures/items/{icon}`（旧路径兼容）
5. `farm/crop/{icon}/spriteFrame`（作物阶段图）

categoryFolder 映射：
- `fruit` → `textures/fruit/`
- `seed` → `textures/seed/`
- `fert` → `textures/fertilizer/`
- `pesticide` → `textures/pesticide/`

---

## 一、作物阶段图（farm/crop/）

每种作物 3 个阶段图，命名：`{cropId}-01.png`, `{cropId}-02.png`, `{cropId}-03.png`

| 作物ID | 名称 | 文件 |
|--------|------|------|
| longan | 龙眼 | longan-01/02/03.png |
| lemon | 柠檬 | lemon-01/02/03.png |
| mango | 芒果 | mango-01/02/03.png |
| peach | 桃子 | peach-01/02/03.png |
| carambola | 杨桃 | carambola-01/02/03.png |
| kiwi | 猕猴桃 | kiwi-01/02/03.png |
| watermelon | 西瓜 | watermelon-01/02/03.png |
| grape | 葡萄 | grape-01/02/03.png |
| orange | 橙子 | orange-01/02/03.png |
| pitaya | 火龙果 | pitaya-01/02/03.png |
| strawberry | 草莓 | strawberry-01/02/03.png |
| sunflower | 向日葵 | sunflower-01/02/03.png |
| pumpkin | 南瓜 | pumpkin-01/02/03.png |
| lettuce | 生菜 | lettuce-01/02/03.png |
| eggplant | 茄子 | eggplant-01/02/03.png |
| pea | 豌豆 | pea-01/02/03.png |
| shallot | 小葱 | shallot-01/02/03.png |
| maize | 玉米 | maize-01/02/03.png |
| kangkong | 空心菜 | kangkong-01/02/03.png |
| carrot | 胡萝卜 | carrot-01/02/03.png |
| garlic | 大蒜 | garlic-01/02/03.png |
| cabbage | 卷心菜 | cabbage-01/02/03.png |
| pepper | 辣椒 | pepper-01/02/03.png |
| tomato | 西红柿 | tomato-01/02/03.png |

---

## 二、果实图标（textures/fruit/）

命名：`fruit_{cropId}.png`

| 文件名 | 对应作物 |
|--------|----------|
| fruit_longan.png | 龙眼 |
| fruit_lemon.png | 柠檬 |
| fruit_mango.png | 芒果 |
| fruit_peach.png | 桃子 |
| fruit_carambola.png | 杨桃 |
| fruit_kiwi.png | 猕猴桃 |
| fruit_watermelon.png | 西瓜 |
| fruit_grape.png | 葡萄 |
| fruit_orange.png | 橙子 |
| fruit_pitaya.png | 火龙果 |
| fruit_strawberry.png | 草莓 |
| fruit_sunflower.png | 向日葵 |
| fruit_pumpkin.png | 南瓜 |
| fruit_lettuce.png | 生菜 |
| fruit_eggplant.png | 茄子 |
| fruit_pea.png | 豌豆 |
| fruit_shallot.png | 小葱 |
| fruit_maize.png | 玉米 |
| fruit_kangkong.png | 空心菜 |
| fruit_carrot.png | 胡萝卜 |
| fruit_garlic.png | 大蒜 |
| fruit_cabbage.png | 卷心菜 |
| fruit_pepper.png | 辣椒 |
| fruit_tomato.png | 西红柿 |

---

## 三、种子图标（textures/seed/）

命名：`seed_{cropId}.png`

与果实列表一一对应，如 `seed_cabbage.png`, `seed_eggplant.png` 等（共24种）。

---

## 四、化肥图标（textures/fertilizer/）

命名：`fertilizer_{fertId}.png` 或 `fert_{fertId}.png`

| 文件名 | 对应化肥 |
|--------|----------|
| fertilizer_urea.png | 尿素 |
| fertilizer_nitrogen_compound.png | 氮磷复合肥 |
| fertilizer_super_phosphate.png | 过磷酸钙 |
| fertilizer_phosphate_fertilizer.png | 高磷肥 |
| fertilizer_potassium_sulfate.png | 硫酸钾 |
| fertilizer_potassium_compound.png | 高钾复合肥 |
| fertilizer_npk_15.png | 复合肥15-15-15 |
| fertilizer_water_soluble.png | 水溶肥 |
| fertilizer_calcium_fertilizer.png | 硝酸钙 |
| fertilizer_compost.png | 堆肥 |
| fertilizer_chicken_manure.png | 鸡粪肥 |
| fertilizer_slow_release.png | 缓释有机肥 |

---

## 五、药剂图标（textures/pesticide/）

命名：`med_{pesticideId}.png`

| 文件名 | 对应药剂 |
|--------|----------|
| med_insecticide_basic.png | 普通杀虫剂 |
| med_insecticide_advanced.png | 高级杀虫剂 |
| med_bio_agent.png | 生物菌剂 |
| med_grass.png | 除草剂 |
| med_fungicide_basic.png | 普通杀菌剂 |
| med_fungicide_advanced.png | 高级杀菌剂 |
