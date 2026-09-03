/**
 * 农场土地视图：装配土地预制体、处理四种左栏工具，并播放场景中做好的动画。
 *
 * 约定（与需求一致）：
 *  - 土块、作物三阶段图、进度条、缺水/缺肥/病害/成熟动画全部是 Cocos 里的节点，
 *    代码只切换 active / 播放 Animation，不在运行时创建 UI 节点；
 *  - 工具光标使用场景里的 `ToolCursorLayer/ToolCursor`（缺失时才兜底创建一个）；
 *  - 浇水：先弹次数选择框 → 光标跟随 → 碰到土块后光标消失并唤醒土块的浇水动画；
 *  - 铲子 / 采摘：与浇水相同，但没有选择框；施肥统一走 FertilizePanel。
 */
import {
  _decorator, Animation, Component, EventMouse, EventTouch, Input, input, instantiate, Layers,
  Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3,
} from 'cc';
import { LAND, unlockRow } from '../config/LandConfig';
import { getCropDef } from '../config/CropConfig';
import { getMedicineDef } from '../config/MedicineConfig';
import { FarmModel } from '../data/FarmModel';
import { InventoryModel } from '../data/InventoryModel';
import { PlayerModel } from '../data/PlayerModel';
import type { PlotData } from '../data/PlotData';
import type { GameActionHandler } from '../GameAction';
import type { GameCommandType } from '../../core/network/Contracts';
import { LandPlot } from './LandPlot';
import type { SoilInfoPanel } from './SoilInfoPanel';
import type { WaterPrompt } from './WaterPrompt';
import type { FertilizePanel } from './FertilizePanel';
import type { ItemPickerPanel, PickerRow } from './ItemPickerPanel';

const { ccclass } = _decorator;

export type ToolMode = 'none' | 'water' | 'fert' | 'harvest' | 'shovel';
type ActiveTool = Exclude<ToolMode, 'none'>;

const CURSOR_OPACITY = Math.round(255 * 0.7);
/** 兜底：场景里没有对应动画节点时，从 ToolEffectLayer 模板实例化 */
const EFFECT_TEMPLATE: Record<ActiveTool, string> = {
  water: 'WaterEffectTemplate',
  fert: 'FertilizerEffectTemplate',
  harvest: 'HarvestEffectTemplate',
  shovel: 'ShovelEffectTemplate',
};
const DOUBLE_CLICK_MS = 320;

interface PlotView {
  id: number;
  node: Node;
  plot: LandPlot;
}

@ccclass('LandView')
export class LandView extends Component {
  farm!: FarmModel;
  player!: PlayerModel;
  inventory!: InventoryModel;

  onToast: (msg: string, duration?: number) => void = () => {};
  onAction: GameActionHandler = async () => ({ ok: false, message: '网络服务尚未就绪' });
  now: () => number = () => Date.now();

  /** 由 GameRoot 注入的 Cocos 面板 */
  soilInfoPanel: SoilInfoPanel | null = null;
  waterPrompt: WaterPrompt | null = null;
  fertilizePanel: FertilizePanel | null = null;
  seedPicker: ItemPickerPanel | null = null;
  medicinePicker: ItemPickerPanel | null = null;
  openShop: () => void = () => {};
  isShopOpen: () => boolean = () => false;

  toolCursorLayer: Node | null = null;
  toolEffectLayer: Node | null = null;

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

  onLoad() {
    this.node.on(Node.EventType.TOUCH_END, (event) => { event.propagationStopped = true; });
    this.buildPlotMap();
    input.on(Input.EventType.MOUSE_MOVE, this.onPointerMove, this);
    input.on(Input.EventType.TOUCH_START, this.onPointerMove, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onPointerMove, this);
  }

  onDestroy() {
    input.off(Input.EventType.MOUSE_MOVE, this.onPointerMove, this);
    input.off(Input.EventType.TOUCH_START, this.onPointerMove, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onPointerMove, this);
  }

  update() {
    if (!this.farm) return;
    this.farm.updateModel(this.now());
    this.render();
  }

  configureToolLayers(cursorLayer: Node | null, effectLayer: Node | null): void {
    this.toolCursorLayer = cursorLayer;
    this.toolEffectLayer = effectLayer;
    this.refreshToolCursor();
  }

  setTool(mode: ToolMode, leftBarIcon: SpriteFrame | null = null): void {
    this.tool = mode;
    this.suppliedCursorFrame = mode === 'none' ? null : leftBarIcon;
    if (mode === 'none') this.pendingWaterTimes = 0;
    this.refreshToolCursor();
  }

  get currentTool(): ToolMode { return this.tool; }

  render(): void {
    if (!this.farm || !this.player) return;
    for (const view of this.plots) {
      const plot = this.farm.getPlot(view.id);
      if (!plot) continue;
      view.plot.render(plot, this.farm);
    }
    if (this.soilInfoPanel?.isOpen) {
      const plot = this.farm.getPlot(this.soilInfoPanel.currentPlotId);
      if (plot) this.soilInfoPanel.render(plot, this.farm);
    }
  }

  // ---------------- 工具光标 ----------------

  private onPointerMove(event: EventMouse | EventTouch): void {
    const point = event.getUILocation();
    this.moveToolCursor(point.x, point.y);
  }

  private moveToolCursor(x: number, y: number): void {
    this.hasPointerPosition = true;
    this.pointerWorldPosition.set(x, y, 0);
    if (this.tool === 'none') return;
    const cursor = this.ensureCursorNode();
    if (!cursor) return;
    this.positionCursor(cursor);
    setActive(cursor, true);
  }

  private positionCursor(cursor: Node): void {
    const layer = cursor.parent;
    const transform = layer?.getComponent(UITransform) || layer?.addComponent(UITransform);
    if (transform) cursor.setPosition(transform.convertToNodeSpaceAR(this.pointerWorldPosition));
  }

  private refreshToolCursor(): void {
    const cursor = this.ensureCursorNode();
    if (!cursor) return;
    setActive(cursor, this.tool !== 'none' && this.hasPointerPosition);
    if (this.tool === 'none') return;
    if (this.hasPointerPosition) this.positionCursor(cursor);
    const sprite = cursor.getComponent(Sprite) || cursor.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    if (this.suppliedCursorFrame) sprite.spriteFrame = this.suppliedCursorFrame;
  }

  private ensureCursorNode(): Node | null {
    const layer = this.ensureLayer('ToolCursorLayer', this.toolCursorLayer);
    if (!layer) return null;
    this.toolCursorLayer = layer;
    if (this.cursorNode?.isValid) return this.cursorNode;

    // 优先使用场景里摆好的 ToolCursor 节点
    let cursor = layer.getChildByName('ToolCursor');
    if (!cursor) {
      cursor = new Node('ToolCursor');
      cursor.layer = Layers.Enum.UI_2D;
      cursor.addComponent(UITransform).setContentSize(72, 72);
      cursor.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;
      cursor.addComponent(UIOpacity).opacity = CURSOR_OPACITY;
      layer.addChild(cursor);
    }
    cursor.active = false;
    this.cursorNode = cursor;
    return cursor;
  }

  private ensureLayer(name: string, configured: Node | null): Node | null {
    if (configured?.isValid) return configured;
    const parent = this.node.parent;
    if (!parent) return null;
    let layer = parent.getChildByName(name);
    if (!layer) {
      layer = new Node(name);
      layer.layer = Layers.Enum.UI_2D;
      layer.addComponent(UITransform);
      parent.addChild(layer);
    }
    return layer;
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
    if (plot.mature) { void this.tryHarvest(view.id); return; }
    if (plot.crop) { this.openSoilInfo(plot); return; }
    this.openSeedPicker(view.id);
  }

  private applyTool(view: PlotView, plot: PlotData): void {
    if (!plot.unlocked) { this.onToast('这块土地还没有解锁'); return; }
    switch (this.tool) {
      case 'water':
        if (this.pendingWaterTimes > 0) {
          const times = this.pendingWaterTimes;
          void this.doWater(view.id, times);
          return;
        }
        this.openWaterPrompt();
        return;
      case 'fert':
        this.openFertilizePanel(view.id);
        return;
      case 'harvest':
        if (!plot.mature) { this.onToast('这块地还没有可采摘的作物'); return; }
        void this.tryHarvest(view.id);
        return;
      case 'shovel':
        if (!plot.crop) { this.onToast('这块地没有需要铲除的作物'); return; }
        void this.tryShovel(view.id);
        return;
      default:
        return;
    }
  }

  // ---------- 各操作 ----------

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
    const result = await this.perform(plot.id, 'unlock_land', { plotId: plot.id });
    if (result.ok) {
      this.plots.find(view => view.id === plot.id)?.plot.playEffect('unlock');
      this.onToast(result.message);
    }
  }

  private openWaterPrompt(): void {
    if (!this.waterPrompt) { this.onToast('场景缺少 WaterPrompt 面板'); return; }
    this.waterPrompt.onConfirm = (times) => {
      this.pendingWaterTimes = times;
      this.refreshToolCursor();
      this.onToast('请选择要浇水的土地');
    };
    this.waterPrompt.open();
  }

  private async doWater(id: number, times: number): Promise<void> {
    const result = await this.perform(id, 'water', { plotId: id, times });
    if (result.ok) {
      this.pendingWaterTimes = 0;
      this.playEffectOnPlot(id, 'water');
      this.setTool('none');
      this.hideCursor();
      this.onToast(result.message);
    }
  }

  private openFertilizePanel(id: number): void {
    if (!this.fertilizePanel) { this.onToast('场景缺少 FertilizePanel 面板'); return; }
    this.fertilizePanel.inventory = this.inventory;
    this.fertilizePanel.onToast = (message, duration) => this.onToast(message, duration);
    this.fertilizePanel.onOpenShop = () => this.openShop();
    this.fertilizePanel.onConfirm = (items, appendTime) => {
      void this.doFertilize(id, items, appendTime);
    };
    this.fertilizePanel.open(id);
  }

  private async doFertilize(
    id: number,
    items: { itemId: string; count: number }[],
    appendTime: boolean,
  ): Promise<void> {
    const result = await this.perform(id, 'fertilize', { plotId: id, items, appendTime });
    if (result.ok) {
      this.playEffectOnPlot(id, 'fert');
      this.setTool('none');
      this.hideCursor();
      this.onToast(result.message);
    }
  }

  private async tryHarvest(id: number): Promise<void> {
    const result = await this.perform(id, 'harvest', { plotId: id });
    if (result.ok) {
      this.playEffectOnPlot(id, 'harvest');
      this.setTool('none');
      this.hideCursor();
      this.onToast(result.message, 2.2);
    }
  }

  private async tryShovel(id: number): Promise<void> {
    const result = await this.perform(id, 'shovel', { plotId: id });
    if (result.ok) {
      this.playEffectOnPlot(id, 'shovel');
      this.setTool('none');
      this.hideCursor();
      this.onToast(result.message);
    }
  }

  private openSeedPicker(id: number): void {
    if (!this.seedPicker) { this.onToast('场景缺少 SeedPanel 面板'); return; }
    const rows: PickerRow[] = [];
    for (const stack of this.inventory.query({ category: 'seed' })) {
      const cropId = stack.id.replace(/^seed_/, '');
      const crop = getCropDef(cropId);
      if (crop) rows.push({ key: crop.id, name: crop.name, icon: stack.icon, sub: `×${stack.count}` });
    }
    if (rows.length === 0) {
      this.onToast('背包里没有种子，请先去商店购买');
      return;
    }
    this.seedPicker.open('选择种子', '点击种子即播种', rows, (cropId) => { void this.doPlant(id, cropId); });
  }

  private async doPlant(id: number, cropId: string): Promise<void> {
    const result = await this.perform(id, 'plant', { plotId: id, cropId });
    if (result.ok) this.onToast(`${result.message}，记得浇水施肥`);
  }

  /** 由 SoilInfoPanel 的「处理病虫害」按钮触发 */
  openMedicinePicker(plotId: number): void {
    if (!this.medicinePicker) { this.onToast('场景缺少 MedicinePanel 面板'); return; }
    const rows: PickerRow[] = [];
    for (const stack of this.inventory.query({ category: 'medicine' })) {
      const definition = getMedicineDef(stack.id.replace(/^med_/, ''));
      if (!definition) continue;
      const target = definition.target === 'pest' ? '害虫' : '病害';
      rows.push({
        key: stack.id,
        name: definition.name,
        icon: stack.icon,
        sub: `${target} -${definition.power}${definition.perMinute ? '/分钟' : ''} ×${stack.count}`,
      });
    }
    if (rows.length === 0) {
      this.onToast('背包里没有药品，请先去商店购买');
      return;
    }
    this.medicinePicker.open('处理病虫害', '选择要使用的药品', rows, (itemId) => {
      void this.doMedicine(plotId, itemId);
    });
  }

  private async doMedicine(plotId: number, itemId: string): Promise<void> {
    const result = await this.perform(plotId, 'apply_medicine', { plotId, itemId });
    if (result.ok) this.onToast(result.message);
  }

  private openSoilInfo(plot: PlotData): void {
    if (!this.soilInfoPanel) { this.onToast('场景缺少 SoilInfoPanel 面板'); return; }
    this.soilInfoPanel.onRequestMedicine = (id) => this.openMedicinePicker(id);
    this.soilInfoPanel.open(plot, this.farm);
  }

  private async perform(id: number, type: GameCommandType, payload: Record<string, unknown>) {
    if (this.busyPlots.has(id)) return { ok: false, message: '操作正在同步' };
    this.busyPlots.add(id);
    try {
      const result = await this.onAction(type, payload);
      if (!result.ok) this.onToast(result.message, 2);
      return result;
    } finally {
      this.busyPlots.delete(id);
    }
  }

  // ---------- 动画 ----------

  private playEffectOnPlot(plotId: number, tool: ActiveTool): void {
    const view = this.plots.find(item => item.id === plotId);
    if (!view) return;
    const names: Record<ActiveTool, Parameters<LandPlot['playEffect']>[0]> = {
      water: 'watering', fert: 'fertilize', harvest: 'harvest', shovel: 'shovel',
    };
    if (view.plot.playEffect(names[tool])) return;
    this.playTemplateEffect(tool, view);
  }

  /** 兜底：地块预制体里没有对应动画节点时使用 ToolEffectLayer 的模板 */
  private playTemplateEffect(tool: ActiveTool, view: PlotView): void {
    const layer = this.ensureLayer('ToolEffectLayer', this.toolEffectLayer);
    if (!layer) return;
    this.toolEffectLayer = layer;
    const template = layer.getChildByName(EFFECT_TEMPLATE[tool]);
    if (!template) return;
    const effect = instantiate(template);
    effect.name = `${EFFECT_TEMPLATE[tool]}_Playing`;
    layer.addChild(effect);
    effect.setWorldPosition(view.node.worldPosition);
    effect.active = true;
    const animation = effect.getComponent(Animation) || effect.getComponentInChildren(Animation);
    const clip = animation?.defaultClip || animation?.clips[0] || null;
    if (!animation || !clip) { effect.destroy(); return; }
    if (!animation.defaultClip) animation.defaultClip = clip;
    animation.play();
    this.scheduleOnce(() => { if (effect.isValid) effect.destroy(); },
      Math.max(0.05, clip.duration + 0.05));
  }

  // ---------- 场景装配 ----------

  private buildPlotMap(): void {
    this.plots = [];
    for (let row = 1; row <= LAND.ROWS; row++) {
      const rowNode = this.node.getChildByName(`lands_${row}`);
      if (!rowNode) continue;
      for (let col = 1; col <= LAND.PLOTS_PER_ROW; col++) {
        const id = (row - 1) * LAND.PLOTS_PER_ROW + col;
        const plotNode = rowNode.getChildByName(String(col))
          || rowNode.getChildByName(`land_${col}`)
          || rowNode.getChildByName(`land_${id}`);
        if (!plotNode) continue;

        const component = plotNode.getComponent(LandPlot) || plotNode.addComponent(LandPlot);
        component.plotId = id;
        component.column = col;

        const plotId = id;
        const view: PlotView = { id, node: plotNode, plot: component };
        plotNode.off(Node.EventType.TOUCH_END);
        plotNode.on(Node.EventType.TOUCH_END, (event) => {
          event.propagationStopped = true;
          const target = this.plots.find(item => item.id === plotId);
          if (target) this.onPlotTouch(target);
        });
        this.plots.push(view);
      }
    }
  }
}

function setActive(node: Node, active: boolean): void {
  if (node.isValid && node.active !== active) node.active = active;
}
