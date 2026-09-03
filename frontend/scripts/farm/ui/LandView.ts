/**
 * 农场土地视图：渲染地块、处理四种左栏工具，并播放场景中配置的动画模板。
 * 工具光标使用 70% 透明 Sprite 跟随鼠标/触摸；代码不再生成水滴、肥雾、飘字等动画。
 */
import {
  _decorator, Animation, Component, EventMouse, EventTouch, input, Input, instantiate, Layers,
  Node, resources, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3,
} from 'cc';
import { LAND, fertAmountFor, plotsUnlockedAtLevel } from '../config/LandConfig';
import { getCropDef } from '../config/CropConfig';
import type { PlotData } from '../data/PlotData';
import { FarmModel } from '../data/FarmModel';
import { InventoryModel } from '../data/InventoryModel';
import { PlayerModel } from '../data/PlayerModel';
import { FarmPicker } from './FarmPicker';
import type { GameActionHandler } from '../GameAction';
import type { GameCommandType } from '../../core/network/Contracts';

const { ccclass } = _decorator;

export type ToolMode = 'none' | 'water' | 'fert' | 'harvest' | 'shovel';
type ActiveTool = Exclude<ToolMode, 'none'>;

const CURSOR_OPACITY = Math.round(255 * 0.7);
const CURSOR_RESOURCE: Record<ActiveTool, string> = {
  water: 'farm/tools/cursor_water/spriteFrame',
  fert: 'farm/tools/cursor_fertilizer/spriteFrame',
  harvest: 'farm/tools/cursor_harvest/spriteFrame',
  shovel: 'farm/tools/cursor_shovel/spriteFrame',
};
const EFFECT_TEMPLATE: Record<ActiveTool, string> = {
  water: 'WaterEffectTemplate',
  fert: 'FertilizerEffectTemplate',
  harvest: 'HarvestEffectTemplate',
  shovel: 'ShovelEffectTemplate',
};

interface PlotView {
  id: number;
  node: Node;
  land: Sprite | null;
  cropNode: Node;
  cropSprite: Sprite | null;
}

@ccclass('LandView')
export class LandView extends Component {
  farm!: FarmModel;
  player!: PlayerModel;
  inventory!: InventoryModel;

  onToast: (msg: string, dur?: number) => void = () => {};
  onAction: GameActionHandler = async () => ({ ok: false, message: '网络服务尚未就绪' });
  now: () => number = () => Date.now();

  /** 由 GameRoot 从 Camera/ToolCursorLayer 与 Camera/ToolEffectLayer 注入。 */
  toolCursorLayer: Node | null = null;
  toolEffectLayer: Node | null = null;

  private plots: PlotView[] = [];
  private busyPlots = new Set<number>();
  private picker: FarmPicker | null = null;
  private lastKeys: Record<number, string> = {};
  private tool: ToolMode = 'none';
  private waterCooldown = 0;
  private cursorNode: Node | null = null;
  private hasPointerPosition = false;
  private pointerWorldPosition = new Vec3();
  private suppliedCursorFrame: SpriteFrame | null = null;

  onLoad() {
    this.node.on(Node.EventType.TOUCH_END, (event) => { event.propagationStopped = true; });
    this.buildPlotMap();

    let pickerNode = this.node.getChildByName('FarmPicker');
    if (!pickerNode) {
      pickerNode = new Node('FarmPicker');
      pickerNode.layer = Layers.Enum.UI_2D;
      this.node.addChild(pickerNode);
    }
    this.picker = pickerNode.getComponent(FarmPicker) || pickerNode.addComponent(FarmPicker);

    input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.on(Input.EventType.TOUCH_START, this.onTouchMove, this);
    input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
  }

  onDestroy() {
    input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
    input.off(Input.EventType.TOUCH_START, this.onTouchMove, this);
    input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.cursorNode?.destroy();
    this.cursorNode = null;
  }

  update() {
    if (!this.farm) return;
    this.farm.updateModel(this.now());
    this.render();
  }

  configureToolLayers(cursorLayer: Node | null, effectLayer: Node | null): void {
    if (this.cursorNode && cursorLayer && this.cursorNode.parent !== cursorLayer) {
      this.cursorNode.destroy();
      this.cursorNode = null;
    }
    this.toolCursorLayer = cursorLayer;
    this.toolEffectLayer = effectLayer;
    this.refreshToolCursor();
  }

  setTool(mode: ToolMode, leftBarIcon: SpriteFrame | null = null) {
    this.tool = mode;
    this.suppliedCursorFrame = mode === 'none' ? null : leftBarIcon;
    this.refreshToolCursor();
  }

  get currentTool(): ToolMode {
    return this.tool;
  }

  render() {
    if (!this.farm || !this.player) return;
    const unlocked = plotsUnlockedAtLevel(this.player.level);
    for (const view of this.plots) {
      const visible = view.id <= unlocked;
      view.node.active = visible;
      if (!visible) { delete this.lastKeys[view.id]; continue; }
      const plot = this.farm.getPlot(view.id);
      if (!plot) continue;

      const state = this.farm.landState(plot);
      const col = ((plot.id - 1) % LAND.PLOTS_PER_ROW) + 1;
      const landPath = `farm/lands_${state}1/locked_${col}${state}/spriteFrame`;
      let cropIcon = '';
      let cropVisible = false;
      if (plot.crop) {
        const def = getCropDef(plot.crop);
        if (def) {
          const stage = this.farm.growthStage(plot, def.stageIcons.length);
          cropIcon = plot.harvestable ? def.fruitIcon : def.stageIcons[stage];
          cropVisible = true;
        }
      }

      const key = `${state}|${cropVisible}|${cropIcon}`;
      if (this.lastKeys[view.id] === key) continue;
      this.lastKeys[view.id] = key;
      if (view.land) loadFrame(landPath, view.land);
      view.cropNode.active = cropVisible;
      if (cropVisible && view.cropSprite) {
        loadFrame(`textures/items/${cropIcon}/spriteFrame`, view.cropSprite, () => {
          loadFrame(`farm/crop/${cropIcon}/spriteFrame`, view.cropSprite!);
        });
      }
    }
  }

  // ---------- 工具光标 ----------

  private onMouseMove(event: EventMouse): void {
    const point = event.getUILocation();
    this.moveToolCursor(point.x, point.y);
  }

  private onTouchMove(event: EventTouch): void {
    const point = event.getUILocation();
    this.moveToolCursor(point.x, point.y);
  }

  private moveToolCursor(worldX: number, worldY: number): void {
    this.hasPointerPosition = true;
    this.pointerWorldPosition.set(worldX, worldY, 0);
    if (this.tool === 'none') return;
    const cursor = this.ensureCursorNode();
    if (!cursor) return;
    this.positionCursor(cursor);
    cursor.active = true;
  }

  private positionCursor(cursor: Node): void {
    const layer = cursor.parent;
    const transform = layer?.getComponent(UITransform) || layer?.addComponent(UITransform);
    if (transform) cursor.setPosition(transform.convertToNodeSpaceAR(this.pointerWorldPosition));
  }

  private refreshToolCursor(): void {
    const cursor = this.ensureCursorNode();
    if (!cursor) return;
    cursor.active = this.tool !== 'none' && this.hasPointerPosition;
    if (this.tool === 'none') return;
    if (this.hasPointerPosition) this.positionCursor(cursor);

    const selected = this.tool;
    const sprite = cursor.getComponent(Sprite) || cursor.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = this.suppliedCursorFrame;
    if (this.suppliedCursorFrame) return;
    resources.load(CURSOR_RESOURCE[selected], SpriteFrame, (error, frame) => {
      if (!error && frame && this.tool === selected && this.cursorNode?.isValid) {
        sprite.spriteFrame = frame;
      }
    });
  }

  private ensureCursorNode(): Node | null {
    const layer = this.ensureLayer('ToolCursorLayer', this.toolCursorLayer);
    if (!layer) return null;
    this.toolCursorLayer = layer;
    if (this.cursorNode?.isValid) return this.cursorNode;

    const cursor = new Node('ToolCursor');
    cursor.layer = Layers.Enum.UI_2D;
    cursor.addComponent(UITransform).setContentSize(72, 72);
    cursor.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;
    cursor.addComponent(UIOpacity).opacity = CURSOR_OPACITY;
    cursor.active = false;
    layer.addChild(cursor);
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

  // ---------- 地块交互 ----------

  private onPlotTouch(view: { id: number; node: Node }) {
    if (this.busyPlots.has(view.id)) { this.onToast('操作正在同步，请稍候'); return; }
    const plot = this.farm.getPlot(view.id);
    if (!plot) return;

    if (this.tool !== 'none') {
      if (!plot.developed) { this.onToast('请先开发这块土地'); return; }
      if (this.tool === 'water') { void this.tryWater(view.id); return; }
      if (this.tool === 'fert') { this.openFertilizer(view.id); return; }
      if (this.tool === 'harvest') {
        if (!plot.harvestable) { this.onToast('这块地还没有可采摘的作物'); return; }
        void this.tryHarvest(view.id);
        return;
      }
      if (this.tool === 'shovel') {
        if (!plot.crop) { this.onToast('这块地没有需要铲除的作物'); return; }
        void this.tryShovel(view.id);
        return;
      }
    }

    if (!plot.developed) { void this.tryDevelop(view.id); return; }
    if (plot.harvestable) { void this.tryHarvest(view.id); return; }
    if (plot.crop) { this.showCropStatus(plot); return; }
    this.openSeedPicker(view.id);
  }

  private async tryDevelop(id: number) {
    if (this.player.gold < LAND.DEVELOP_COST) {
      this.onToast('金币不足，无法开发土地');
      return;
    }
    const result = await this.perform(id, 'develop_plot', { plotId: id });
    if (result.ok) this.onToast(result.message);
  }

  private openSeedPicker(id: number) {
    if (!this.picker || this.busyPlots.has(id)) return;
    const options = this.seedOptions();
    if (options.length === 0) { this.onToast('背包里没有种子，请先去商店购买'); return; }
    this.picker.open('选择种子', options, (cropId) => { void this.doPlant(id, cropId); });
  }

  private seedOptions(): (import('./FarmPicker').PickerOption & { key: string })[] {
    const output: (import('./FarmPicker').PickerOption & { key: string })[] = [];
    for (const seed of this.inventory.query({ category: 'seed' })) {
      const cropId = (seed.icon || '').replace(/^seed_/, '');
      const def = getCropDef(cropId);
      if (def) output.push({ key: def.id, name: def.name, icon: seed.icon, sub: `x${seed.count}` });
    }
    return output;
  }

  private async doPlant(id: number, cropId: string) {
    const result = await this.perform(id, 'plant', { plotId: id, cropId });
    if (result.ok) this.onToast(`${result.message}，记得浇水施肥`);
  }

  private async tryWater(id: number) {
    const now = this.now();
    if (now < this.waterCooldown || this.busyPlots.has(id)) return;
    this.waterCooldown = now + LAND.WATER_COOLDOWN_MS;
    const result = await this.perform(id, 'water', { plotId: id });
    if (result.ok) {
      this.playProvidedEffect('water', id);
      this.onToast(result.message);
    }
  }

  private openFertilizer(id: number) {
    if (!this.picker || this.busyPlots.has(id)) return;
    const options = this.fertilizerOptions();
    if (options.length === 0) { this.onToast('背包里没有化肥，请先去商店购买'); return; }
    this.picker.open('选择化肥', options, (itemId) => { void this.doFertilize(id, itemId); });
  }

  private fertilizerOptions(): (import('./FarmPicker').PickerOption & { key: string })[] {
    return this.inventory.query({ category: 'fert' }).map(item => ({
      key: item.id,
      name: item.name,
      icon: item.icon,
      sub: `增加 ${fertAmountFor(item.icon)} 养分`,
    }));
  }

  private async doFertilize(id: number, itemId: string) {
    const result = await this.perform(id, 'fertilize', { plotId: id, itemId });
    if (result.ok) {
      this.playProvidedEffect('fert', id);
      this.onToast(result.message);
    }
  }

  private async tryHarvest(id: number) {
    const result = await this.perform(id, 'harvest', { plotId: id });
    if (result.ok) {
      this.playProvidedEffect('harvest', id);
      this.onToast(result.message, 2.2);
    }
  }

  private async tryShovel(id: number) {
    const result = await this.perform(id, 'shovel', { plotId: id });
    if (result.ok) {
      this.playProvidedEffect('shovel', id);
      this.onToast(result.message);
    }
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

  private showCropStatus(plot: PlotData) {
    const def = getCropDef(plot.crop!);
    if (!def) return;
    const hours = Math.max(0, def.duration - plot.progress * def.duration);
    this.onToast(
      `${def.name}：水分 ${Math.round(plot.water)}，肥力 ${Math.round(plot.fert)}，约 ${hours.toFixed(1)} 小时成熟`,
      2,
    );
  }

  // ---------- 用户提供的 Animation 模板 ----------

  private playProvidedEffect(tool: ActiveTool, plotId: number): void {
    const plot = this.plots.find(item => item.id === plotId);
    const layer = this.ensureLayer('ToolEffectLayer', this.toolEffectLayer);
    if (!plot || !layer) return;
    this.toolEffectLayer = layer;
    if (this.toolCursorLayer?.parent) {
      this.toolCursorLayer.setSiblingIndex(this.toolCursorLayer.parent.children.length - 1);
    }

    const templateName = EFFECT_TEMPLATE[tool];
    const template = layer.getChildByName(templateName);
    if (!template) {
      console.warn(`[LandView] 缺少场景动画模板 Camera/ToolEffectLayer/${templateName}`);
      return;
    }

    const effect = instantiate(template);
    effect.name = `${templateName}_Playing`;
    layer.addChild(effect);
    effect.setWorldPosition(plot.node.worldPosition);
    effect.active = true;

    const animation = effect.getComponent(Animation) || effect.getComponentInChildren(Animation);
    const clip = animation?.defaultClip || animation?.clips[0] || null;
    if (!animation || !clip) {
      console.warn(`[LandView] ${templateName} 需要 Animation 组件和默认 AnimationClip`);
      effect.destroy();
      return;
    }

    if (!animation.defaultClip) animation.defaultClip = clip;
    animation.play();
    this.scheduleOnce(() => {
      if (effect.isValid) effect.destroy();
    }, Math.max(0.05, clip.duration + 0.05));
  }

  // ---------- 场景地块映射 ----------

  private buildPlotMap() {
    this.plots = [];
    for (let row = 1; row <= LAND.ROWS; row++) {
      const rowNode = this.node.getChildByName(`lands_${row}`);
      if (!rowNode) continue;
      for (let col = 1; col <= LAND.PLOTS_PER_ROW; col++) {
        const id = (row - 1) * LAND.PLOTS_PER_ROW + col;
        const plotNode = rowNode.getChildByName(String(col));
        if (!plotNode) continue;

        const land = plotNode.getComponent(Sprite) || plotNode.addComponent(Sprite);
        land.sizeMode = Sprite.SizeMode.CUSTOM;
        let cropNode = plotNode.getChildByName('crop');
        if (!cropNode) {
          cropNode = new Node('crop');
          cropNode.layer = Layers.Enum.UI_2D;
          cropNode.addComponent(UITransform).setContentSize(60, 60);
          cropNode.setPosition(0, 12);
          plotNode.addChild(cropNode);
        }
        const cropSprite = cropNode.getComponent(Sprite) || cropNode.addComponent(Sprite);
        cropSprite.sizeMode = Sprite.SizeMode.CUSTOM;

        const plotId = id;
        plotNode.off(Node.EventType.TOUCH_END);
        plotNode.on(Node.EventType.TOUCH_END, (event) => {
          event.propagationStopped = true;
          const target = this.plots.find(item => item.id === plotId);
          if (target) this.onPlotTouch(target);
        });
        this.plots.push({ id, node: plotNode, land, cropNode, cropSprite });
      }
    }
  }
}

function loadFrame(path: string, sprite: Sprite, fallback?: () => void): void {
  resources.load(path, SpriteFrame, (error, frame) => {
    if (!error && frame && sprite?.isValid) sprite.spriteFrame = frame;
    else fallback?.();
  });
}
