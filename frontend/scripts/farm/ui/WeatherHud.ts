/**
 * ui/WeatherHud.ts —— 季节 / 天气 / 温度显示
 *
 * 按需求只做简单显示：三个 Label，不做动画，也不自己计算数值。
 * 数值来自服务端快照的 `world`（服务端按现实时间确定性结算）。
 */
import { _decorator, Component, Label } from 'cc';
import { currentWorld, seasonName, weatherName } from '../config/WeatherConfig';

const { ccclass, property } = _decorator;

@ccclass('WeatherHud')
export class WeatherHud extends Component {
  @property(Label) public seasonLabel: Label | null = null;
  @property(Label) public weatherLabel: Label | null = null;
  @property(Label) public temperatureLabel: Label | null = null;
  @property(Label) public dayLabel: Label | null = null;

  onLoad() {
    this.refresh();
  }

  refresh(): void {
    const world = currentWorld();
    if (this.seasonLabel) this.seasonLabel.string = `季节：${world.seasonName || seasonName(world.season)}`;
    if (this.weatherLabel) this.weatherLabel.string = `天气：${world.weatherName || weatherName(world.weather)}`;
    if (this.temperatureLabel) this.temperatureLabel.string = `温度：${world.temperature.toFixed(1)}℃`;
    if (this.dayLabel) this.dayLabel.string = `第 ${world.dayIndex} 天`;
  }
}
