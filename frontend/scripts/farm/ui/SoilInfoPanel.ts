/**
 * ui/SoilInfoPanel.ts —— 土壤信息框
 *
 * 全部节点在 Cocos 里搭好（固定大小 + ScrollView 可上下拉动），代码只负责：
 *   - 双击土地 → 唤醒；点击框外 → 关闭；
 *   - 填充湿度 / 肥力 / 土壤健康进度条，并在有作物时唤醒「作物适宜区间」；
 *   - 列出生效中的肥料（名称 / 剩余时间 / 每分钟释放 / 是否当前阶段最佳）与药品。
 */
import { _decorator, Button, Component, Label, Node, ScrollView, Sprite, UITransform } from 'cc';
import { LAND } from '../config/LandConfig';
import { getCropDef } from '../config/CropConfig';
import { fertilizerName, medicineName } from '../config/ItemConfig';
import { FarmModel } from '../data/FarmModel';
import type { PlotData } from '../data/PlotData';

const { ccclass, property } = _decorator;

/** 基础成熟产量（服务端 GROWTH_RULES.baseYield，前端只用于提示） */
const BASE_YIELD = 10;

@ccclass('SoilInfoPanel')
export class SoilInfoPanel extends Component {
  @property(Node) public panelNode: Node | null = null;
  @property(Label) public titleLabel: Label | null = null;

  @property(Node) public moistureBar: Node | null = null;
  @property(Sprite) public moistureFill: Sprite | null = null;
  @property(Node) public moistureRange: Node | null = null;
  @property(Label) public moistureValue: Label | null = null;

  @property(Node) public fertilityBar: Node | null = null;
  @property(Sprite) public fertilityFill: Sprite | null = null;
  @property(Node) public fertilityRange: Node | null = null;
  @property(Label) public fertilityValue: Label | null = null;

  @property(Sprite) public soilHealthFill: Sprite | null = null;
  @property(Label) public soilHealthValue: Label | null = null;

  @property(Label) public cropLabel: Label | null = null;
  @property(Label) public qualityLabel: Label | null = null;
  @property(Label) public yieldLabel: Label | null = null;
  @property(Label) public plantCountLabel: Label | null = null;

  @property(Label) public fertilizerLabel: Label | null = null;
  @property(Label) public medicineLabel: Label | null = null;
  @property(Label) public eventLabel: Label | null = null;
  @property(Node) public medicineButton: Node | null = null;

  @property(ScrollView) public scrollView: ScrollView | null = null;

  /** 覆盖服务端阈值：0 = 跟随服务端配置 */
  @property({ tooltip: '缺肥提示阈值，0 = 跟随服务端配置' })
  public fertilityAlertGap = 0;
  @property({ tooltip: '缺水提示阈值，0 = 跟随服务端配置' })
  public moistureAlertGap = 0;

  isOpen = false;
  onClose: () => void = () => {};
  onRequestMedicine: (plotId: number) => void = () => {};

  /** 当前展示的地块编号；LandView 用它跟随快照刷新 */
  currentPlotId = 0;

  onLoad() {
    // 点击面板外部（根节点空白处）关闭
    this.node.on(Node.EventType.TOUCH_END, (event: any) => {
      if (event?.target === this.node) this.close();
    });
    if (this.medicineButton) {
      this.medicineButton.off(Button.EventType.CLICK);
      this.medicineButton.on(Button.EventType.CLICK, () => {
        if (this.currentPlotId) this.onRequestMedicine(this.currentPlotId);
      });
    }
    this.node.active = false;
  }

  open(plot: PlotData, model: FarmModel): void {
    this.currentPlotId = plot.id;
    this.isOpen = true;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this.render(plot, model);
    if (this.scrollView) this.scrollView.scrollToTop(0);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.node.active = false;
    this.currentPlotId = 0;
    this.onClose();
  }

  render(plot: PlotData, model: FarmModel): void {
    if (!plot || plot.id !== this.currentPlotId) return;
    if (this.titleLabel) this.titleLabel.string = `第 ${plot.id} 块土地`;
    if (!plot.unlocked) {
      const price = plot.unlock?.price ?? 0;
      const level = plot.unlock?.minLevel ?? 1;
      if (this.cropLabel) this.cropLabel.string = `未解锁：${price} 金币 / ${level} 级`;
      setBar(this.moistureFill, 0);
      setBar(this.fertilityFill, 0);
      setBar(this.soilHealthFill, 0);
      setActive(this.moistureRange, false);
      setActive(this.fertilityRange, false);
      if (this.moistureValue) this.moistureValue.string = '--';
      if (this.fertilityValue) this.fertilityValue.string = '--';
      if (this.soilHealthValue) this.soilHealthValue.string = '--';
      if (this.fertilizerLabel) this.fertilizerLabel.string = '';
      if (this.medicineLabel) this.medicineLabel.string = '';
      if (this.eventLabel) this.eventLabel.string = '';
      if (this.qualityLabel) this.qualityLabel.string = '';
      if (this.yieldLabel) this.yieldLabel.string = '';
      if (this.plantCountLabel) this.plantCountLabel.string = '';
      setActive(this.medicineButton, false);
      return;
    }

    const crop = getCropDef(plot.crop);
    // 有作物时唤醒「作物适宜区间」：湿度取 Hmin~Hmax，肥力取目标 ±阈值
    // （阈值可在组件属性上覆盖，0 表示跟随服务端配置）
    const moistureRange = model.moistureRange(plot);
    const gap = this.fertilityAlertGap > 0 ? this.fertilityAlertGap : LAND.FERTILITY_ALERT_GAP;
    const fertilityRange: [number, number] | null = crop
      ? [Math.max(0, crop.targetFertility - gap), Math.min(100, crop.targetFertility + gap)]
      : null;

    setBar(this.moistureFill, plot.moisture / 100);
    setBar(this.fertilityFill, plot.fertility / 100);
    setBar(this.soilHealthFill, plot.soilHealth / 100);
    if (this.moistureValue) this.moistureValue.string = `${Math.round(plot.moisture)}`;
    if (this.fertilityValue) this.fertilityValue.string = `${Math.round(plot.fertility)}`;
    if (this.soilHealthValue) this.soilHealthValue.string = `${Math.round(plot.soilHealth)}`;

    // 有作物时唤醒「作物适宜区间」
    showRange(this.moistureRange, this.moistureBar, moistureRange);
    showRange(this.fertilityRange, this.fertilityBar, fertilityRange);

    if (this.cropLabel) {
      this.cropLabel.string = crop
        ? `${crop.name} · 第 ${Math.max(1, plot.stage)} 阶段 · ${plot.mature ? '已成熟' : '生长中'}`
        : '空地（可播种）';
    }
    if (this.qualityLabel) {
      this.qualityLabel.string = crop
        ? `品质 ${Math.round(plot.quality)}（${plot.qualityGrade} ×${plot.qualityMultiplier}）`
        : '';
    }
    if (this.yieldLabel) {
      this.yieldLabel.string = plot.mature
        ? `产量 ${plot.harvestQuantity}/${plot.matureYield}`
        : (crop ? `预计产量 ${plot.matureYield || BASE_YIELD}` : '');
    }
    if (this.plantCountLabel) {
      const limit = plot.dailyPlantLimit || LAND.DAILY_PLANT_LIMIT;
      this.plantCountLabel.string = `今日播种 ${plot.dailyPlantCount}/${limit}`
        + (plot.dailyPlantCount >= limit ? '（已用完）' : '');
    }

    if (this.fertilizerLabel) {
      this.fertilizerLabel.string = plot.activeFertilizers.length
        ? plot.activeFertilizers.map(item => {
          const detail = item.perMinute > 0
            ? `+${item.perMinute}/分钟`
            : '即时生效';
          return `${fertilizerName(item.id)} ×${Math.ceil(item.remainingMinutes)}分钟 ${detail}${item.best ? ' [最佳]' : ''}`;
        }).join('\n')
        : '暂无生效肥料';
    }
    if (this.medicineLabel) {
      this.medicineLabel.string = plot.activeMedicines.length
        ? plot.activeMedicines.map(item =>
          `${medicineName(item.id)} 剩余 ${Math.ceil(item.remainingMinutes)} 分钟`).join('\n')
        : '暂无生效药品';
    }
    const events: string[] = [];
    if (plot.pest.status === 'ACTIVE') events.push(`害虫 Lv.${Math.round(plot.pest.level)}`);
    if (plot.disease.status === 'ACTIVE') events.push(`病害 Lv.${Math.round(plot.disease.level)}`);
    if (this.eventLabel) this.eventLabel.string = events.join(' / ') || '无病虫害';
    setActive(this.medicineButton, events.length > 0);
  }
}

function setBar(sprite: Sprite | null, ratio: number): void {
  if (!sprite) return;
  sprite.fillRange = Math.min(1, Math.max(0, ratio));
}

function setActive(node: Node | null, active: boolean): void {
  if (node && node.isValid && node.active !== active) node.active = active;
}

/** 把「作物适宜区间」画成进度条上的一段高亮：只改 width/x，不新建节点。 */
function showRange(
  rangeNode: Node | null,
  barNode: Node | null,
  range: [number, number] | null,
): void {
  if (!rangeNode || !barNode) return;
  setActive(rangeNode, !!range);
  if (!range) return;
  const width = barNode.getComponent(UITransform)?.width ?? 100;
  const low = Math.min(1, Math.max(0, range[0] / 100));
  const high = Math.min(1, Math.max(0, range[1] / 100));
  const transform = rangeNode.getComponent(UITransform) || rangeNode.addComponent(UITransform);
  transform.setContentSize(Math.max(2, width * (high - low)), transform.height || 8);
  rangeNode.setPosition((low + high) / 2 * width - width / 2, rangeNode.position.y, 0);
}
