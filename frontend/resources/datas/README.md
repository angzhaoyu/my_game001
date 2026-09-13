# `resources/datas` —— 客户端 CSV 配置表

所有**静态定义**都放在这个目录里（一张表一个 CSV），代码只按表名引用，不再抄一遍数值。
拷进真实 Cocos 工程时整个目录放到 `assets/resources/datas/`（Cocos 会把 `.csv` 识别成 `TextAsset`）。

```text
resources/datas/
├─ Crop_Data.csv        24 种作物：季节 / 温度 / 湿度 / 三阶段分钟 / 目标肥力 / 最佳肥料 / 售价
├─ Fertilizer_Data.csv  肥料：类型（无机/有机）/ 肥力 / 持续分钟 / 每分钟释放 / 土壤健康 / 价格 / 效果说明
├─ Medicine_Data.csv    药品：目标（害虫/病害）/ 威力 / 是否每分钟 / 持续分钟 / 价格 / 说明
├─ Land_Data.csv        24 块土地：解锁金币、解锁等级（按行开放）
├─ Game_Rule.csv        全局数值：土地数量、每行块数、每日播种上限、单次加水量、换图阈值、基础产量、经验曲线……
├─ Soil_Data.csv        土块显示态 → soil 贴图（正常 / 未解锁 / 缺肥 / 缺水）与判定说明
├─ Quality_Data.csv     品质五档：分数区间 → 档位名 + 倍率
├─ Season_Data.csv      四季：id、名称、基准温度区间
└─ Weather_Data.csv     五种天气：名称、温度修正、湿度修正、病虫害风险
```

## 一、读写规则

1. **文件名 = 代码里注册的表名**（`Crop_Data.csv` → `Crop_Data`），表名对不上会打一条 warn 并跳过；
2. 第一行是表头（中文列名），代码用「别名列表」匹配，`ID` / `id` / `编号` 都能认；
3. 以 `#` 开头的行、空行会被忽略；
4. 编码 **UTF-8（带 BOM）+ LF**，Excel / WPS 双击不乱码；含逗号的值用引号包起来，如 `"(25,32)"`；
5. 数值列写 `10`、`1.6` 即可；布尔列写 `是/否`（也接受 `true/false`）；
6. 一个字段多值用 `|` 分隔（如 `compost|npk_15|potassium_sulfate`），季节写成 `春夏` / `全年`。

> 本目录取代早期的 `frontend/Crop_Data.csv`、`frontend/Fertilizer_Data.csv` 和 `frontend/新建文件夹/`；
> 那份原始设计笔记已存档到 `docs/legacy_design_notes.md`。作物贴图命名规则就来自它：
> **图片名 = `Crop_Data` 的 ID + `-01 / -02 / -03`**（例如 `longan-01`）。

## 二、表与代码的对应关系

| 表 | 代码入口 | 用途 |
|---|---|---|
| `Crop_Data` | `farm/config/CropConfig.ts` | 阶段图名、适宜区间、提示文案 |
| `Fertilizer_Data` | `farm/config/FertilizerConfig.ts` | 施肥框 / 信息框的肥料名、类型、剩余时间、说明 |
| `Medicine_Data` | `farm/config/MedicineConfig.ts` | 药品选择框 |
| `Land_Data` | `farm/config/LandConfig.ts` | 未解锁土块的价格与等级门槛 |
| `Game_Rule` | `farm/config/LandConfig.ts` 的 `LAND.*` | 布局块数、浇水次数、换图阈值、基础产量、经验曲线 |
| `Soil_Data` | `farm/config/LandConfig.ts` 的 `soilStyle()` | 土块换图（缺肥 / 缺水不再有动画） |
| `Quality_Data` | `farm/config/LandConfig.ts` 的 `qualityGrade()` | 品质档位兜底 |
| `Season_Data` / `Weather_Data` | `farm/config/WeatherConfig.ts` | 季节 / 天气名称显示 |

CSV 只在**启动时读一次**（`ui/Assets.ts` 的 `loadResourceTables()`）。`/game/bootstrap` 的 catalog 一到，
就用同一套解析规则覆盖同名表——**服务端永远权威**，表里写了过期数值也不会算错钱。

## 三、改数值怎么改

- **只改显示**（列名、贴图路径、说明文字）：直接改本目录的 CSV。
- **改玩法数值**（价格、成长、产量、阈值）：**先改服务端** `backend/app/domain/catalog.py`，
  然后重新生成表格，保证两边不漂移：

  ```bash
  python tools/gen_client_tables.py
  ```

- `Soil_Data.csv` 的贴图列支持占位符：`{state}` / `{suffix}` = 后缀列（a/b/c/d），
  `{name}` = 状态英文名（normal/locked/lowfert/dry），`{col}` = 列号（1..6）。
  同一列土地有 6 张图，改路径时**不要漏列**。
