/**
 * ui/SoilInfoPanel.ts —— 土壤信息框（双击土地唤醒，点框外关闭）
 *
 * 面板在 Cocos 里摆好：固定大小 + ScrollView 可上下拉动，**每一行就是一个 Label**，
 * 代码只按 Label 的节点名填字（`plotId` 与 `lb_plotId` 都能匹配）。
 * 想加 / 减一行：改场景节点 + 改下面的 `TEXT` 表即可，不用动其它逻辑。
 *
 * ```text
 * SoilInfoPanel                     Node   挂本组件（全屏根节点）
 * └─ Panel                          Sprite 固定大小
 *    ├─ bar_moisture                 Node  湿度条：bg / fill / range（range = 作物适宜区间）
 *    ├─ bar_fertility                Node  肥力条：bg / fill / range
 *    ├─ ScrollView/view/content      Node
 *    │  ├─ plotId                    Label 土地编号
 *    │  ├─ season / weather / temp   Label 季节 / 天气 / 温度
 *    │  ├─ moisture / fertility      Label 湿度 / 肥力
 *    │  ├─ soilState                 Label 土地状态（正常 / 缺水 / 缺肥 / 未解锁，来自 Soil_Data 表）
 *    │  ├─ cropName / cropStage      Label 作物名称 / 生长阶段
 *    │  ├─ growth / growthSpeed      Label 成长值 / 成长速度
 *    │  ├─ remainingTime             Label 剩余时间
 *    │  ├─ harvestCount              Label 预计产量
 *    │  ├─ fertilizerName            Label 肥料名称（多行）
 *    │  ├─ fertilizerType            Label 无机 / 有机（多行）
 *    │  ├─ fertilizerTime            Label 剩余时间（多行）
 *    │  ├─ pest / disease            Label 害虫 / 病害
 *    │  ├─ matureState               Label 成熟状态
 *    │  ├─ harvestYield              Label 收获数量
 *    │  ├─ quality                   Label 品质
 *    │  ├─ lockPrice                 Label 解锁价格 / 等级
 *    │  └─ plantLimit                Label 播种次数
 *    └─ btn_medicine                 Button「处理病虫害」→ 打开 MedicinePanel
 * ```
 */
import { _decorator, Component, Label, Node, ScrollView, Sprite } from 'cc';
import { LAND, qualityGrade, soilStyle, unlockRow } from '../config/LandConfig';
import { getCropDef } from '../config/CropConfig';
import { fertilizerName, fertilizerTypeLabel, getFertilizerDef } from '../config/FertilizerConfig';
import { currentWorld } from '../config/WeatherConfig';
import type { FarmModel } from '../data/FarmModel';
import type { ActiveFertilizer, PlotData } from '../data/PlotData';
import {
  bindClick, closeOnOutsideTouch, findChild, findLabel, findSprite, setActive, setBar, setRange, showOnTop,
} from './NodeUtils';

const { ccclass, property } = _decorator;

/** 空值统一显示成 `—`，避免面板里出现空白行 */
const EMPTY = '—';

@ccclass('SoilInfoPanel')
export class SoilInfoPanel extends Component {
  @property({ type: Node, tooltip: '湿度进度条节点（内含 fill / range）；不填则按 bar_moisture 查找' })
  public moistureBar: Node | null = null;
  @property({ type: Node, tooltip: '肥力进度条节点（内含 fill / range）；不填则按 bar_fertility 查找' })
  public fertilityBar: Node | null = null;
  @property({ type: ScrollView, tooltip: '不填则自动找名为 ScrollView 的节点' })
  public scrollViewComp: ScrollView | null = null;
  @property({ tooltip: '缺肥 / 缺水换图阈值，0 = 读 Game_Rule.soilAlertGap' })
  public soilAlertGap = 0;

  isOpen = false;
  /** 当前展示的地块编号；LandView 用它跟随快照刷新 */
  currentPlotId = 0;
  onRequestMedicine: (plotId: number) => void = () => {};

  private labels = new Map<string, Label | null>();
  private cache = new Map<string, string>();
  private moistureFill: Sprite | null = null;
  private moistureRangeNode: Node | null = null;
  private fertilityFill: Sprite | null = null;
  private fertilityRangeNode: Node | null = null;
  private medicineButton: Node | null = null;
  private scroll: ScrollView | null = null;

  /** 字段名 → 文本。新增一行只要在这里加一个键，并在场景里放一个同名 Label。 */
  private static readonly TEXT: Record<string, (panel: SoilInfoPanel, plot: PlotData, model: FarmModel) => string> = {
    plotId: (_panel, plot) => `第 ${plot.id} 块土地`,
    season: () => currentWorld().seasonName || EMPTY,
    weather: () => currentWorld().weatherName || EMPTY,
    temp: () => `${currentWorld().temperature.toFixed(1)}℃`,
    moisture: (_panel, plot) => `${Math.round(plot.moisture)} / 100`,
    fertility: (_panel, plot) => `${Math.round(plot.fertility)} / 100`,
    soilState: (panel, plot, model) => soilStyle(model.landState(plot, panel.alertGap)).name,

    cropName: (_panel, plot) => getCropDef(plot.crop)?.name ?? '空地（可播种）',
    cropStage: (_panel, plot) => (plot.crop ? `第 ${plot.stage} / 3 阶段` : EMPTY),
    growth: (_panel, plot) => (plot.crop ? `${Math.floor(plot.stageGrowth)} / 100` : EMPTY),
    growthSpeed: (_panel, plot) => (plot.crop && !plot.mature
      ? `+${plot.growthPerMinute.toFixed(2)} 成长值/分钟` : EMPTY),
    remainingTime: (_panel, plot, model) => {
      if (!plot.crop) return EMPTY;
      if (plot.mature) return '已成熟';
      const minutes = model.remainingMinutes(plot);
      return minutes >= 60 ? `约 ${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `约 ${minutes} 分钟`;
    },
    harvestCount: (_panel, plot) => `预计产量 ${plot.matureYield || LAND.BASE_YIELD}`,

    fertilizerName: (_panel, plot) => listBy(plot.activeFertilizers, item => fertilizerName(item.id)),
    fertilizerType: (_panel, plot) => listBy(plot.activeFertilizers, item => {
      const definition = getFertilizerDef(item.id);
      const type = definition ? fertilizerTypeLabel(definition.type) : EMPTY;
      return item.best ? `${type}·本阶段最佳` : type;
    }),
    fertilizerTime: (_panel, plot) => listBy(plot.activeFertilizers, item => `剩余 ${Math.ceil(item.remainingMinutes)} 分钟`),

    pest: (_panel, plot) => (plot.pest.status === 'ACTIVE' ? `害虫 Lv.${Math.round(plot.pest.level)}` : '无害虫'),
    disease: (_panel, plot) => (plot.disease.status === 'ACTIVE' ? `病害 Lv.${Math.round(plot.disease.level)}` : '无病害'),
    matureState: (_panel, plot) => (plot.mature ? '已成熟，可采摘' : (plot.crop ? '生长中' : '未播种')),
    harvestYield: (_panel, plot) => `收获数量 ${plot.harvestQuantity}`,
    quality: (_panel, plot) => {
      if (!plot.crop) return EMPTY;
      const grade = qualityGrade(plot.quality);
      const name = plot.qualityGrade || grade?.name || EMPTY;
      const multiplier = plot.qualityMultiplier || grade?.multiplier || 1;
      return `${name} ×${multiplier.toFixed(2)}（${Math.round(plot.quality)} 分）`;
    },
    lockPrice: (_panel, plot) => {
      if (plot.unlocked) return '已解锁';
      const row = unlockRow(plot.id) ?? plot.unlock;
      return row ? `${row.price} 金币 / ${row.minLevel} 级解锁` : '暂不可解锁';
    },
    plantLimit: (_panel, plot) => {
      const limit = plot.dailyPlantLimit || LAND.DAILY_PLANT_LIMIT;
      return `今日播种 ${plot.dailyPlantCount}/${limit}${plot.dailyPlantCount >= limit ? '（已用完）' : ''}`;
    },
  };

  onLoad(): void {
    closeOnOutsideTouch(this, () => this.close());
    this.moistureBar = this.moistureBar || findChild(this.node, 'bar_moisture', 'moistureBar');
    this.fertilityBar = this.fertilityBar || findChild(this.node, 'bar_fertility', 'fertilityBar');
    this.moistureFill = this.moistureBar ? findSprite(this.moistureBar, 'fill') : null;
    this.moistureRangeNode = this.moistureBar ? findChild(this.moistureBar, 'range') : null;
    this.fertilityFill = this.fertilityBar ? findSprite(this.fertilityBar, 'fill') : null;
    this.fertilityRangeNode = this.fertilityBar ? findChild(this.fertilityBar, 'range') : null;
    this.scroll = this.scrollViewComp
      || findChild(this.node, 'ScrollView')?.getComponent(ScrollView) || null;
    this.medicineButton = findChild(this.node, 'btn_medicine', 'medicineButton');
    bindClick(this.medicineButton, () => {
      if (this.currentPlotId) this.onRequestMedicine(this.currentPlotId);
    });
    this.labels = new Map(Object.keys(SoilInfoPanel.TEXT).map(key => [key, findLabel(this.node, key)]));
    this.node.active = false;
  }

  /** 换图阈值：属性优先，其次表格值 */
  get alertGap(): number {
    return this.soilAlertGap > 0 ? this.soilAlertGap : LAND.SOIL_ALERT_GAP;
  }

  open(plot: PlotData, model: FarmModel): void {
    this.currentPlotId = plot.id;
    this.isOpen = true;
    this.node.active = true;
    showOnTop(this.node);
    this.cache.clear();
    this.render(plot, model);
    this.scroll?.scrollToTop(0);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.node.active = false;
    this.currentPlotId = 0;
  }

  /** 快照每次刷新都会调用：只有值变化的 Label 才写字，避免反复触发布局 */
  render(plot: PlotData, model: FarmModel): void {
    if (!plot || plot.id !== this.currentPlotId) return;
    Object.keys(SoilInfoPanel.TEXT).forEach(key => {
      const label = this.labels.get(key);
      if (!label) return;
      const value = SoilInfoPanel.TEXT[key](this, plot, model);
      if (this.cache.get(key) === value) return;
      this.cache.set(key, value);
      label.string = value;
    });

    setBar(this.moistureFill, plot.moisture / 100);
    setBar(this.fertilityFill, plot.fertility / 100);
    setRange(this.moistureRangeNode, this.moistureBar, model.moistureRange(plot));
    // 肥力区间 = 目标肥力 ± 换图阈值，与土块显示逻辑保持同一口径
    setRange(this.fertilityRangeNode, this.fertilityBar, model.fertilityRange(plot, this.alertGap));
    setActive(this.medicineButton, plot.pest.status === 'ACTIVE' || plot.disease.status === 'ACTIVE');
  }
}

/** 生效中的肥料 / 药品列表：空则显示占位符，多行按行对齐 */
function listBy(rows: ActiveFertilizer[], pick: (row: ActiveFertilizer) => string): string {
  return rows.length ? rows.map(pick).join('\n') : EMPTY;
}
