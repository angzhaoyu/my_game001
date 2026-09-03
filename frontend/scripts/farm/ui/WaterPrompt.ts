/**
 * ui/WaterPrompt.ts —— 浇水次数选择框
 *
 * 节点在 Cocos 里搭好：次数按钮（btn_1…btn_5）由编辑器摆放，代码只读取子节点
 * 并绑定点击。确认后进入「浇水光标跟随鼠标」状态，碰到土块即浇水并唤醒土块动画。
 */
import { _decorator, Button, Component, Label, Node } from 'cc';
import { LAND } from '../config/LandConfig';

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
  private buttons: { node: Node; times: number }[] = [];

  onLoad() {
    this.node.on(Node.EventType.TOUCH_END, (event: any) => {
      if (event?.target === this.node) this.close(0);
    });
    if (this.timesRoot) {
      this.timesRoot.children.forEach(child => {
        const matched = /(\d+)/.exec(child.name);
        const times = matched ? Math.max(1, Math.min(LAND.WATER_MAX_TIMES, Number(matched[1]))) : 0;
        if (!times) return;
        child.off(Button.EventType.CLICK);
        child.on(Button.EventType.CLICK, () => this.select(times));
        this.buttons.push({ node: child, times });
      });
    }
    if (this.confirmButton) {
      this.confirmButton.off(Button.EventType.CLICK);
      this.confirmButton.on(Button.EventType.CLICK, () => {
        const times = this.times;
        this.close(0);
        this.onConfirm(times);
      });
    }
    if (this.closeButton) {
      this.closeButton.off(Button.EventType.CLICK);
      this.closeButton.on(Button.EventType.CLICK, () => this.close(0));
    }
    this.node.active = false;
  }

  open(): void {
    this.isOpen = true;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this.select(this.times || 1);
  }

  close(times = 0): void {
    this.isOpen = false;
    this.node.active = false;
    if (times > 0) this.onConfirm(times);
  }

  private select(times: number): void {
    this.times = times;
    this.buttons.forEach(button => {
      const active = button.times === times;
      const transform = button.node;
      if (transform.isValid) transform.setScale(active ? 1.08 : 1, active ? 1.08 : 1, 1);
    });
    if (this.hintLabel) {
      this.hintLabel.string = `每次 +${LAND.WATER_PER_USE} 湿度，共 +${LAND.WATER_PER_USE * times}`;
    }
  }
}
