/**
 * ui/WaterPrompt.ts —— 浇水次数选择框
 *
 * 节点在 Cocos 里摆好：次数按钮（`btn_1`…`btn_5`）由编辑器摆放，代码只读取子节点名称里的数字
 * 并绑定点击。确认后进入「浇水光标跟随鼠标」状态，点到土块即浇水并唤醒该地块的 fx_watering。
 */
import { _decorator, Component, Label, Node } from 'cc';
import { LAND } from '../config/LandConfig';
import { bindClick, closeOnOutsideTouch, findChild, showOnTop } from './NodeUtils';

const { ccclass, property } = _decorator;

@ccclass('WaterPrompt')
export class WaterPrompt extends Component {
  @property(Node) public timesRoot: Node | null = null;
  @property(Node) public confirmButton: Node | null = null;
  @property(Node) public closeButton: Node | null = null;
  @property(Label) public hintLabel: Label | null = null;

  isOpen = false;
  onConfirm: (times: number) => void = () => {};

  private times = 1;

  onLoad(): void {
    closeOnOutsideTouch(this, () => this.close());
    this.timesRoot = this.timesRoot || findChild(this.node, 'times');
    this.timesRoot?.children.forEach(child => {
      const matched = /(\d+)/.exec(child.name);
      if (!matched) return;
      const times = Math.max(1, Math.min(LAND.WATER_MAX_TIMES, Number(matched[1])));
      child.off(Node.EventType.TOUCH_END);
      child.on(Node.EventType.TOUCH_END, () => this.select(times));
    });
    bindClick(this.confirmButton || findChild(this.node, 'btn_confirm'), () => {
      const times = this.times;
      this.close();
      this.onConfirm(times);
    });
    bindClick(this.closeButton || findChild(this.node, 'btn_close'), () => this.close());
    this.node.active = false;
  }

  open(): void {
    this.isOpen = true;
    this.node.active = true;
    showOnTop(this.node);
    this.select(this.times || 1);
  }

  close(): void {
    this.isOpen = false;
    this.node.active = false;
  }

  /** 选中态只改缩放，不改节点结构 */
  private select(times: number): void {
    this.times = times;
    this.timesRoot?.children.forEach(child => {
      const matched = /(\d+)/.exec(child.name);
      const active = !!matched && Number(matched[1]) === times;
      if (child.isValid) child.setScale(active ? 1.08 : 1, active ? 1.08 : 1, 1);
    });
    if (this.hintLabel) {
      this.hintLabel.string = `每次 +${LAND.WATER_PER_USE} 湿度，共 +${LAND.WATER_PER_USE * times}`;
    }
  }
}
