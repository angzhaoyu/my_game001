# 数值系统 v1.10 落地说明与偏差记录

本文说明 `farm_game_value_system_final_v1.10.md` 与 `我想实现的.md` 的实现情况，
以及**三处需要你确认的偏差**（都写在最前面）。

---

## 一、需要你确认的偏差

### 1. 成长倍率下限取 0.05，不是文档里的 0.042

文档第十六章要求「最大成熟时间 ≤ 120 分钟，连续时间理论值 119.05 分钟」，
第十七章又规定「`0.042` 为固定成长倍率下限」。这两条在 `1/2/2 分钟` 阶段结构下**互相矛盾**：

```text
每阶段满速耗时 = StageTargetMinutes × 1.20 / 倍率
三阶段合计     = (1 + 2 + 2) × 1.20 / 倍率 = 6.0 / 倍率

6.0 / 0.042 = 142.9 分钟   ← 突破 120 分钟上限
```

文档里的 `5 / 0.042 = 119.05` 是按「5 分钟基准」算的，但 5 分钟其实是**带最佳肥料加成**
后的成绩（`6.0 / 1.20 = 5`），无最佳肥料的正常值是 6 分钟。

实测（后端 `backend/tests/test_value_system.py` 有对应断言）：

| 条件 | 成熟时间 | 文档要求 |
|---|---:|---|
| 环境完美 + 当前阶段最佳肥料 | 5 分钟 | 约 5 分钟 ✓ |
| 环境完美、无最佳肥料 | 6 分钟 | 约 6 分钟 ✓ |
| 最差环境（湿度 0、肥力 0） | 121 分钟 | ≤ 120（离散分钟取整 +1） |

所以取 **`minGrowthMultiplier = 6.0 / 120 = 0.05`**：5/6 分钟的正常体验完全不变，
最差情况恰好 120 分钟，满足「最大成熟时间 ≤ 120 分钟」这条硬指标。
如果你想严格保留 0.042，改 `backend/app/domain/catalog.py` 的 `GROWTH_RULES["minGrowthMultiplier"]` 即可，
但那时最长成熟时间会变成约 143 分钟。

### 2. 收获直接结算金币，不产出果实物品

文档 §12 的 `GrossIncome = floor(产量 × 基础售价 × 品质倍率)` 与 §13.1 的操作闭环
（播种 → 浇水 → 施肥 → 除虫 → 收获）里**没有「出售」这一步**，所以收获时直接入账金币。

后果：背包「果实」页与商店「果实」分类在日常流程里是空的；果实物品仍保留在目录中
（图标、后续图鉴/偷取/任务可用）。如果你希望改成「收获 → 果实进背包 → 再去商店卖」，
只需要把 `backend/app/domain/game.py::_handle_harvest` 里的金币入账换成
`self._add_item(state, crop.fruit_item_id, quantity, now_ms)`，其余逻辑不用动。

### 3. 土地解锁的等级门槛按「行」开放

文档只给了金币价格表，但 `我想实现的.md` 要求「金币和等级可解锁时」才能解锁。
实现为 `minLevel = 第几行`：

| 土地 | 等级门槛 | 说明 |
|---|---|---|
| 1~6（`lands_1`） | 1 级 | 1 号地免费，2~6 号按 50/150/300/500/800 金币 |
| 7~12（`lands_2`） | 2 级 | |
| 13~18（`lands_3`） | 3 级 | |
| 19~24（`lands_4`） | 4 级 | |

改 `backend/app/domain/catalog.py` 的 `PLOTS_PER_LEVEL` 与 `LAND_UNLOCK` 即可调整。

---

## 二、后端实现清单

| 文件 | 内容 |
|---|---|
| `app/domain/catalog.py` | 24 种作物、12 种肥料、6 种药品、土地价格表、季节/天气表、全部数值常量 |
| `app/domain/world.py` | 季节（48h）/ 天气（6h）/ 基础温度（每天 00:00 UTC）= `f(世界种子, 绝对分钟)` 的确定性函数 |
| `app/domain/rules.py` | 成长/品质/产量/病虫害的纯公式（结算与展示共用，可单测） |
| `app/domain/game.py` | 每分钟结算流程（文档第十五章）+ 命令：`unlock_land / plant / water / fertilize / apply_medicine / harvest / shovel / buy_item / sell_item` |
| `app/domain/models.py` | `Plot`（肥力/湿度/土壤健康/阶段/成长值/病虫害/生效肥料药品/品质/产量/每日统计）、`DailyEconomy` |
| `app/domain/serialization.py` | 快照增加 `world`、`daily`，地块字段完整下发 |
| `migrations/002_value_system_v1_10.sql` | 新字段 + `player_actions` + `player_daily_economy`；旧存档作物清空、水肥重置 70 |
| `tests/test_value_system.py` | 用文档第十六章的验收标准逐条断言（成熟时间、品质五档、产量、播种次数、收益上限、世界确定性） |

设计要点：

- **天气不需要落库**。离线补算要重放几千分钟，任何「当前随机结果」都会让重放不一致；
  改成确定性函数后，服务端无论何时重放都得到同一环境。
- **事件等级用增量叠加**。文档说等级由 `AgeMinutes` 决定，又说药品能降低等级。
  如果每分钟把等级重置为曲线值，药效会被立刻抹掉；因此只取曲线的**本分钟增量**叠加，
  自然发展时与曲线完全一致，用药后从降低后的等级继续上升。
- **离线最多补算 24 小时**（`MAX_OFFLINE_MINUTES`），24 小时补算实测约 0.03 秒。
- **操作流水**写入 `player_actions`，**当日经济**写入 `player_daily_economy`（按天保留历史，
  `prune-commands` 会清理 30 天前的数据）。

---

## 三、前端实现清单

| 文件 | 内容 |
|---|---|
| `scripts/farm/ui/LandPlot.ts` | 土地预制体组件：切土块图、切作物三阶段、成长进度条、缺水/缺肥/病害/成熟动画、锁与解锁动画、播种次数提醒 |
| `scripts/farm/ui/LandView.ts` | 装配 24 块地、四种工具、跟随光标、双击开土壤信息框 |
| `scripts/farm/ui/SoilInfoPanel.ts` | 固定大小 + ScrollView；湿度/肥力/土壤健康进度条 + 作物适宜区间；生效肥料（剩余时间/每分钟释放/是否最佳）与药品；「处理病虫害」按钮 |
| `scripts/farm/ui/WaterPrompt.ts` | 浇水次数选择（`btn_1`…`btn_5`，名称里带数字） |
| `scripts/farm/ui/FertilizePanel.ts` | 上半「已选」/ 下半「已有」、追加时间开关、跳转商店（关闭后自动回来） |
| `scripts/farm/ui/ItemPickerPanel.ts` | 通用选择框，种子与药品复用 |
| `scripts/farm/ui/WeatherHud.ts` | 季节 / 天气 / 温度三个 Label，不做动画 |
| `scripts/core/...` | `bootstrap?catalog=0` 轮询刷新（15 秒）、`GameCommandType` 扩展、快照类型扩展 |

**节点、动画、进度条、面板全部在 Cocos 里搭**，代码只做：切 `active`、换 `spriteFrame`、
填 `Label`、播已经做好的 `Animation`。完整节点层级见 `frontend/scenes/farm.scene.md`。

可调参数都在组件属性上（`LandPlot.fertilityAlertGap` / `moistureAlertGap` / `soilPathPattern`、
`growthFillMaxWidth`、`SoilInfoPanel.fertilityAlertGap` 等），填 0 表示跟随服务端配置。

---

## 四、验收时怎么跑

```bash
# 后端
PYTHONPATH=backend python -m unittest discover -s backend/tests -v   # 47 个用例
PYTHONPATH=backend python -m ruff check backend

# 前端
cd frontend && npm ci && npm run typecheck        # core + farm（含 UI 脚本）
```

把脚本合入真实 Cocos 工程时，请**排除 `frontend/typings/` 目录**
（它只是给 `npm run typecheck` 用的最小 `cc` 类型声明，不参与构建）。
