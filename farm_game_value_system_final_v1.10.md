# 农场游戏数值系统 v1.9

## 一、核心规则

- 仅使用现实时间；1分钟=1次服务器标准结算，1小时=60分钟，1天=1440分钟。
- 每块土地每天最多播种3次。
- 良好种植状态约5分钟成熟；任何条件下成熟时间必须 `≤120分钟`。
- 土地仅使用单一 `Fertility`，不计算N/P/K；每种作物仅一个 `FertilityConsumption`，S1/S2/S3相同。
- 基础成熟产量统一10，不写入 `Crop_Data`。
- 成长、品质、产量独立计算。
- 初始品质60；最佳状态成熟接近100。
- 病虫害每分钟低概率判定，已出现事件按持续时间升级。
- 经济按土地独立统计，单块土地每日净收益硬上限100金币。
- 暂不实现种子库存、肥料库存、商店。

---

## 二、时间、季节与天气

### 2.1 时间与离线

每分钟执行 `ExecuteSettlement()`。服务器保存 `LastSettlementTimestamp`。

```text
ElapsedMinutes = (CurrentTimestamp - LastSettlementTimestamp) / 60
```

离线补算按整分钟依次结算，余数保留到下一次结算。

### 2.2 季节

循环：`春 → 夏 → 秋 → 冬 → 春`；每季48小时，完整周期8天。

| 季节 | 基础温度 | 不适宜季节成长倍率 |
| ---- | -------: | -----------------: |
| 春   |  14~22℃ |               0.85 |
| 夏   |  24~32℃ |               0.85 |
| 秋   |  16~25℃ |               0.85 |
| 冬   |   4~12℃ |               0.85 |

适宜季节 `SeasonMultiplier=1.00`。

### 2.3 天气

每天00:00重新随机 `BaseTemperature`，当天保持不变；实际温度：

```text
Temperature = BaseTemperature + WeatherTemperatureModifier
```

天气每6小时更新一次：00:00 / 06:00 / 12:00 / 18:00。

| 季节 | 晴天 | 多云 | 小雨 | 暴雨 | 干旱 |
| ---- | ---: | ---: | ---: | ---: | ---: |
| 春   |  35% |  40% |  20% |   3% |   2% |
| 夏   |  30% |  25% |  22% |  18% |   5% |
| 秋   |  45% |  35% |  15% |   2% |   3% |
| 冬   |  50% |  38% |  10% |   1% |   1% |

| 天气 | 温度修正 | 湿度修正 | 害虫风险/分钟 | 病害风险/分钟 |
| ---- | -------: | -------: | ------------: | ------------: |
| 晴天 |     +2℃ |      1.5 |        +0.01% |        -0.01% |
| 多云 |      0℃ |      1.2 |             0 |             0 |
| 小雨 |     -1℃ |     -1.5 |        -0.02% |        +0.02% |
| 暴雨 |     -3℃ |     -2.0 |        +0.03% |        +0.05% |
| 干旱 |     +3℃ |      2.0 |        +0.03% |        +0.01% |

实际温度低于0℃：小雨→小雪，暴雨→暴雪。

---

## 三、土地与种植限制

### 3.1 土地状态

| 字段                                       | 说明                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| LandID                                     | 1~24                                                               |
| Unlocked                                   | 是否解锁                                                           |
| Fertility                                  | 0~100，当前肥力                                                    |
| SoilHealth                                 | 0~100，土壤健康                                                    |
| Moisture                                   | 0~100，当前湿度                                                    |
| Temperature                                | 当前实际温度                                                       |
| CropID                                     | 当前作物，空地为NULL                                               |
| Stage                                      | 1~3                                                                |
| StageGrowth                                | 0~100                                                              |
| PlantAgeMinutes                            | 本轮实际生长时间                                                   |
| PestLevel / DiseaseLevel                   | 0~100                                                              |
| PestStatus / DiseaseStatus                 | NONE / ACTIVE                                                      |
| PestOnsetTimestamp / DiseaseOnsetTimestamp | 事件出现时间，可空                                                 |
| ActiveFertilizers                          | 有效肥料列表；每项包含肥料ID、剩余时间                             |
| —                                         | 不再设置单一`FertilizerRemainingTime` 字段，剩余时间随肥料项保存 |
| QualityScore                               | 0~100                                                              |
| MatureYield                                | 锁定的成熟产量                                                     |
| HarvestQuantity                            | 当前可收获数量                                                     |
| DailyPlantCount                            | 当日播种次数，0~3                                                  |

新土地：`Fertility=70`、`SoilHealth=70`、`Moisture=70`、病虫害等级0、状态NONE、品质60、播种次数0。土地1初始解锁，其余锁定。

### 3.2 每日播种

```text
if DailyPlantCount >= 3: RejectPlant()
else: DailyPlantCount += 1
```

每天00:00：`DailyPlantCount=0`。初始2块土地每天最多6轮。

### 3.3 土地解锁

初始金币100。

| 土地 |   价格 |
| ---: | -----: |
|    1 |   免费 |
|    2 |     50 |
|    3 |    150 |
|    4 |    300 |
|    5 |    500 |
|    6 |    800 |
|    7 |   1200 |
|    8 |   1800 |
|    9 |   2600 |
|   10 |   3600 |
|   11 |   5000 |
|   12 |   7000 |
|   13 |   9500 |
|   14 |  12500 |
|   15 |  16500 |
|   16 |  21500 |
|   17 |  27500 |
|   18 |  35000 |
|   19 |  44000 |
|   20 |  55000 |
|   21 |  68000 |
|   22 |  83000 |
|   23 | 100000 |
|   24 | 120000 |

```text
if Coins >= LandUnlockCost:
    Coins -= LandUnlockCost
    Land.Unlocked = true
```

---

## 四、湿度、温度与肥力

### 4.1 湿度

自然失水：`-6湿度/小时`。

```text
MoistureChange = -6 × WeatherHumidityModifier / 60
Moisture = clamp(Moisture + MoistureChange, 0, 100)
```

浇水一次：`Moisture += 5`，最终限制0~100。

每种作物拥有自己的 `Hmin,Hmax`。

```text
范围内：HumidityMultiplier = 1.00
低于下限：max(0.20, 1.00 - (Hmin-Moisture) × 0.02)
高于上限：max(0.20, 1.00 - (Moisture-Hmax) × 0.02)
```

番茄 `Hmin=60`，低于60按同一湿度惩罚规则处理。

### 4.2 温度

```text
范围内：TemperatureMultiplier = 1.00
超出：max(0.20, 1.00 - Deviation × 0.05)
```

`Deviation` 为实际温度到最近适宜边界的距离。

### 4.3 肥力

土地：`Fertility=0~100`。
作物：`Target_Fertility`、`FertilityConsumption`。

```text
Fertility = clamp(Fertility - FertilityConsumption, 0, 100)
Ratio = Fertility / Target_Fertility
```

目标上下10%以内：`FertilityMultiplier=1.00`。

低于目标区：

```text
max(0.20, 1.00 - (0.90 - Ratio))
```

高于目标区：

```text
max(0.85, 1.00 - 1.5 × (Ratio - 1.10))
```

---

## 五、肥料系统

### 5.1 规则

无机肥：施用时立即增加 `InstantFertility`，并获得30分钟有效状态。

有机肥：

```text
FertilityPerMinute = TotalFertility / Duration
```

每分钟加入土地肥力。

同种肥料重复使用只增加该肥料的剩余时间，不刷新：

```text
NewRemainingTime = OldRemainingTime + Duration
```

不同肥料可以同时存在。

### 5.2 最佳肥料

`Crop_Data.最佳肥料` 使用 `(S1,S2,S3)` 三元组，按当前 `Stage` 读取对应项。

```text
Stage 1 → 第1项
Stage 2 → 第2项
Stage 3 → 第3项
```

当前阶段存在对应最佳肥料：

```text
BestFertilizerMultiplier = 1.20
BestFertilizerQualityGain = +0.10/分钟
```

否则均为 `1.00 / 0`。多个有效肥料中，最佳肥料成长加成不叠加。

### 5.3 肥料数据库

| ID                   | 名称           | 类型 | 即时/总肥力 | 持续时间 | 每分钟释放 | 土壤健康 | 价格 |
| -------------------- | -------------- | ---- | ----------: | -------: | ---------: | -------: | ---: |
| urea                 | 尿素           | 无机 |          +5 |   30分钟 |         — |       — |    1 |
| nitrogen_compound    | 氮磷复合肥     | 无机 |          +6 |   30分钟 |         — |       — |    2 |
| super_phosphate      | 过磷酸钙       | 无机 |          +5 |   30分钟 |         — |       — |    1 |
| phosphate_fertilizer | 高磷肥         | 无机 |          +6 |   30分钟 |         — |       — |    2 |
| potassium_sulfate    | 硫酸钾         | 无机 |          +6 |   30分钟 |         — |       — |    2 |
| potassium_compound   | 高钾复合肥     | 无机 |          +8 |   30分钟 |         — |       — |    3 |
| npk_15               | 复合肥15-15-15 | 无机 |          +6 |   30分钟 |         — |       — |    2 |
| water_soluble        | 水溶肥         | 无机 |          +7 |   30分钟 |         — |       — |    2 |
| calcium_fertilizer   | 硝酸钙         | 无机 |          +4 |   30分钟 |         — |       — |    1 |
| compost              | 堆肥           | 有机 |      +5总量 |    5分钟 |       +1.0 |       +1 |    1 |
| chicken_manure       | 鸡粪肥         | 有机 |      +6总量 |    4分钟 |       +1.5 |       +1 |    2 |
| slow_release         | 缓释有机肥     | 有机 |      +8总量 |    8分钟 |       +1.0 |       +2 |    3 |

---

## 六、Crop_Data 作物数据库

`阶段时间`统一为 `1/2/2分钟`；`最佳肥料`固定格式为 `(S1,S2,S3)`。基础产量不存于表内。

| ID         | 中文   | 类型 | 季节 | 温度  | 湿度  | 阶段时间 | 肥力消耗/分钟 | 最佳肥料                             | Target_Fertility | 基础售价 | 种子 |
| ---------- | ------ | ---- | ---- | ----- | ----- | -------- | ------------: | ------------------------------------ | ---------------: | -------: | ---: |
| longan     | 龙眼   | 水果 | 夏   | 25~32 | 65~80 | 1/2/2    |           1.6 | (堆肥,复合肥15-15-15,硫酸钾)         |               70 |        3 |   12 |
| lemon      | 柠檬   | 水果 | 春夏 | 18~28 | 55~75 | 1/2/2    |           1.5 | (堆肥,复合肥15-15-15,硫酸钾)         |               68 |        3 |   10 |
| mango      | 芒果   | 水果 | 夏   | 25~32 | 60~85 | 1/2/2    |           1.7 | (鸡粪肥,复合肥15-15-15,高钾复合肥)   |               70 |        3 |   13 |
| peach      | 桃子   | 水果 | 春   | 15~25 | 55~75 | 1/2/2    |           1.5 | (堆肥,过磷酸钙,高钾复合肥)           |               68 |        3 |   10 |
| carambola  | 杨桃   | 水果 | 夏秋 | 20~32 | 60~80 | 1/2/2    |           1.5 | (堆肥,复合肥15-15-15,硫酸钾)         |               68 |        3 |   10 |
| kiwi       | 猕猴桃 | 水果 | 秋   | 15~22 | 65~85 | 1/2/2    |           1.7 | (堆肥,复合肥15-15-15,高钾复合肥)     |               68 |        3 |   14 |
| watermelon | 西瓜   | 水果 | 夏   | 25~32 | 55~75 | 1/2/2    |           1.6 | (尿素,高磷肥,硫酸钾)                 |               70 |        3 |   14 |
| grape      | 葡萄   | 水果 | 夏秋 | 20~28 | 55~75 | 1/2/2    |           1.5 | (鸡粪肥,复合肥15-15-15,高钾复合肥)   |               68 |        3 |    9 |
| orange     | 橙子   | 水果 | 秋冬 | 18~30 | 55~80 | 1/2/2    |           1.6 | (堆肥,复合肥15-15-15,硫酸钾)         |               68 |        3 |   11 |
| pitaya     | 火龙果 | 水果 | 夏   | 25~32 | 50~70 | 1/2/2    |           1.7 | (鸡粪肥,复合肥15-15-15,高钾复合肥)   |               68 |        3 |   14 |
| strawberry | 草莓   | 水果 | 春冬 | 12~22 | 60~85 | 1/2/2    |           1.4 | (尿素,水溶肥,高钾复合肥)             |               68 |        3 |   14 |
| sunflower  | 向日葵 | 作物 | 夏   | 18~28 | 40~60 | 1/2/2    |           1.4 | (尿素,复合肥15-15-15,硫酸钾)         |               65 |        2 |    7 |
| pumpkin    | 南瓜   | 蔬菜 | 夏秋 | 20~30 | 55~75 | 1/2/2    |           1.6 | (鸡粪肥,复合肥15-15-15,高钾复合肥)   |               70 |        3 |   11 |
| lettuce    | 生菜   | 蔬菜 | 春秋 | 10~20 | 60~85 | 1/2/2    |           1.3 | (尿素,复合肥15-15-15,水溶肥)         |               70 |        2 |    7 |
| eggplant   | 茄子   | 蔬菜 | 夏   | 22~32 | 60~80 | 1/2/2    |           1.5 | (鸡粪肥,复合肥15-15-15,高钾复合肥)   |               70 |        3 |    9 |
| pea        | 豌豆   | 蔬菜 | 春秋 | 15~22 | 50~70 | 1/2/2    |           1.4 | (过磷酸钙,过磷酸钙,高磷肥)           |               65 |        2 |    7 |
| shallot    | 小葱   | 蔬菜 | 全年 | 15~25 | 55~75 | 1/2/2    |           1.2 | (尿素,氮磷复合肥,水溶肥)             |               70 |        2 |    6 |
| maize      | 玉米   | 蔬菜 | 夏   | 20~30 | 50~70 | 1/2/2    |           1.4 | (尿素,复合肥15-15-15,硫酸钾)         |               70 |        2 |    7 |
| kangkong   | 空心菜 | 蔬菜 | 夏   | 25~32 | 70~90 | 1/2/2    |           1.2 | (尿素,水溶肥,堆肥)                   |               70 |        2 |    6 |
| carrot     | 胡萝卜 | 蔬菜 | 春秋 | 15~22 | 50~70 | 1/2/2    |           1.4 | (过磷酸钙,复合肥15-15-15,高钾复合肥) |               65 |        2 |    7 |
| garlic     | 大蒜   | 蔬菜 | 秋冬 | 10~20 | 50~70 | 1/2/2    |           1.5 | (堆肥,复合肥15-15-15,硫酸钾)         |               68 |        2 |    7 |
| cabbage    | 卷心菜 | 蔬菜 | 秋冬 | 12~22 | 60~80 | 1/2/2    |           1.4 | (鸡粪肥,复合肥15-15-15,硝酸钙)       |               70 |        2 |    7 |
| pepper     | 辣椒   | 蔬菜 | 夏   | 22~32 | 55~75 | 1/2/2    |           1.5 | (鸡粪肥,高磷肥,高钾复合肥)           |               70 |        3 |    9 |
| tomato     | 西红柿 | 蔬菜 | 夏   | 20~30 | 60~80 | 1/2/2    |           1.4 | (鸡粪肥,复合肥15-15-15,高钾复合肥)   |               70 |        3 |    9 |

---

## 七、成长系统

所有作物阶段时间：S1=1分钟、S2=2分钟、S3=2分钟。

```text
BaseGrowthPerMinute = 100 / (StageTargetMinutes × 1.20)
```

```text
RawGrowthMultiplier =
    SeasonMultiplier
    × TemperatureMultiplier
    × HumidityMultiplier
    × FertilityMultiplier
    × BestFertilizerMultiplier
    × PestGrowthMultiplier
    × DiseaseGrowthMultiplier

FinalGrowthMultiplier = max(0.042, RawGrowthMultiplier)
GrowthPerMinute = BaseGrowthPerMinute × FinalGrowthMultiplier
```

最佳条件下约5分钟成熟；无最佳肥料、环境正常时约6分钟。

`0.042` 是固定成长倍率下限，不是达到上限后的临时加速：

```text
5 / 0.042 = 119.05分钟
```

连续时间理论值为119.05分钟；按1分钟服务器结算粒度，实际成熟不超过120分钟。

病虫害成长倍率：

| Level  | 害虫 | 病害 |
| ------ | ---: | ---: |
| 0~20   | 0.98 | 0.97 |
| 21~40  | 0.95 | 0.93 |
| 41~65  | 0.90 | 0.88 |
| 66~85  | 0.80 | 0.78 |
| 86~100 | 0.65 | 0.60 |

害虫与病害分别计算后相乘；同类只保留当前事件。

---

## 八、品质系统

播种：`QualityScore=60`。

基础品质增长仅发生在播种后前5分钟：

```text
QualityGrowthWindow = 5分钟
BaseQualityGainPerMinute = 8
```

超过5分钟后停止基础品质增长；最佳肥料奖励与品质惩罚继续结算至成熟。

```text
每分钟：
if PlantAgeMinutes <= 5:
    QualityScore += 8
QualityScore += BestFertilizerQualityGain
QualityScore -= TemperatureQualityPenalty
QualityScore -= HumidityQualityPenalty
QualityScore -= FertilityQualityPenalty
QualityScore -= PestQualityDamage
QualityScore -= DiseaseQualityDamage

QualityScore = clamp(QualityScore,0,100)
```

环境惩罚：

```text
TemperatureQualityPenalty = min(0.20, Deviation × 0.02)
HumidityQualityPenalty = min(0.15, Deviation × 0.01)
FertilityDeviation = abs(Fertility-Target_Fertility) / Target_Fertility
FertilityQualityPenalty = max(0, FertilityDeviation-0.10) × 0.50
```

病虫害：

```text
OnsetQualityDamage = 2.5
PestQualityDamagePerMinute = 0.80 × Level / 100
DiseaseQualityDamagePerMinute = 1.00 × Level / 100
```

不同类型病虫害同时存在时伤害求和。5分钟作物若最后1~2分钟偶发事件，成熟品质约95~99可接受。

| 品质   |   分数 | 售价倍率 |
| ------ | -----: | -------: |
| 精品   | 90~100 |   ×1.20 |
| 优良   |  75~89 |   ×1.05 |
| 普通   |  60~74 |   ×1.00 |
| 合格   |  40~59 |   ×0.75 |
| 不合格 |   0~39 |   ×0.50 |

---

## 九、病虫害系统

土地保存：

```text
PestStatus / DiseaseStatus = NONE | ACTIVE
PestOnsetTimestamp / DiseaseOnsetTimestamp = null | timestamp
```

每分钟执行：`PestAppearCheck()`、`DiseaseAppearCheck()`。

基础概率：`0.02%/分钟`，最终概率上限`0.15%/分钟`。

环境风险：

| 条件                 |          害虫 |          病害 |
| -------------------- | ------------: | ------------: |
| 温度偏离每5℃        |   +0.01%/分钟 |   +0.01%/分钟 |
| 湿度偏离每10个百分点 |   +0.01%/分钟 |   +0.01%/分钟 |
| SoilHealth < 60      |   +0.01%/分钟 |   +0.01%/分钟 |
| SoilHealth < 40      | 再+0.01%/分钟 | 再+0.02%/分钟 |

天气风险直接使用天气表。最终：

```text
AppearChance = clamp(BaseChance + EnvironmentRisk + WeatherRisk, 0, 0.15%)
```

同类事件已存在时不重复创建。

事件等级由 `AgeMinutes = 当前时间 - OnsetTimestamp` 决定：

```text
0~5:   Level = 10 + 2 × AgeMinutes
5~10:  Level = 20 + 4 × (AgeMinutes - 5)
10~30: Level = 40 + 1.25 × (AgeMinutes - 10)
30~60: Level = 65 + 0.67 × (AgeMinutes - 30)
60~90: Level = 85 + 0.50 × (AgeMinutes - 60)
90+:   Level = 100
```

处理：

```text
NewLevel = max(0, OldLevel - MedicinePower)
```

等级降到0：状态=`NONE`，时间戳=`null`。

---

## 十、药品系统

| ID                   | 名称       | 类型 | 效果             | 持续时间 | 价格 |
| -------------------- | ---------- | ---- | ---------------- | -------: | ---: |
| insecticide_basic    | 普通杀虫剂 | 杀虫 | -40害虫等级      |    7分钟 |    3 |
| insecticide_advanced | 高级杀虫剂 | 杀虫 | -70害虫等级      |   15分钟 |    5 |
| bio_agent            | 生物菌剂   | 杀虫 | -30害虫等级      |   15分钟 |    4 |
| pest_repellent       | 驱虫植物   | 杀虫 | -10害虫等级/分钟 |   30分钟 |    4 |
| fungicide_basic      | 普通杀菌剂 | 杀菌 | -40病害等级      |    7分钟 |    3 |
| fungicide_advanced   | 高级杀菌剂 | 杀菌 | -70病害等级      |   15分钟 |    6 |

同一种药重复使用：`NewRemainingTime = OldRemainingTime + Duration`；药效不叠加。

---

## 十一、产量与偷取

基础成熟产量：

```text
BaseYield = 10
```

病虫害产量影响：

```text
PestYieldPenalty = 0.25 × Level / 100
PestYieldMultiplier = 1 - PestYieldPenalty

DiseaseYieldPenalty = 0.30 × Level / 100
DiseaseYieldMultiplier = 1 - DiseaseYieldPenalty
```

多个事件：

```text
FinalYieldMultiplier = Product(所有病虫害YieldMultiplier)
FinalYieldMultiplier >= 0.20
MatureYield = floor(10 × FinalYieldMultiplier)
```

无病虫害时 `MatureYield=10`。

成熟后偷取只修改 `HarvestQuantity`：

```text
HarvestQuantity = max(0, MatureYield - StolenQuantity)
```

不修改 `MatureYield` 和 `QualityScore`。

---

## 十二、经济系统

```text
GrossIncome = floor(HarvestQuantity × BasePrice × QualityMultiplier)
NetProfit = GrossIncome - SeedCost - FertilizerCost - MedicineCost
```

单块土地：每天最多3轮。

| 经营状态 | 单地每日净收益 |
| -------- | -------------: |
| 普通     |          30~60 |
| 优秀     |          60~80 |
| 硬上限   |          ≤100 |

上限验算：3轮、精品、成熟产量10、无偷取、每轮1次常规肥料、无药品成本。当前24种作物按最低肥料成本验算，单轮最高净收益26金币，因此单地三轮理论最高78金币/天，满足硬上限。

初始2块土地每天最多6轮，通常总净收益目标约60~100金币/天。

---

## 十三、玩家操作与生命周期

### 13.1 玩家操作

```text
播种 → 浇一次水 → 需要时施肥 → 等待成熟
→ 出现病虫害时处理 → 收获 → 再次播种
```

推荐每轮：播种1次、浇水1次、施肥0~1次、除虫/杀菌0~1次、收获1次；不要求每分钟点击。

### 13.2 生命周期

```text
空土地
↓
播种并初始化 Stage=1、StageGrowth=0、PlantAgeMinutes=0、Quality=60、病虫害=NONE
↓
S1 → S2 → S3
↓
成熟：锁定 QualityScore / MatureYield / HarvestQuantity
↓
其他玩家可偷取
↓
玩家收获
↓
SoilHealth - 2
↓
清空当前作物、病虫害、肥料运行状态和本轮临时数据
```

成熟后停止成长、肥力消耗及病虫害对成熟结果的继续计算；品质和成熟产量保持锁定直到收获。土地长期状态 `SoilHealth/Fertility/Moisture` 保留。

---

## 十四、后端数据结构

### Player

```text
{ PlayerID, Coins }
```

### Land

```text
{
  LandID, Unlocked, Fertility, SoilHealth, Moisture, Temperature,
  CropID, Stage, StageGrowth, PlantAgeMinutes,
  PestLevel, DiseaseLevel, PestStatus, DiseaseStatus,
  PestOnsetTimestamp, DiseaseOnsetTimestamp,
  ActiveFertilizers, ActiveFertilizers,
  QualityScore, MatureYield, HarvestQuantity, DailyPlantCount
}
```

### PlayerAction

```text
{ Timestamp, PlayerID, LandID, ActionType, CropID, FertilizerID, MedicineID, Cost }
```

### LandSnapshot

```text
{
  Timestamp, LandID, CropID, Stage, StageGrowth, PlantAgeMinutes,
  Fertility, SoilHealth, Moisture, Temperature,
  PestLevel, DiseaseLevel, QualityScore, MatureYield,
  HarvestQuantity, DailyPlantCount
}
```

### DailyEconomy

```text
{
  PlayerID, Date, SeedCost, FertilizerCost, MedicineCost,
  GrossIncome, NetIncome, PlantCount, HarvestCount, LandUnlockCost
}
```

---

## 十五、每分钟结算流程

```text
开始
↓
检查新的一天
  ├─ DailyPlantCount = 0
  └─ 生成BaseTemperature、检查Season
↓
检查6小时天气节点并更新Weather
↓
更新Temperature
↓
自然失水
↓
处理Water动作
↓
释放OrganicFertilizer
↓
更新ActiveFertilizers各项剩余时间
↓
扣除FertilityConsumption
↓
PestAppearCheck / DiseaseAppearCheck
↓
记录OnsetTimestamp并更新Level
↓
处理Medicine动作
↓
计算Pest/Disease成长倍率
↓
计算Season / Temperature / Humidity / Fertility倍率
↓
读取当前Stage对应最佳肥料
↓
计算RawGrowthMultiplier并应用>=0.042
↓
增加StageGrowth与PlantAgeMinutes
↓
计算QualityScore
↓
判断阶段完成
↓
S3完成：锁定MatureYield、HarvestQuantity、QualityScore
↓
保存LandSnapshot
↓
结束
```

病虫害必须在本分钟成长和品质计算之前判定，使事件从出现当分钟开始影响结果。

---

## 十六、系统验收标准

| 项目             | 必须满足                                |
| ---------------- | --------------------------------------- |
| 良好成熟时间     | 约5分钟                                 |
| 正常无最佳肥料   | 约6分钟                                 |
| 最大成熟时间     | `≤120分钟`，连续时间理论值119.05分钟 |
| 每地每日播种     | ≤3次                                   |
| 品质             | 五档均可出现                            |
| 最佳品质         | 良好状态成熟接近100                     |
| 快速作物偶发病害 | 约95~99可接受                           |
| 长时间病虫害     | 显著降低成长、品质、产量                |
| 无病虫害基础产量 | 10                                      |
| 单地每日净收益   | ≤100金币                               |
| 初始金币         | 100                                     |
| 初始土地         | 1块解锁                                 |
| 初始2地轮数      | 每天最多6轮                             |
| 操作复杂度       | 不要求每分钟点击                        |
| N/P/K            | 不参与任何计算                          |
| 最佳肥料字段     | 仅一个`(S1,S2,S3)`三元组              |

## 十七、实现约定

1. `Crop_Data.最佳肥料` 永远按 `(S1,S2,S3)` 解释。
2. 不存在独立的 `S1最佳肥料/S2最佳肥料/S3最佳肥料` 字段或逻辑。
3. `FertilityConsumption` 三阶段固定使用同一值。
4. 同种肥料叠加剩余时间；不同肥料可共存；最佳肥料加成不叠加。
5. `BaseYield=10` 为全局规则，不写入作物表。
6. 不允许通过运行时临时加速突破120分钟；`0.042` 为固定成长倍率下限。
7. 成熟后停止成长、肥力消耗和病虫害对成熟结果的继续计算。
8. 偷取只减少`HarvestQuantity`。
9. 所有经济收入与支出进入`PlayerAction`和`DailyEconomy`统计。
10. 所有系统统一使用现实时间与现实分钟结算。
