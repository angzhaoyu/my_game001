**Farm 场景节点契约（整理版）**

### 核心原则
- **GameRoot** 将服务端快照投影到这些节点。
- 商店 / 背包 / 地块 UI **只能发送语义命令**，禁止直接修改金币后整包保存。
- 新场景优先使用 `@property` 拖拽绑定，节点名查找仅用于兼容。
- 四种工具动画和光标的详细配置见 `tool-effects.setup.md`。

---

### 场景节点层级结构

```
Canvas（挂载 GameRoot.ts）
│
├─ bg_ground                          Sprite          背景图片
├─ Camera                             Camera          相机
│
├─ lands                              Node            地块根节点
│  ├─ lands_1                         Node            （结构相同）
│  │  └─ 1~6                          Sprite *6       地块图片（共6个）
│  ├─ lands_2                         Node
│  ├─ lands_3                         Node
│  └─ lands_4                         Node
│
├─ ToolEffectLayer                    Node            动画层，每个节点下都有一个sprite。
│  ├─ WaterEffectTemplate             Node             
│  │  └─ Sprite                      Sprite           图片加载animation组件
│  ├─ FertilizerEffectTemplate        Node            和 WaterEffectTemplate 结构相同
│  ├─ HarvestEffectTemplate           Node            和 WaterEffectTemplate 结构相同
│  └─ ShovelEffectTemplate            Node            和 WaterEffectTemplate 结构相同
│
├─ TopBar                             Node            玩家信息栏
│  └─ PlayerInfoSection
│     ├─ ExpBar                       Sprite          经验条背景
│     │  └─ Bar                       Sprite          经验条进度条
│     ├─ LevelLabel                   Label           等级（如 Lv.8）
│     ├─ AvatarMask                   Mask            头像遮罩
│     │  └─ AvatarSprite              Sprite          头像
│     ├─ GoldHud                      Node            金币 HUD
│     │  ├─ BgSprite                  Sprite          金币背景
│     │  ├─ CoinsIcon                 Sprite          金币图标
│     │  └─ CoinsLabel                Label           金币数量
│     ├─ DiamondsSection              Node            钻石节点
│     │  ├─ BgSprite
│     │  ├─ DiamondsIcon
│     │  └─ DiamondsLabel
│     └─ Energy                       Node            能量节点（偷好友需要消耗）
│        ├─ BgSprite
│        ├─ EnergyIcon
│        └─ EnergyLabel
│
├─ LeftBar                            Node            左侧栏   图片资源在 `resources/LeftBar/`
│  ├─ BgSprite                        Sprite          左侧栏背景
│  ├─ ShopBtn                         Node            商店按钮
│  │  ├─ ShopBtn                      Button
│  │  └─ Shop                         Sprite
│  ├─ BackpackBtn                     Node            背包按钮
│  │  ├─ BackpackBtn                  Button
│  │  └─ Bag                          Sprite
│  ├─ Water                           Node          浇水工具（绑定 water 模式）   #类似BackpackBtn
│  ├─ Shovel                          Node          铲子工具（铲除作物，不返还种子）   #类似BackpackBtn
│  ├─ Harvest                         Node          采摘工具（仅处理成熟作物）   #类似BackpackBtn
│  ├─ Fertilizer                      Node          施肥工具（点击地块后选择背包化肥）   #类似BackpackBtn
│  ├─ expand                          Node          展开按钮
│  └─ collapse                        Node          收起按钮
│
├─ RightBar                           Node            右侧栏
│  ├─ BgSprite                        Sprite          右侧栏背景
│  └─ Friend                          Node            好友节点（尚未实现）
│
├─ ToolCursorLayer                    Node            工具光标层（放在普通 HUD 之后、弹窗之前）
│  └─ ToolCursor                      Node            运行时由 LandView 自动生成，无需手工创建
│
├─ Toast                              Node            提示节点（挂载 Toast.ts）
│  └─ ToastLabel                      Label           提示文字
│
├─ BackpackPanel                      Sprite          背包面板（背景 4A7A52D5，挂载 BackpackPanel.ts）
│  └─ Panel                           Node            面板主体（背景 5A7A33，挂载 panel 图片）
│     ├─ header                       Sprite          头部
│     │  ├─ Title                     Label           标题「农场背包」
│     │  └─ CloseBth                  Button          关闭按钮
│     ├─ toolbar                      Sprite          工具栏（切换物品视图）
│     │  ├─ tab                       Sprite          「全部」
│     │  │  └─ Label                  Label
│     │  ├─ tab-001                   Sprite          「种子」
│     │  ├─ tab-002                   Sprite          「果实」
│     │  ├─ tab-003                   Sprite          「化肥」
│     │  ├─ lb_排序                   Label           「排序」
│     │  ├─ btn_时间                  Button          时间排序
│     │  └─ btn_名称                  Button          名称排序
│     ├─ ScrollView                   ScrollView
│     │  └─ view                      Mask
│     │     └─ content                Node            存放物品单元格
│     │        └─ CellItem *100       Prefab          预制体（共100个）
│     └─ footer                       Sprite          底部
│        ├─ lb_footer                 Label           底部提示
│        └─ lb_hint                   Label           提示
│
└─ ShopPanel                          Node            商店面板（结构与 BackpackPanel 类似）
   └─ Panel
      ├─ header
      ├─ toolbar
      │  ├─ tab
      │  ├─ tab-001
      │  └─ lb_排序
      ├─ ScrollView
      │  └─ view
      │     └─ content
      └─ footer
```

---

### 预制体结构

#### CellItem（背包物品单元格）
```
CellItem
├─ cell_bg          Sprite      单元格背景
├─ icon             Sprite      物品图标
├─ lb_name          Label       物品名称
├─ lb_count         Label       物品数量
└─ btn_sell_badge   Button      出售标签
   └─ Label         Label       「出售」
```

#### ShopItem（商店物品单元格）
```
ShopItem
├─ cell_bg          Sprite      单元格背景
├─ icon             Sprite      物品图标
├─ lb_name          Label       物品名称
├─ lb_price         Label       价格
├─ lb_recycle       Label       回收值
└─ btn_buy          Button      购买按钮
   └─ lb_buy_text   Label       「购买」
```

---

以上为完整整理后的 **Farm 场景节点契约**，可直接用于开发对照与绑定。