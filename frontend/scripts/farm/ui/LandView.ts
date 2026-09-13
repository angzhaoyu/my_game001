import {
  Animation, EventMouse, EventTouch, Input, input, Label,
  Node, Sprite, SpriteFrame, UITransform, Vec3,
} from 'cc';
import { LAND, unlockRow } from '../config/LandConfig';
import { getCropDef } from '../config/CropConfig';
import { getMedicineDef } from '../config/ItemConfig';
import { FarmModel } from '../data/FarmModel';
import { InventoryModel } from '../data/InventoryModel';
import { PlayerModel } from '../data/PlayerModel';
import type { PlotData } from '../data/PlotData';
import type { GameActionHandler } from '../GameAction';
import type { GameCommandType } from '../../core/network/Contracts';
import { applySprite, fillPath, findNode, setActive } from './Ui';
import type { SoilInfoPanel } from './SoilInfoPanel';
import type { WaterPrompt } from './WaterPrompt';
import type { FertilizePanel } from './FertilizePanel';
import type { ItemPickerPanel, PickerRow } from './ItemPickerPanel';

export type ToolMode = 'none' | 'water' | 'fert' | 'harvest' | 'shovel';
type ActiveTool = Exclude<ToolMode, 'none'>;

const SOIL_SUFFIX = { normal: 'a', locked: 'b', lowfert: 'c', dry: 'd' };
const EFFECT_NODE = { water: 'fx_watering', fert: 'fx_fertilize', harvest: 'fx_harvest', shovel: 'fx_shovel', unlock: 'fx_unlock' };
const DOUBLE_CLICK_MS = 320;

interface PlotView {
  id: number;
  node: Node;
  nodes: Record<string, Node | null>;
  soil: Sprite | null;
  stage: Sprite | null;
  fill: Sprite | null;
  growthLabel: Label | null;
  soilKey: string;
  cropKey: string;
  onTouch: (event: EventTouch) => void;
}

/** GameRoot 持有的普通控制器；lands 与所有地块均不挂脚本。 */
export class LandView {
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

  toolCursorLayer: Node | null = null;
  soilPathPattern = 'farm/lands_{state}1/locked_{col}{state}/spriteFrame';
  fertilityAlertGap = 0;
  moistureAlertGap = 0;
  growthFillMaxWidth = 0;
  private disposed = false;
  private effects = new Map<Node, number>();

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

  constructor(private node: Node) {
    this.buildPlotMap();
    input.on(Input.EventType.MOUSE_MOVE, this.onPointerMove, this);
    input.on(Input.EventType.TOUCH_START, this.onPointerMove, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onPointerMove, this);
  }

  destroy() {
    this.disposed = true;
    for (const plot of this.plots) plot.node.off(Node.EventType.TOUCH_END, plot.onTouch);
    this.effects.forEach((_, node) => setActive(node, false));
    this.effects.clear();
    this.hideCursor();
    input.off(Input.EventType.MOUSE_MOVE, this.onPointerMove, this);
    input.off(Input.EventType.TOUCH_START, this.onPointerMove, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onPointerMove, this);
  }

  update() {
    if (!this.farm) return;
    this.farm.updateModel(this.now());
    this.render();
    for (const [node, until] of this.effects) {
      if (!node.isValid || this.now() >= until) {
        setActive(node, false);
        this.effects.delete(node);
      }
    }
  }

  configureToolLayers(cursorLayer: Node | null): void {
    this.toolCursorLayer = cursorLayer;
    this.refreshToolCursor();
  }

  setTool(mode: ToolMode, leftBarIcon: SpriteFrame | null = null): void {
    this.tool = mode;
    this.suppliedCursorFrame = mode === 'none' ? null : leftBarIcon;
    if (mode !== 'water') { this.pendingWaterTimes = 0; this.waterPrompt?.close(); }
    if (mode === 'water' && !this.pendingWaterTimes) this.openWaterPrompt();
    this.refreshToolCursor();
  }

  get currentTool(): ToolMode { return this.tool; }

  render(): void {
    if (!this.farm || !this.player) return;
    for (const view of this.plots) {
      const plot = this.farm.getPlot(view.id);
      if (!plot) continue;
      this.renderPlot(view, plot);
    }
    if (this.soilInfoPanel?.isOpen) {
      const plot = this.farm.getPlot(this.soilInfoPanel.currentPlotId);
      if (plot) this.soilInfoPanel.render(plot, this.farm,
        this.farm.landState(plot, this.fertilityAlertGap, this.moistureAlertGap));
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
    if (this.tool === 'none' || (this.tool === 'water' && !this.pendingWaterTimes)) return;
    const cursor = this.ensureCursorNode();
    if (!cursor) return;
    this.positionCursor(cursor);
    setActive(cursor, true);
  }

  private positionCursor(cursor: Node): void {
    const layer = cursor.parent;
    const transform = layer?.getComponent(UITransform);
    if (transform) cursor.setPosition(transform.convertToNodeSpaceAR(this.pointerWorldPosition));
  }

  private refreshToolCursor(): void {
    const cursor = this.ensureCursorNode();
    if (!cursor) return;
    setActive(cursor, this.tool !== 'none' && this.hasPointerPosition && (this.tool !== 'water' || this.pendingWaterTimes > 0));
    if (this.tool === 'none') return;
    if (this.hasPointerPosition) this.positionCursor(cursor);
    const sprite = cursor.getComponent(Sprite);
    if (!sprite) return;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    if (this.suppliedCursorFrame) sprite.spriteFrame = this.suppliedCursorFrame;
  }

  private ensureCursorNode(): Node | null {
    const layer = this.ensureLayer('ToolCursorLayer', this.toolCursorLayer);
    if (!layer) return null;
    this.toolCursorLayer = layer;
    if (this.cursorNode?.isValid) return this.cursorNode;

    this.cursorNode = layer.getChildByName('ToolCursor');
    if (this.cursorNode) this.cursorNode.active = false;
    return this.cursorNode;
  }

  private ensureLayer(name: string, configured: Node | null): Node | null {
    return configured?.isValid ? configured : this.node.parent?.getChildByName(name) ?? null;
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
    if (isDoubleClick && this.tool === 'none') {
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
      this.playEffectOnPlot(plot.id, 'unlock');
      this.onToast(result.message);
    }
  }

  private openWaterPrompt(): void {
    if (!this.waterPrompt) { this.onToast('场景缺少 WaterPrompt 面板'); return; }
    this.waterPrompt.onConfirm = (times) => {
      if (this.disposed || this.tool !== 'water') return;
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
    this.soilInfoPanel.render(plot, this.farm,
      this.farm.landState(plot, this.fertilityAlertGap, this.moistureAlertGap));
  }

  private async perform(id: number, type: GameCommandType, payload: Record<string, unknown>) {
    if (this.busyPlots.has(id)) return { ok: false, message: '操作正在同步' };
    this.busyPlots.add(id);
    try {
      const result = await this.onAction(type, payload);
      if (this.disposed) return { ok: false, message: '场景已关闭' };
      if (!result.ok) this.onToast(result.message, 2);
      return result;
    } finally {
      this.busyPlots.delete(id);
    }
  }

  // ---------- 动画 ----------

  private playEffectOnPlot(plotId: number, tool: ActiveTool | 'unlock'): void {
    const node = this.plots.find(view => view.id === plotId)?.nodes[EFFECT_NODE[tool]];
    if (!node) return;
    // fx 根节点只切显隐；子 Sprite 的动画由预制体自己的激活逻辑播放。
    setActive(node, false);
    setActive(node, true);
    const animation = node.getComponent(Animation) || node.getComponentInChildren(Animation);
    const clip = animation?.defaultClip || animation?.clips[0];
    this.effects.set(node, this.now() + ((clip?.duration ?? 1) + 0.05) * 1000);
  }

  private renderPlot(view: PlotView, plot: PlotData): void {
    const state = this.farm.landState(plot, this.fertilityAlertGap, this.moistureAlertGap);
    const col = (plot.id - 1) % LAND.PLOTS_PER_ROW + 1;
    const path = fillPath(this.soilPathPattern, { state: SOIL_SUFFIX[state], col });
    if (path !== view.soilKey) {
      view.soilKey = path;
      applySprite(view.soil, [path]);
    }
    const growing = plot.unlocked && !!plot.crop && !plot.mature;
    for (const name of ['crop', 'growth']) setActive(view.nodes[name], growing);
    setActive(view.nodes.mature, plot.unlocked && plot.mature);
    setActive(view.nodes.pest, plot.unlocked && (plot.pest.status === 'ACTIVE' || plot.disease.status === 'ACTIVE'));
    setActive(view.nodes.fx_pest, plot.unlocked && plot.pest.status === 'ACTIVE');
    setActive(view.nodes.fx_disease, plot.unlocked && plot.disease.status === 'ACTIVE');
    const crop = getCropDef(plot.crop);
    const stage = this.farm.growthStage(plot);
    const cropKey = `${plot.crop}|${stage}|${crop?.stageIcons[stage] ?? ''}`;
    if (cropKey !== view.cropKey) {
      view.cropKey = cropKey;
      if (crop && stage >= 0) applySprite(view.stage, [
        `farm/crop/${crop.stageIcons[stage]}/spriteFrame`,
        `textures/items/${crop.stageIcons[stage]}/spriteFrame`,
      ]);
    }
    if (view.fill) {
      const ratio = this.farm.stageProgress(plot);
      if (this.growthFillMaxWidth > 0) {
        const transform = view.fill.getComponent(UITransform);
        if (transform) transform.setContentSize(this.growthFillMaxWidth * ratio, transform.height);
      } else view.fill.fillRange = ratio;
    }
    if (view.growthLabel) view.growthLabel.string = plot.mature ? '可采摘' : `${Math.floor(plot.stageGrowth)}`;
    const limit = plot.dailyPlantLimit || LAND.DAILY_PLANT_LIMIT;
    const label = view.nodes.plantLimit?.getComponent(Label);
    if (label) label.string = `今日播种 ${plot.dailyPlantCount}/${limit}`;
    const lockPrice = view.nodes.lockPrice?.getComponent(Label);
    if (lockPrice) lockPrice.string = plot.unlocked ? '' : `${plot.unlock?.price ?? 0} 金币 / ${plot.unlock?.minLevel ?? 1} 级`;
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

        const nodes: Record<string, Node | null> = {};
        for (const name of ['soil', 'crop', 'stage', 'growth', 'lb_growth', 'ToolEffect', 'pest',
          'fx_pest', 'fx_disease', 'mature', 'lockPrice', 'plantLimit', ...Object.values(EFFECT_NODE)]) {
          nodes[name] = findNode(plotNode, name);
        }
        setActive(nodes.ToolEffect, true);
        for (const name of Object.values(EFFECT_NODE)) setActive(nodes[name], false);
        const view: PlotView = {
          id, node: plotNode, nodes, soilKey: '', cropKey: '',
          soil: nodes.soil?.getComponent(Sprite) ?? null,
          stage: nodes.stage?.getComponent(Sprite) ?? null,
          fill: nodes.growth?.getChildByName('fill')?.getComponent(Sprite) ?? null,
          growthLabel: nodes.lb_growth?.getComponent(Label) ?? null,
          onTouch: event => { event.propagationStopped = true; this.onPlotTouch(view); },
        };
        plotNode.on(Node.EventType.TOUCH_END, view.onTouch);
        this.plots.push(view);
      }
    }
  }
}
