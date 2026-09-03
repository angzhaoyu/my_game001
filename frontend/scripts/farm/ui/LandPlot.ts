/**
 * ui/LandPlot.ts —— 单块土地的显示组件（挂在土地预制体根节点上）
 *
 * 设计原则：**所有节点、动画、进度条都在 Cocos 里摆好并做成一个预制体**，
 * 这里只做三件事——切土块贴图、切换节点的 active、播放已经做好的 Animation。
 * 代码不创建 UI 节点，也不生成动画。
 *
 * 预制体结构见 `../../scenes/farm.scene.md` 的「LandPlot 预制体」一节。
 */
import {
  _decorator, Animation, Component, Label, Node, Sprite, UITransform,
} from 'cc';
import { LAND } from '../config/LandConfig';
import { getCropDef } from '../config/CropConfig';
import { FarmModel } from '../data/FarmModel';
import type { LandState, PlotData } from '../data/PlotData';
import { applySprite, fillPath } from './Assets';

const { ccclass, property } = _decorator;

/** 土块状态 → 资源后缀（与 resources/Farm/Lands_xx 目录一一对应） */
export const SOIL_SUFFIX: Record<LandState, string> = {
  normal: 'a',
  locked: 'b',
  lowfert: 'c',
  dry: 'd',
};

export type PlotEffectName =
  | 'watering' | 'shovel' | 'fertilize' | 'harvest' | 'mature' | 'unlock';

const EFFECT_NODE: Record<PlotEffectName, string> = {
  watering: 'fx_watering',
  shovel: 'fx_shovel',
  fertilize: 'fx_fertilize',
  harvest: 'fx_harvest',
  mature: 'fx_mature',
  unlock: 'fx_unlock',
};

@ccclass('LandPlot')
export class LandPlot extends Component {
  // ---------------- 在 Cocos 里拖绑定 ----------------
  @property({ tooltip: '土块贴图；同一列有 6 张图，按 {col} 取' })
  public soil: Sprite | null = null;

  @property({ tooltip: '土块贴图路径模板，占位符 {state}=a/b/c/d，{col}=1..6' })
  public soilPathPattern = 'farm/lands_{state}1/locked_{col}{state}/spriteFrame';

  @property({ tooltip: '作物节点（有作物时唤醒，成熟后隐藏）' })
  public cropNode: Node | null = null;
  @property(Sprite) public stage1: Sprite | null = null;
  @property(Sprite) public stage2: Sprite | null = null;
  @property(Sprite) public stage3: Sprite | null = null;

  @property({ tooltip: '成长进度条（成长值 0~100）' })
  public growthBar: Node | null = null;
  @property(Sprite) public growthFill: Sprite | null = null;
  @property({ tooltip: '进度条最大宽度，fill 用 width 缩放（0 = 使用 fillRange）' })
  public growthFillMaxWidth = 0;
  @property(Label) public growthLabel: Label | null = null;

  @property(Node) public pestFx: Node | null = null;
  @property(Node) public diseaseFx: Node | null = null;
  @property(Node) public dryFx: Node | null = null;
  @property(Node) public lowFertFx: Node | null = null;

  @property(Node) public matureNode: Node | null = null;
  @property(Node) public matureFx: Node | null = null;
  @property(Label) public matureLabel: Label | null = null;

  @property(Node) public lockNode: Node | null = null;
  @property(Label) public lockPriceLabel: Label | null = null;
  @property(Node) public unlockableFx: Node | null = null;

  @property(Node) public notifyNode: Node | null = null;
  @property(Label) public notifyLabel: Label | null = null;

  @property({ tooltip: '肥料/药品等状态图标的父节点，代码只切 active' })
  public statesNode: Node | null = null;

  // ---------------- 可在 Cocos 里微调的阈值（0 = 跟随服务端配置） ----------------
  @property({ tooltip: '缺肥提示：低于目标肥力多少点时显示，0 = 用服务端值' })
  public fertilityAlertGap = 0;
  @property({ tooltip: '缺水提示：低于作物湿度下限多少点时显示，0 = 用服务端值' })
  public moistureAlertGap = 0;

  /** 地块编号 1..24，由 LandView 在装配时写入 */
  public plotId = 0;
  /** 所在列 1..6，决定使用哪一张土块图片 */
  public column = 1;

  private lastSoilKey = '';
  private lastCropKey = '';
  private wasMature = false;

  onLoad() {
    this.node.on(Node.EventType.TOUCH_END, () => { /* 由 LandView 统一处理，这里只吃掉冒泡 */ });
    // 属性检查器里没拖的节点，按名字自动绑定，保证预制体一挂上就能用。
    this.autoBind();
  }

  private autoBind(): void {
    const node = (name: string): Node | null => this.findNode(name);
    const sprite = (name: string, current: Sprite | null): Sprite | null =>
      current || (node(name)?.getComponent(Sprite) ?? null);
    const label = (name: string, current: Label | null): Label | null =>
      current || (node(name)?.getComponent(Label) ?? null);

    this.soil = sprite('soil', this.soil);
    this.cropNode = this.cropNode || node('crop');
    this.stage1 = sprite('stage_1', this.stage1);
    this.stage2 = sprite('stage_2', this.stage2);
    this.stage3 = sprite('stage_3', this.stage3);
    this.growthBar = this.growthBar || node('growth');
    this.growthFill = this.growthFill
      || (this.growthBar?.getChildByName('fill')?.getComponent(Sprite) ?? null)
      || (this.growthBar?.getComponentInChildren(Sprite) ?? null);
    this.growthLabel = label('lb_growth', this.growthLabel);

    this.pestFx = this.pestFx || node('fx_pest');
    this.diseaseFx = this.diseaseFx || node('fx_disease');
    this.dryFx = this.dryFx || node('fx_dry');
    this.lowFertFx = this.lowFertFx || node('fx_lowfert');

    this.matureNode = this.matureNode || node('mature');
    this.matureFx = this.matureFx || node('fx_mature');
    this.matureLabel = label('lb_mature', this.matureLabel);

    this.lockNode = this.lockNode || node('lock');
    this.lockPriceLabel = label('lb_price', this.lockPriceLabel);
    this.unlockableFx = this.unlockableFx || node('fx_unlock');

    this.notifyNode = this.notifyNode || node('notify');
    this.notifyLabel = this.notifyLabel
      || (this.notifyNode?.getComponentInChildren(Label) ?? null)
      || label('label', null);
  }

  private findNode(name: string): Node | null {
    const direct = this.node.getChildByName(name);
    if (direct) return direct;
    const inStates = this.statesNode?.getChildByName(name);
    if (inStates) return inStates;
    return findRecursive(this.node, name);
  }

  /** 用服务端快照刷新显示。只在关键值变化时写节点，避免每帧抖动。 */
  render(plot: PlotData, model: FarmModel): void {
    if (!plot) return;
    const state = this.resolveState(plot);
    const col = this.column || ((plot.id - 1) % LAND.PLOTS_PER_ROW) + 1;

    const soilKey = `${state}|${col}|${this.soilPathPattern}`;
    if (soilKey !== this.lastSoilKey) {
      this.lastSoilKey = soilKey;
      const path = fillPath(this.soilPathPattern, { state: SOIL_SUFFIX[state], col });
      applySprite(this.soil, [path]);
    }

    const locked = !plot.unlocked;
    setActive(this.lockNode, locked);
    setActive(this.cropNode, !locked && !!plot.crop && !plot.mature);
    setActive(this.matureNode, !locked && plot.mature);
    setActive(this.growthBar, !locked && !!plot.crop && !plot.mature);
    setActive(this.pestFx, !locked && plot.pest.status === 'ACTIVE');
    setActive(this.diseaseFx, !locked && plot.disease.status === 'ACTIVE');
    setActive(this.dryFx, !locked && state === 'dry');
    setActive(this.lowFertFx, !locked && state === 'lowfert');

    if (locked) {
      setActive(this.growthBar, false);
      const price = plot.unlock?.price ?? 0;
      if (this.lockPriceLabel) this.lockPriceLabel.string = price > 0 ? `${price}` : '未解锁';
      setActive(this.unlockableFx, !!plot.unlock && this.canUnlock(plot));
      this.showNotify('');
      return;
    }
    setActive(this.unlockableFx, false);

    // 作物三阶段：只唤醒对应的一张
    const crop = getCropDef(plot.crop);
    const stageIndex = model.growthStage(plot);
    const cropKey = `${plot.crop}|${stageIndex}`;
    if (cropKey !== this.lastCropKey) {
      this.lastCropKey = cropKey;
      const stages = [this.stage1, this.stage2, this.stage3];
      stages.forEach((sprite, index) => {
        setActive(sprite?.node ?? null, index === stageIndex);
        if (index === stageIndex && sprite && crop) {
          applySprite(sprite, [
            `farm/crop/${crop.stageIcons[index]}/spriteFrame`,
            `textures/items/${crop.stageIcons[index]}/spriteFrame`,
          ]);
        }
      });
    }

    // 进度条：成长值 0~100
    if (this.growthBar?.active && plot.crop) {
      const ratio = model.stageProgress(plot);
      this.setBar(this.growthFill, ratio);
      if (this.growthLabel) {
        this.growthLabel.string = plot.mature ? '可采摘' : `${Math.floor(plot.stageGrowth)}`;
      }
    }

    // 成熟瞬间弹一次成熟动画
    if (plot.mature && !this.wasMature) this.playEffect('mature');
    this.wasMature = plot.mature;
    if (this.matureLabel) {
      this.matureLabel.string = plot.mature
        ? `${crop?.name ?? '作物'} ×${plot.harvestQuantity}`
        : '';
    }

    // 播种次数用尽提示
    const limit = plot.dailyPlantLimit || LAND.DAILY_PLANT_LIMIT;
    this.showNotify(plot.dailyPlantCount >= limit ? `今日播种 ${limit}/${limit}` : '');
  }

  /** 播放已经做好的动画节点：唤醒 → 播放 → 播完隐藏。 */
  playEffect(name: PlotEffectName): boolean {
    const node = this.findEffectNode(name);
    if (!node) return false;
    node.active = true;
    const animation = node.getComponent(Animation) || node.getComponentInChildren(Animation);
    const clip = animation?.defaultClip || animation?.clips[0] || null;
    if (!animation || !clip) {
      // 没有 Animation 组件时保持常显，由下一次 render 覆盖
      return true;
    }
    if (!animation.defaultClip) animation.defaultClip = clip;
    animation.play();
    this.scheduleOnce(() => { if (node.isValid) node.active = false; },
      Math.max(0.05, clip.duration + 0.05));
    return true;
  }

  // ---------------- 内部 ----------------

  private findEffectNode(name: PlotEffectName): Node | null {
    const direct = this.node.getChildByName(EFFECT_NODE[name]);
    if (direct) return direct;
    if (name === 'mature' && this.matureFx) return this.matureFx;
    if (name === 'unlock') return this.unlockableFx;
    return this.statesNode?.getChildByName(EFFECT_NODE[name]) ?? null;
  }

  private canUnlock(plot: PlotData): boolean {
    return !!plot.unlock && plot.unlock.price >= 0;
  }

  private resolveState(plot: PlotData): LandState {
    if (!plot.unlocked) return 'locked';
    const crop = getCropDef(plot.crop);
    const fertGap = this.fertilityAlertGap > 0 ? this.fertilityAlertGap : LAND.FERTILITY_ALERT_GAP;
    const moistureGap = this.moistureAlertGap > 0 ? this.moistureAlertGap : LAND.MOISTURE_ALERT_GAP;
    if (crop && plot.moisture < crop.humidity[0] - moistureGap) return 'dry';
    if (crop && plot.fertility < crop.targetFertility - fertGap) return 'lowfert';
    return 'normal';
  }

  private setBar(sprite: Sprite | null, ratio: number): void {
    if (!sprite) return;
    const clamped = Math.min(1, Math.max(0, ratio));
    if (this.growthFillMaxWidth > 0) {
      const transform = sprite.getComponent(UITransform) || sprite.addComponent(UITransform);
      transform.setContentSize(this.growthFillMaxWidth * clamped, transform.height);
    } else {
      sprite.fillRange = clamped;
    }
  }

  private showNotify(text: string): void {
    const visible = !!text;
    setActive(this.notifyNode, visible);
    if (visible && this.notifyLabel) this.notifyLabel.string = text;
  }
}

export function setActive(node: Node | null, active: boolean): void {
  if (node && node.isValid && node.active !== active) node.active = active;
}

function findRecursive(root: Node, name: string): Node | null {
  for (const child of root.children) {
    if (child.name === name) return child;
    const found = findRecursive(child, name);
    if (found) return found;
  }
  return null;
}
