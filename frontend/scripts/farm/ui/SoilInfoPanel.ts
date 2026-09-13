/** 固定面板里的同名 Label 自动绑定；可放在 ScrollView/content 下，不生成节点。 */
import { _decorator, Button, Component, Label, Node, ScrollView } from 'cc';
import { LAND, GROWTH_DISPLAY } from '../config/LandConfig';
import { getCropDef } from '../config/CropConfig';
import { fertilizerName, medicineName } from '../config/ItemConfig';
import { currentWorld } from '../config/WeatherConfig';
import { FarmModel } from '../data/FarmModel';
import type { LandState, PlotData } from '../data/PlotData';
import { findNode, setActive } from './Ui';

const { ccclass, property } = _decorator;
const FIELDS = ['plotId', 'season', 'weather', 'temp', 'moisture', 'fertility', 'soilState',
  'cropName', 'cropStage', 'growth', 'growthSpeed', 'remainingTime', 'harvestCount',
  'fertilizerName', 'fertilizerType', 'fertilizerTime', 'pest', 'disease', 'matureState',
  'harvestYield', 'quality', 'lockPrice', 'plantLimit', 'medicine'] as const;
const STATE_NAME = { normal: '正常', locked: '未解锁', dry: '缺水', lowfert: '缺肥' };

@ccclass('SoilInfoPanel')
export class SoilInfoPanel extends Component {
  @property(ScrollView) public scrollView: ScrollView | null = null;
  isOpen = false;
  currentPlotId = 0;
  onClose: () => void = () => {};
  onRequestMedicine: (plotId: number) => void = () => {};
  private labels: Partial<Record<typeof FIELDS[number], Label>> = {};
  private medicineButton: Node | null = null;

  onLoad() {
    for (const name of FIELDS) {
      const label = findNode(this.node, name)?.getComponent(Label);
      if (label) this.labels[name] = label;
    }
    this.scrollView ||= this.node.getComponentInChildren(ScrollView);
    this.node.on(Node.EventType.TOUCH_END, (event: any) => {
      if (event?.target === this.node) this.close();
    });
    findNode(this.node, 'btn_close')?.on(Button.EventType.CLICK, () => this.close());
    this.medicineButton = findNode(this.node, 'btn_medicine');
    this.medicineButton?.on(Button.EventType.CLICK, () => {
      if (this.currentPlotId) this.onRequestMedicine(this.currentPlotId);
    });
    if (!this.isOpen) this.node.active = false;
  }

  open(plot: PlotData, model: FarmModel): void {
    this.currentPlotId = plot.id;
    this.isOpen = true;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this.render(plot, model);
    this.scrollView?.scrollToTop(0);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.node.active = false;
    this.currentPlotId = 0;
    this.onClose();
  }

  render(plot: PlotData, model: FarmModel, state = model.landState(plot)): void {
    if (!plot || plot.id !== this.currentPlotId) return;
    const values = soilInfoValues(plot, state);
    for (const name of FIELDS) {
      const label = this.labels[name];
      if (label) label.string = values[name] ?? '';
    }
    setActive(this.medicineButton, plot.unlocked &&
      (plot.pest.status === 'ACTIVE' || plot.disease.status === 'ACTIVE'));
  }
}

/** 所有字段每次完整赋值，切换空地/锁地时不会留下上一块地的文字。 */
export function soilInfoValues(plot: PlotData, state: LandState): Record<string, string> {
  const world = currentWorld();
  const crop = plot.unlocked ? getCropDef(plot.crop) : undefined;
  const fertilizers = plot.unlocked ? plot.activeFertilizers : [];
  const remainingGrowth = Math.max(0, 100 - plot.stageGrowth);
  const stageMinutes = crop?.stageMinutes[Math.max(0, plot.stage - 1)] || 1;
  const futureMinutes = crop?.stageMinutes.slice(Math.max(1, plot.stage)).reduce((a, b) => a + b, 0) || 0;
  const estimate = (remainingGrowth + 100 * futureMinutes / stageMinutes) / plot.growthPerMinute;
  const event = (value: PlotData['pest']) => value.status === 'ACTIVE' ? `Lv.${Math.round(value.level)}` : '无';
  return {
    plotId: `第 ${plot.id} 块土地`, season: world.seasonName, weather: world.weatherName,
    temp: `${world.temperature.toFixed(1)}℃`,
    moisture: plot.unlocked ? `${Math.round(plot.moisture)}` : '--',
    fertility: plot.unlocked ? `${Math.round(plot.fertility)}` : '--',
    soilState: STATE_NAME[state], cropName: crop?.name || (plot.unlocked ? '空地' : '--'),
    cropStage: crop ? `第 ${plot.stage} 阶段` : '--',
    growth: crop ? `${Math.floor(plot.stageGrowth)}/100` : '--',
    growthSpeed: crop && !plot.mature ? `${plot.growthPerMinute.toFixed(2)}/分钟` : '--',
    remainingTime: !crop ? '--' : plot.mature ? '可采摘'
      : Number.isFinite(estimate) && plot.growthPerMinute > 0 ? `预计 ${Math.ceil(estimate)} 分钟（按当前环境）` : '暂无估计',
    harvestCount: crop ? `${plot.matureYield || GROWTH_DISPLAY.BASE_YIELD}（预计）` : '--',
    fertilizerName: fertilizers.map(item => `${fertilizerName(item.id)}${item.best ? ' [最佳]' : ''}`).join('\n') || '无',
    fertilizerType: fertilizers.map(item => item.type === 'organic' ? '有机' : '无机').join('\n') || '--',
    fertilizerTime: fertilizers.map(item => `${Math.ceil(item.remainingMinutes)} 分钟`).join('\n') || '--',
    pest: plot.unlocked ? event(plot.pest) : '--', disease: plot.unlocked ? event(plot.disease) : '--',
    matureState: crop ? plot.mature ? '已成熟' : '生长中' : '--',
    harvestYield: crop && plot.mature ? `${plot.harvestQuantity}` : '--',
    quality: crop ? `${plot.qualityGrade}（${Math.round(plot.quality)} / ×${plot.qualityMultiplier}）` : '--',
    lockPrice: plot.unlocked ? '已解锁' : `${plot.unlock?.price ?? 0} 金币 / ${plot.unlock?.minLevel ?? 1} 级`,
    plantLimit: plot.unlocked ? `${plot.dailyPlantCount}/${plot.dailyPlantLimit || LAND.DAILY_PLANT_LIMIT}` : '--',
    medicine: plot.unlocked ? plot.activeMedicines.map(item =>
      `${medicineName(item.id)}：${Math.ceil(item.remainingMinutes)} 分钟`).join('\n') || '无' : '--',
  };
}
