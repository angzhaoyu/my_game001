/**
 * ui/WeatherHud.ts —— 季节 / 天气 / 温度显示
 *
 * 简化为单个 Label 显示所有信息：
 *   WeatherHud     Node      天气栏（挂载 WeatherHud.ts，只有 Label，不做动画）
 *   ├─ lb_info     Label    「季节：夏    天气：晴    温度：28.4℃」
 *
 * 数值来自服务端快照的 `world`（服务端按现实时间确定性结算）。
 */
import { _decorator, Component, Label } from 'cc';
import { currentWorld, seasonName, weatherName } from '../config/WeatherConfig';

const { ccclass, property } = _decorator;

@ccclass('WeatherHud')
export class WeatherHud extends Component {
  /** 单个信息框，显示「季节：夏    天气：晴    温度：28.4℃」 */
  @property(Label) public infoLabel: Label | null = null;

  /** 兼容旧场景：如果有分开 Label 也可继续绑定 */
  @property(Label) public seasonLabel: Label | null = null;
  @property(Label) public weatherLabel: Label | null = null;
  @property(Label) public temperatureLabel: Label | null = null;
  @property(Label) public dayLabel: Label | null = null;

  onLoad() {
    this.refresh();
  }

  refresh(): void {
    const world = currentWorld();
    const season = world.seasonName || seasonName(world.season);
    const weather = world.weatherName || weatherName(world.weather);
    const temp = world.temperature.toFixed(1);

    // 单 Label 模式（新场景结构）
    if (this.infoLabel) {
      this.infoLabel.string = `季节：${season}    天气：${weather}    温度：${temp}℃`;
    }

    // 兼容旧场景（分离 Label）
    if (this.seasonLabel) this.seasonLabel.string = `季节：${season}`;
    if (this.weatherLabel) this.weatherLabel.string = `天气：${weather}`;
    if (this.temperatureLabel) this.temperatureLabel.string = `温度：${temp}℃`;
    if (this.dayLabel) this.dayLabel.string = `第 ${world.dayIndex} 天`;
  }
}
