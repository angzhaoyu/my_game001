/**
 * ui/LandView.ts —— 农场土地（**已合并原 LandView.ts + LandPlot.ts**）
 *
 * `lands` 节点上只需要这一个组件；土地预制体是**纯节点树，不用再挂脚本**，
 * 代码按节点名找引用，只做三件事：换 `soil` 图、切节点 active、播 Cocos 里做好的 Animation。
 *
 * ```text
 * lands                        Node    挂 LandView.ts
 * ├─ lands_1 … lands_4         Node    每一行
 * │  └─ 1 … 6                  Prefab  土地预制体实例（节点名 = 列号，也支持 land_1 / land_7）
 * │     └─ LandPlot（预制体根）
 * │        ├─ soil             Sprite  土块图（4 状态 × 6 列，缺水/缺肥靠换图，不再有 fx 动画）
 * │        ├─ crop             Node    作物（有作物时唤醒，成熟后隐藏）
 * │        │  ├─ stage         Sprite  阶段图 {cropId}-01/-02/-03，代码换图
 * │        │  └─ growth        Node    成长进度条（0~100）├ bg ├ fill └ lb_growth
 * │        ├─ ToolEffect       Node    工具动画容器（代码只切 active）
 * │        │  ├─ fx_watering   Node    浇水（内含 Sprite + Animation）
 * │        │  ├─ fx_shovel     Node    铲地 / 初始化土块
 * │        │  ├─ fx_fertilize  Node    施肥
 * │        │  └─ fx_harvest    Node    采摘
 * │        ├─ pest             Node    病虫害（常驻显示）├ fx_pest └ fx_disease
 * │        ├─ mature           Node    成熟表现（成熟后唤醒）├ fx_mature └ lb_mature
 * │        └─ lock             Node    未解锁（未解锁时唤醒）├ icon_lock └ fx_unlock
 * ```
 *
 * 可微调参数都在本组件属性上：`soilAlertGap`（低于作物需求多少点换图，0 = 读 `Game_Rule` 表）、
 * `cropPathPattern`、`growthFillMaxWidth`。工具光标用场景里的 `ToolCursorLayer/ToolCursor`。
 */
import {
  _decorator, Animation, Component, EventMouse, EventTouch, Input, input, Label, Node, Sprite,
  SpriteFrame, UITransform, Vec3,
} from 'cc';
import { LAND, soilStyle, unlockRow } from '../config/LandConfig';
import { getCropDef } from '../config/CropConfig';
import { getMedicineDef, medicineIdOf, medicineTargetLabel } from '../config/MedicineConfig';
import { FarmModel } from '../data/FarmModel';
import { InventoryModel } from '../data/InventoryModel';
import { PlayerModel } from '../data/PlayerModel';
import type { PlotData } from '../data/PlotData';
import type { GameActionHandler } from '../GameAction';
import type { GameCommandType } from '../../core/network/Contracts';
import { applySprite, cropPaths, fillPath } from './Assets';
import { findChild, findLabel, findSprite, setBar, setActive } from './NodeUtils';
import type { SoilInfoPanel } from './SoilInfoPanel';
import type { WaterPrompt } from './WaterPrompt';
import type { FertilizePanel } from './FertilizePanel';
import type { ItemPickerPanel, PickerRow } from './ItemPickerPanel';

const { ccclass, property } = _decorator;

export type ToolMode = 'none' | 'water' | 'fert' | 'harvest' | 'shovel';
type ActiveTool = Exclude<ToolMode, 'none'>;

/** 一次性动画节点名：唤醒 → play() → 播完隐藏（都必须在预制体里做好） */
const EFFECT_NODE = {
  watering: 'fx_watering',
  shovel: 'fx_shovel',
  fertilize: 'fx_fertilize',
  harvest: 'fx_harvest',
  mature: 'fx_mature',
  unlock: 'fx_unlock',
} as const;
export type PlotEffectName = keyof typeof EFFECT_NODE;

/** 工具 → 地块上的动画节点 */
const TOOL_EFFECT: Record<ActiveTool, PlotEffectName> = {
  water: 'watering', fert: 'fertilize', harvest: 'harvest', shovel: 'shovel',
};

const DOUBLE_CLICK_MS = 320;

/** 单块土地的全部节点引用（普通类，不是组件：预制体上不需要挂脚本） */
class PlotView {
  readonly id: number;
  /** 所在列 1..6，决定用哪一张土块图 */
  readonly column: number;
  private readonly soil: Sprite | null;
  private readonly cropNode: Node | null;
  private readonly stageSprite: Sprite | null;
  private readonly growthBar: Node | null;
  private readonly growthFill: Sprite | null;
  private readonly growthLabel: Label | null;
  private readonly pestNode: Node | null;
  private readonly pestFx: Node | null;
  private readonly diseaseFx: Node | null;
  private readonly matureNode: Node | null;
  private readonly matureLabel: Label | null;
  private readonly lockNode: Node | null;
  private readonly notifyNode: Node | null;
  private readonly notifyLabel: Label | null;
  private readonly fx = new Map<PlotEffectName, Node | null>();
  /** 一次性动画的截止时间：动画期间不被 render 抢着关掉 */
  private readonly busyUntil = new Map<PlotEffectName, number>();
  private readonly owner: LandView;

  private soilKey = '';
  private cropKey = '';
  private textKey = '';
  private wasMature = false;

  constructor(root: Node, id: number, column: number, owner: LandView) {
    this.id = id;
    this.column = column;
    this.owner = owner;
    this.soil = findSprite(root, 'soil');
    this.cropNode = findChild(root, 'crop');
    this.stageSprite = this.cropNode
      ? (findSprite(this.cropNode, 'stage') || this.cropNode.getComponent(Sprite))
      : findSprite(root, 'stage');
    this.growthBar = findChild(root, 'growth');
    this.growthFill = this.growthBar ? findSprite(this.growthBar, 'fill') : null;
    this.growthLabel = this.growthBar ? findLabel(this.growthBar, 'lb_growth', 'growth') : findLabel(root, 'lb_growth');
    this.pestNode = findChild(root, 'pest');
    this.pestFx = findChild(root, 'fx_pest');
    this.diseaseFx = findChild(root, 'fx_disease');
    this.matureNode = findChild(root, 'mature');
    this.matureLabel = this.matureNode ? findLabel(this.matureNode, 'lb_mature', 'mature') : null;
    this.lockNode = findChild(root, 'lock');
    this.notifyNode = findChild(root, 'notify');
    this.notifyLabel = this.notifyNode ? findLabel(this.notifyNode, 'label', 'lb_notify') : null;
    (Object.keys(EFFECT_NODE) as PlotEffectName[]).forEach(name => {
      this.fx.set(name, findChild(root, EFFECT_NODE[name]));
    });
  }

  /** 用服务端快照刷新显示；只在关键值变化时写节点，避免每帧抖动。 */
  refresh(plot: PlotData, model: FarmModel): void {
    const state = model.landState(plot, this.owner.alertGap);
    const style = soilStyle(state);
    // 把路径一起当 key：服务端 catalog 覆盖表格后能立刻换图
    const soilKey = `${state}|${this.column}|${style.path}`;
    if (soilKey !== this.soilKey) {
      this.soilKey = soilKey;
      applySprite(this.soil, [fillPath(style.path, {
        // {state} / {suffix} = 表里的「后缀」（a/b/c/d），{name} = 状态英文名（normal/dry/…）
        state: style.suffix, suffix: style.suffix, name: state, col: this.column,
      })]);
    }

    const locked = !plot.unlocked;
    const growing = !locked && !!plot.crop && !plot.mature;
    setActive(this.lockNode, locked);
    setActive(this.cropNode, growing);
    setActive(this.growthBar, growing);
    setActive(this.pestNode, !locked && (plot.pest.status === 'ACTIVE' || plot.disease.status === 'ACTIVE'));
    setActive(this.pestFx, !locked && plot.pest.status === 'ACTIVE');
    setActive(this.diseaseFx, !locked && plot.disease.status === 'ACTIVE');
    setActive(this.matureNode, !locked && plot.mature);

    // 可解锁时循环提示，解锁成功后让 fx_unlock 播完再收
    setActive(this.fx.get('unlock') ?? null, locked ? this.owner.canUnlock(plot) : this.isBusy('unlock'));
    if (locked) {
      this.showNotify('');
      return;
    }

    // 作物三阶段：只有一张 stage 图，换 spriteFrame 即可
    const crop = getCropDef(plot.crop);
    const stageIndex = model.growthStage(plot);
    const cropKey = `${plot.crop}|${stageIndex}`;
    if (cropKey !== this.cropKey) {
      this.cropKey = cropKey;
      const icon = crop?.stageIcons[stageIndex];
      if (this.stageSprite && icon) {
        applySprite(this.stageSprite, cropPaths(icon, this.owner.cropPathPattern));
      }
    }

    if (this.growthBar && growing) {
      setBar(this.growthFill, model.stageProgress(plot), this.owner.growthFillMaxWidth);
    }

    // 文字类内容按 key 去重：只在真的变了时才写 Label，避免每帧触发布局重算
    const limit = plot.dailyPlantLimit || LAND.DAILY_PLANT_LIMIT;
    const textKey = `${Math.floor(plot.stageGrowth)}|${plot.mature}|${plot.harvestQuantity}|${plot.dailyPlantCount}`;
    if (textKey !== this.textKey) {
      this.textKey = textKey;
      if (this.growthLabel) {
        this.growthLabel.string = plot.mature ? '可采摘' : `${Math.floor(plot.stageGrowth)}`;
      }
      if (this.matureLabel) {
        this.matureLabel.string = plot.mature ? `${crop?.name ?? '作物'} ×${plot.harvestQuantity}` : '';
      }
      this.showNotify(plot.dailyPlantCount >= limit ? `播种 ${plot.dailyPlantCount}/${limit}` : '');
    }

    // 成熟：隐藏作物、唤醒 mature，并在成熟瞬间播一次动画
    if (plot.mature && !this.wasMature) this.playEffect('mature');
    this.wasMature = plot.mature;
  }

  /** 唤醒预制体里做好的动画：active → play() → 播完 active=false。没有该节点就什么都不做。 */
  playEffect(name: PlotEffectName): void {
    const node = this.fx.get(name);
    if (!node || !node.isValid) return;
    node.active = true;
    const animation = node.getComponent(Animation) || node.getComponentInChildren(Animation);
    const clip = animation?.defaultClip || animation?.clips[0] || null;
    // 没有 Animation 组件时保持常显，由下一次 render 覆盖
    if (!animation || !clip) return;
    if (!animation.defaultClip) animation.defaultClip = clip;
    animation.play();
    const seconds = Math.max(0.05, clip.duration + 0.05);
    this.busyUntil.set(name, Date.now() + seconds * 1000);
    this.owner.scheduleOnce(() => { if (node.isValid) node.active = false; }, seconds);
  }

  private isBusy(name: PlotEffectName): boolean {
    return Date.now() < (this.busyUntil.get(name) ?? 0);
  }

  private showNotify(text: string): void {
    setActive(this.notifyNode, !!text);
    if (text && this.notifyLabel) this.notifyLabel.string = text;
  }
}

@ccclass('LandView')
export class LandView extends Component {
  // ---------------- 场景绑定（可拖，拖了就更省一次查找） ----------------
  @property({ type: Node, tooltip: '工具光标容器，内含 ToolCursor 节点' })
  public toolCursorLayer: Node | null = null;

  @property({ tooltip: '缺水 / 缺肥换图阈值：低于作物需求多少点时换图，0 = 读表 Game_Rule.soilAlertGap（15）' })
  public soilAlertGap = 0;
  @property({ tooltip: '作物阶段图路径模板，占位符 {icon} = {cropId}-01' })
  public cropPathPattern = 'farm/crop/{icon}/spriteFrame';
  @property({ tooltip: '成长进度条 fill 最大宽度（0 = 用 fillRange）' })
  public growthFillMaxWidth = 0;

  farm!: FarmModel;
  player!: PlayerModel;
  inventory!: InventoryModel;

  onToast: (message: string, duration?: number) => void = () => {};
  onAction: GameActionHandler = async () => ({ ok: false, message: '网络服务尚未就绪' });
  now: () => number = () => Date.now();

  /** 由 GameRoot 注入的 Cocos 面板 */
  soilInfoPanel: SoilInfoPanel | null = null;
  waterPrompt: WaterPrompt | null = null;
  fertilizePanel: FertilizePanel | null = null;
  seedPicker: ItemPickerPanel | null = null;
  medicinePicker: ItemPickerPanel | null = null;
  openShop: () => void = () => {};

  private plots: PlotView[] = [];
  private busyPlots = new Set<number>();
  private tool: ToolMode = 'none';
  private pendingWaterTimes = 0;
  private cursorNode: Node | null = null;
  private hasPointerPosition = false;
  private pointerWorldPosition = new Vec3();
  private suppliedCursorFrame: SpriteFrame | null = null;
  private lastClickAt = 0;
  private lastClickPlot = 0;
  private cursorMissingWarned = false;

  onLoad(): void {
    // 点 lands 时不吃冒泡，避免和全屏滚动条抢事件
    this.node.on(Node.EventType.TOUCH_END, event => { event.propagationStopped = true; });
    this.buildPlotMap();
    input.on(Input.EventType.MOUSE_MOVE, this.onPointerMove, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onPointerMove, this);
  }

  onDestroy(): void {
    input.off(Input.EventType.MOUSE_MOVE, this.onPointerMove, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onPointerMove, this);
  }

  update(): void {
    if (!this.farm) return;
    this.farm.updateModel(this.now());
    this.render();
  }

  /** 换图阈值：属性优先，0 = 用表 `Game_Rule.soilAlertGap` */
  get alertGap(): number {
    return this.soilAlertGap > 0 ? this.soilAlertGap : LAND.SOIL_ALERT_GAP;
  }

  // ---------------- 渲染 ----------------

  render(): void {
    if (!this.farm || !this.player) return;
    for (const view of this.plots) {
      const plot = this.farm.getPlot(view.id);
      if (plot) view.refresh(plot, this.farm);
    }
    if (this.soilInfoPanel?.isOpen) {
      const plot = this.farm.getPlot(this.soilInfoPanel.currentPlotId);
      if (plot) this.soilInfoPanel.render(plot, this.farm);
    }
  }

  /** 由 GameRoot（或直接在属性检查器里）指定工具光标层 */
  configureToolCursor(layer: Node | null): void {
    if (!layer) return;
    this.toolCursorLayer = layer;
    this.cursorNode = null;
    this.refreshToolCursor();
  }

  canUnlock(plot: PlotData): boolean {
    const row = unlockRow(plot.id) ?? plot.unlock;
    return !!row && this.player.level >= row.minLevel && this.player.gold >= row.price;
  }

  // ---------------- 工具与光标 ----------------

  setTool(mode: ToolMode, leftBarIcon: SpriteFrame | null = null): void {
    this.tool = mode;
    this.suppliedCursorFrame = mode === 'none' ? null : leftBarIcon;
    if (mode === 'none') this.pendingWaterTimes = 0;
    this.refreshToolCursor();
  }

  get currentTool(): ToolMode { return this.tool; }

  private onPointerMove(event: EventMouse | EventTouch): void {
    const point = event.getUILocation();
    this.hasPointerPosition = true;
    this.pointerWorldPosition.set(point.x, point.y, 0);
    if (this.tool === 'none') return;
    const cursor = this.ensureCursorNode();
    if (!cursor) return;
    this.positionCursor(cursor);
    setActive(cursor, true);
  }

  private refreshToolCursor(): void {
    const cursor = this.ensureCursorNode();
    if (!cursor) return;
    setActive(cursor, this.tool !== 'none' && this.hasPointerPosition);
    if (this.tool === 'none') return;
    if (this.hasPointerPosition) this.positionCursor(cursor);
    const sprite = cursor.getComponent(Sprite);
    if (sprite && this.suppliedCursorFrame) sprite.spriteFrame = this.suppliedCursorFrame;
  }

  private positionCursor(cursor: Node): void {
    const transform = cursor.parent?.getComponent(UITransform);
    if (transform) cursor.setPosition(transform.convertToNodeSpaceAR(this.pointerWorldPosition));
  }

  /** 光标节点必须在场景里摆好；缺失时只提示一次，不在运行时造节点。 */
  private ensureCursorNode(): Node | null {
    if (this.cursorNode?.isValid) return this.cursorNode;
    const layer = this.toolCursorLayer?.isValid
      ? this.toolCursorLayer
      : findChild(this.node.parent || this.node, 'ToolCursorLayer');
    const cursor = layer ? findChild(layer, 'ToolCursor') : null;
    if (!cursor) {
      if (!this.cursorMissingWarned) {
        this.cursorMissingWarned = true;
        console.warn('[LandView] 场景缺少 ToolCursorLayer/ToolCursor 节点，工具光标不可见');
      }
      return null;
    }
    this.cursorNode = cursor;
    return cursor;
  }

  private hideCursor(): void {
    if (this.cursorNode?.isValid) this.cursorNode.active = false;
    this.suppliedCursorFrame = null;
  }

  // ---------------- 地块交互 ----------------

  private onPlotTouch(view: PlotView): void {
    const plot = this.farm.getPlot(view.id);
    if (!plot) return;

    const nowMs = this.now();
    const isDoubleClick = this.lastClickPlot === view.id && nowMs - this.lastClickAt <= DOUBLE_CLICK_MS;
    this.lastClickAt = nowMs;
    this.lastClickPlot = view.id;
    if (isDoubleClick) {
      this.lastClickAt = 0;
      this.openSoilInfo(plot);
      return;
    }
    if (this.busyPlots.has(view.id)) {
      this.onToast('操作正在同步，请稍候');
      return;
    }
    if (this.tool !== 'none') {
      this.applyTool(view, plot);
      return;
    }
    if (!plot.unlocked) { void this.tryUnlock(plot); return; }
    if (plot.mature) { void this.submit(view.id, 'harvest', { plotId: view.id }, '', 'harvest'); return; }
    if (plot.crop) { this.openSoilInfo(plot); return; }
    this.openSeedPicker(view.id, plot);
  }

  /** 工具模式下点地块：浇水/施肥走选择框，铲子与采摘直接生效 */
  private applyTool(view: PlotView, plot: PlotData): void {
    if (!plot.unlocked) { this.onToast('这块土地还没有解锁'); return; }
    switch (this.tool) {
      case 'water':
        if (this.pendingWaterTimes > 0) {
          const times = this.pendingWaterTimes;
          this.pendingWaterTimes = 0;
          void this.submit(view.id, 'water', { plotId: view.id, times }, `已浇水 ${times} 次`, 'watering');
          return;
        }
        this.openWaterPrompt();
        return;
      case 'fert':
        this.openFertilizePanel(view.id);
        return;
      case 'harvest':
        if (!plot.mature) { this.onToast('这块地还没有可采摘的作物'); return; }
        void this.submit(view.id, 'harvest', { plotId: view.id }, '', 'harvest');
        return;
      case 'shovel':
        if (!plot.crop) { this.onToast('这块地没有需要铲除的作物'); return; }
        void this.submit(view.id, 'shovel', { plotId: view.id }, '已铲除作物', 'shovel');
        return;
      default:
        return;
    }
  }

  // ---------------- 各操作 ----------------

  private openWaterPrompt(): void {
    if (!this.waterPrompt) { this.onToast('场景缺少 WaterPrompt 面板'); return; }
    this.waterPrompt.onConfirm = times => {
      this.pendingWaterTimes = times;
      this.refreshToolCursor();
      this.onToast(`已选择浇水 ${times} 次，请点土地`);
    };
    this.waterPrompt.open();
  }

  private openFertilizePanel(plotId: number): void {
    if (!this.fertilizePanel) { this.onToast('场景缺少 FertilizePanel 面板'); return; }
    this.fertilizePanel.inventory = this.inventory;
    this.fertilizePanel.onToast = (message, duration) => this.onToast(message, duration);
    this.fertilizePanel.onOpenShop = () => this.openShop();
    this.fertilizePanel.onConfirm = (items, appendTime) => {
      void this.submit(plotId, 'fertilize', { plotId, items, appendTime }, '施肥完成', 'fertilize');
    };
    this.fertilizePanel.open(plotId);
  }

  private openSeedPicker(plotId: number, plot: PlotData): void {
    const limit = plot.dailyPlantLimit || LAND.DAILY_PLANT_LIMIT;
    if (plot.dailyPlantCount >= limit) {
      this.onToast(`今日播种次数已用完（${limit}/${limit}），明天再来`);
      return;
    }
    if (!this.seedPicker) { this.onToast('场景缺少 SeedPanel 面板'); return; }
    const rows: PickerRow[] = [];
    for (const stack of this.inventory.query({ category: 'seed' })) {
      const crop = getCropDef(stack.id.replace(/^seed_/, ''));
      if (crop) rows.push({ key: crop.id, name: crop.name, icon: stack.icon, sub: `×${stack.count}` });
    }
    if (rows.length === 0) {
      this.onToast('背包里没有种子，请先去商店购买');
      return;
    }
    this.seedPicker.open('选择种子', `还能播种 ${limit - plot.dailyPlantCount} 次，选中即播种`, rows, cropId => {
      void this.submit(plotId, 'plant', { plotId, cropId }, '播种成功，记得浇水施肥');
    });
  }

  /** 由 SoilInfoPanel 的「处理病虫害」按钮触发 */
  openMedicinePicker(plotId: number): void {
    if (!this.medicinePicker) { this.onToast('场景缺少 MedicinePanel 面板'); return; }
    const rows: PickerRow[] = [];
    for (const stack of this.inventory.query({ category: 'medicine' })) {
      const definition = getMedicineDef(medicineIdOf(stack.id));
      if (!definition) continue;
      rows.push({
        key: stack.id,
        name: definition.name,
        icon: stack.icon,
        sub: `${medicineTargetLabel(definition.target)} -${definition.power}${definition.perMinute ? '/分钟' : ''} ×${stack.count}`,
      });
    }
    if (rows.length === 0) {
      this.onToast('背包里没有药品，请先去商店购买');
      return;
    }
    this.medicinePicker.open('处理病虫害', '选择要使用的药品', rows, itemId => {
      void this.submit(plotId, 'apply_medicine', { plotId, itemId }, '已使用药品');
    });
  }

  private async tryUnlock(plot: PlotData): Promise<void> {
    const row = unlockRow(plot.id) ?? plot.unlock;
    if (!row) return;
    if (this.player.level < row.minLevel) {
      this.onToast(`需要 ${row.minLevel} 级才能解锁这块土地`);
      return;
    }
    if (this.player.gold < row.price) {
      this.onToast(`解锁需要 ${row.price} 金币`);
      return;
    }
    await this.submit(plot.id, 'unlock_land', { plotId: plot.id }, `已解锁第 ${plot.id} 块土地`, 'unlock');
  }

  private openSoilInfo(plot: PlotData): void {
    if (!this.soilInfoPanel) { this.onToast('场景缺少 SoilInfoPanel 面板'); return; }
    this.soilInfoPanel.onRequestMedicine = id => this.openMedicinePicker(id);
    this.soilInfoPanel.open(plot, this.farm);
  }

  /** 统一走服务端命令：成功后唤醒对应动画、取消工具、弹提示 */
  private async submit(
    plotId: number,
    type: GameCommandType,
    payload: Record<string, unknown>,
    successMessage: string,
    effect?: PlotEffectName,
  ): Promise<void> {
    if (this.busyPlots.has(plotId)) { this.onToast('操作正在同步，请稍候'); return; }
    this.busyPlots.add(plotId);
    try {
      const result = await this.onAction(type, payload);
      if (!result.ok) {
        this.onToast(result.message, 2);
        return;
      }
      if (effect) this.plots.find(view => view.id === plotId)?.playEffect(effect);
      this.pendingWaterTimes = 0;
      this.setTool('none');
      this.hideCursor();
      this.onToast(successMessage || result.message, type === 'harvest' ? 2.2 : 1.2);
    } finally {
      this.busyPlots.delete(plotId);
    }
  }

  // ---------------- 场景装配 ----------------

  /** 按 `lands_1..lands_N` + 行内 `1..6` 的顺序装配预制体实例 */
  private buildPlotMap(): void {
    this.plots = [];
    const perRow = LAND.PLOTS_PER_ROW;
    for (let row = 1; row <= LAND.ROWS; row++) {
      const rowNode = findChild(this.node, `lands_${row}`);
      if (!rowNode) continue;
      for (let column = 1; column <= perRow; column++) {
        const id = (row - 1) * perRow + column;
        const plotNode = findChild(rowNode, String(column), `land_${column}`, `land_${id}`);
        if (!plotNode) continue;
        const view = new PlotView(plotNode, id, column, this);
        plotNode.off(Node.EventType.TOUCH_END);
        plotNode.on(Node.EventType.TOUCH_END, event => {
          event.propagationStopped = true;
          this.onPlotTouch(view);
        });
        this.plots.push(view);
      }
    }
    if (this.plots.length === 0) {
      console.warn(`[LandView] ${this.node.name} 下没有找到 lands_1/1 … 结构的土地节点`);
    }
  }
}
