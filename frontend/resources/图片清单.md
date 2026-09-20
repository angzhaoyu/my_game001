# 所需图片完整清单

> 根据 `backend/app/domain/catalog.py` 中的 `_CROP_ROWS`、`_FERTILIZER_ROWS`、`_MEDICINE_ROWS` 生成。
> 代码按 `icon` 字段加载图片，路径为 `resources/textures/{类别文件夹}/{icon}.png`。

---

## 一、种子图标（textures/seed/）

代码加载路径：`textures/seed/{icon}` — icon = `seed_{cropId}`

| 文件名 | 对应作物 | icon字段 |
|--------|----------|----------|
| `seed_longan.png` | 龙眼 | `seed_longan` |
| `seed_lemon.png` | 柠檬 | `seed_lemon` |
| `seed_mango.png` | 芒果 | `seed_mango` |
| `seed_peach.png` | 桃子 | `seed_peach` |
| `seed_carambola.png` | 杨桃 | `seed_carambola` |
| `seed_kiwi.png` | 猕猴桃 | `seed_kiwi` |
| `seed_watermelon.png` | 西瓜 | `seed_watermelon` |
| `seed_grape.png` | 葡萄 | `seed_grape` |
| `seed_orange.png` | 橙子 | `seed_orange` |
| `seed_pitaya.png` | 火龙果 | `seed_pitaya` |
| `seed_strawberry.png` | 草莓 | `seed_strawberry` |
| `seed_sunflower.png` | 向日葵 | `seed_sunflower` |
| `seed_pumpkin.png` | 南瓜 | `seed_pumpkin` |
| `seed_lettuce.png` | 生菜 | `seed_lettuce` |
| `seed_eggplant.png` | 茄子 | `seed_eggplant` |
| `seed_pea.png` | 豌豆 | `seed_pea` |
| `seed_shallot.png` | 小葱 | `seed_shallot` |
| `seed_maize.png` | 玉米 | `seed_maize` |
| `seed_kangkong.png` | 空心菜 | `seed_kangkong` |
| `seed_carrot.png` | 胡萝卜 | `seed_carrot` |
| `seed_garlic.png` | 大蒜 | `seed_garlic` |
| `seed_cabbage.png` | 卷心菜 | `seed_cabbage` |
| `seed_pepper.png` | 辣椒 | `seed_pepper` |
| `seed_tomato.png` | 西红柿 | `seed_tomato` |

---

## 二、果实图标（textures/fruit/）

代码加载路径：`textures/fruit/{icon}` — icon = `fruit_{cropId}`

| 文件名 | 对应作物 | icon字段 |
|--------|----------|----------|
| `fruit_longan.png` | 龙眼 | `fruit_longan` |
| `fruit_lemon.png` | 柠檬 | `fruit_lemon` |
| `fruit_mango.png` | 芒果 | `fruit_mango` |
| `fruit_peach.png` | 桃子 | `fruit_peach` |
| `fruit_carambola.png` | 杨桃 | `fruit_carambola` |
| `fruit_kiwi.png` | 猕猴桃 | `fruit_kiwi` |
| `fruit_watermelon.png` | 西瓜 | `fruit_watermelon` |
| `fruit_grape.png` | 葡萄 | `fruit_grape` |
| `fruit_orange.png` | 橙子 | `fruit_orange` |
| `fruit_pitaya.png` | 火龙果 | `fruit_pitaya` |
| `fruit_strawberry.png` | 草莓 | `fruit_strawberry` |
| `fruit_sunflower.png` | 向日葵 | `fruit_sunflower` |
| `fruit_pumpkin.png` | 南瓜 | `fruit_pumpkin` |
| `fruit_lettuce.png` | 生菜 | `fruit_lettuce` |
| `fruit_eggplant.png` | 茄子 | `fruit_eggplant` |
| `fruit_pea.png` | 豌豆 | `fruit_pea` |
| `fruit_shallot.png` | 小葱 | `fruit_shallot` |
| `fruit_maize.png` | 玉米 | `fruit_maize` |
| `fruit_kangkong.png` | 空心菜 | `fruit_kangkong` |
| `fruit_carrot.png` | 胡萝卜 | `fruit_carrot` |
| `fruit_garlic.png` | 大蒜 | `fruit_garlic` |
| `fruit_cabbage.png` | 卷心菜 | `fruit_cabbage` |
| `fruit_pepper.png` | 辣椒 | `fruit_pepper` |
| `fruit_tomato.png` | 西红柿 | `fruit_tomato` |

---

## 三、化肥图标（textures/fertilizer/）

代码加载路径：`textures/fertilizer/{icon}` — icon = `fert_{fertId}`

| 文件名 | 对应化肥 | icon字段 |
|--------|----------|----------|
| `fert_urea.png` | 尿素 | `fert_urea` |
| `fert_nitrogen_compound.png` | 氮磷复合肥 | `fert_nitrogen_compound` |
| `fert_super_phosphate.png` | 过磷酸钙 | `fert_super_phosphate` |
| `fert_phosphate_fertilizer.png` | 高磷肥 | `fert_phosphate_fertilizer` |
| `fert_potassium_sulfate.png` | 硫酸钾 | `fert_potassium_sulfate` |
| `fert_potassium_compound.png` | 高钾复合肥 | `fert_potassium_compound` |
| `fert_npk_15.png` | 复合肥15-15-15 | `fert_npk_15` |
| `fert_water_soluble.png` | 水溶肥 | `fert_water_soluble` |
| `fert_calcium_fertilizer.png` | 硝酸钙 | `fert_calcium_fertilizer` |
| `fert_compost.png` | 堆肥 | `fert_compost` |
| `fert_chicken_manure.png` | 鸡粪肥 | `fert_chicken_manure` |
| `fert_slow_release.png` | 缓释有机肥 | `fert_slow_release` |

---

## 四、药剂图标（textures/pesticide/）

代码加载路径：`textures/pesticide/{icon}` — icon = `med_{pesticideId}`

| 文件名 | 对应药剂 | icon字段 |
|--------|----------|----------|
| `med_insecticide_basic.png` | 普通杀虫剂 | `med_insecticide_basic` |
| `med_insecticide_advanced.png` | 高级杀虫剂 | `med_insecticide_advanced` |
| `med_bio_agent.png` | 生物菌剂 | `med_bio_agent` |
| `med_grass.png` | 除草剂 | `med_grass` |
| `med_fungicide_basic.png` | 普通杀菌剂 | `med_fungicide_basic` |
| `med_fungicide_advanced.png` | 高级杀菌剂 | `med_fungicide_advanced` |

---

## 五、作物阶段图（farm/crop/）

代码加载路径：`farm/crop/{icon}` — icon = `{cropId}-01`/`-02`/`-03`

每种作物 3 张，共 24×3 = **72 张**：

```
cabbage-01.png  cabbage-02.png  cabbage-03.png
carrot-01.png   carrot-02.png   carrot-03.png
eggplant-01.png eggplant-02.png eggplant-03.png
garlic-01.png   garlic-02.png   garlic-03.png
grape-01.png    grape-02.png    grape-03.png
kangkong-01.png kangkong-02.png kangkong-03.png
kiwi-01.png     kiwi-02.png     kiwi-03.png
lemon-01.png    lemon-02.png    lemon-03.png
lettuce-01.png  lettuce-02.png  lettuce-03.png
longan-01.png   longan-02.png   longan-03.png
maize-01.png    maize-02.png    maize-03.png
mango-01.png    mango-02.png    mango-03.png
orange-01.png   orange-02.png   orange-03.png
pea-01.png      pea-02.png      pea-03.png
peach-01.png    peach-02.png    peach-03.png
pepper-01.png   pepper-02.png   pepper-03.png
pitaya-01.png   pitaya-02.png   pitaya-03.png
pumpkin-01.png  pumpkin-02.png  pumpkin-03.png
shallot-01.png  shallot-02.png  shallot-03.png
strawberry-01.png strawberry-02.png strawberry-03.png
sunflower-01.png sunflower-02.png sunflower-03.png
tomato-01.png   tomato-02.png   tomato-03.png
watermelon-01.png watermelon-02.png watermelon-03.png
carambola-01.png carambola-02.png carambola-03.png
```

---

## 六、图片放置位置汇总

```
assets/resources/
├─ farm/crop/                    ← 72张作物阶段图
├─ textures/
│  ├─ seed/                      ← 24张种子图标
│  ├─ fruit/                     ← 24张果实图标
│  ├─ fertilizer/                ← 12张化肥图标
│  └─ pesticide/                 ← 6张药剂图标
```

**总计：72 + 24 + 24 + 12 + 6 = 138 张图片**

---

## 七、如果你本地图片名和上面不一样

如果你的图片名是旧格式（如 `fertilizer_chicken_manure.png` 而不是 `fert_chicken_manure.png`），有两个选择：

**方案A：重命名本地图片** 使其匹配上表文件名（推荐）

**方案B：保留旧路径兼容** — 把图片放在 `textures/items/` 下，代码会 fallback 到 `textures/items/{icon}` 路径。旧路径文件名与 icon 字段完全一致：
- `textures/items/seed_cabbage.png`
- `textures/items/fruit_cabbage.png`
- `textures/items/fert_urea.png`
- `textures/items/med_insecticide_basic.png`
