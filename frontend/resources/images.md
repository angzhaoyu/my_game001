# 图片与动画资源契约

资源需要在真实 Cocos 工程准备；仓库不包含图片。路径区分大小写，代码默认使用小写 `farm`、`textures`。

## 土壤图（不要漏掉 1..6）

每种状态都需要 6 张位置图，共 24 张，由地块所在列选择：

```text
assets/resources/farm/
├─ lands_a1/locked_1a.png … locked_6a.png   正常
├─ lands_b1/locked_1b.png … locked_6b.png   未解锁
├─ lands_c1/locked_1c.png … locked_6c.png   缺肥
└─ lands_d1/locked_1d.png … locked_6d.png   缺水
```

若旧资源是 `Farm/Lands_a1`，统一重命名或在 Canvas 的 `GameRoot.soilPathPattern` 修改模板，不能只依赖 Windows 忽略大小写。

## 作物与物品

| 资源 | 路径 / 配置来源 |
|---|---|
| 作物三阶段图 | `farm/crop/<cropId>-01.png / -02.png / -03.png`；具体名称由 [crops.csv](datas/crops.csv) 的 `stage_icons` 指定 |
| 种子/果实图 | `textures/items/seed_<cropId>.png / fruit_<cropId>.png`；可在表中配置 `seed_icon/fruit_icon` |
| 肥料图 | `textures/items/<item_id>.png`，来自 [fertilizers.csv](datas/fertilizers.csv)，默认 `fert_<id>` |
| 药品图 | `textures/items/<item_id>.png`，来自 [medicines.csv](datas/medicines.csv)，默认 `med_<id>` |

24 种作物名与图片名以表格为准，不再维护另一份可能过时的逐项列表。单个 `stage` Sprite 根据阶段切图，不需要 3 个 Sprite 节点。

## 工具与动画

- 工具图直接在 LeftBar 的 Water/Fertilizer/Harvest/Shovel 挂 Sprite。
- 预置 `ToolCursorLayer/ToolCursor`：Sprite、UITransform、UIOpacity（约 180）。代码复制工具图并改变位置/显隐，不创建缺失节点。
- `ToolEffect/fx_watering`、`fx_shovel`、`fx_fertilize`、`fx_harvest` 的动画在各自子 `Sprite` 中制作；病虫害与成熟动画同理。
- 已删除缺水/缺肥动画以及全局 ToolEffectLayer 模板，土壤贴图承担缺水/缺肥提示。
- 每次激活重播、常驻循环、默认隐藏方式以 [farm 场景契约](../scenes/farm.scene.md#2-landplot-土地预制体) 为准。
- 面板、按钮、背景和 HUD 图片在编辑器中直接绑定；不再保留不存在的模板说明或旧作物资源清单。
