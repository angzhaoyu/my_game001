/**
 * ui/Toast.ts —— 飘字提示（绑定 farm.scene 中的 Toast 节点）
 */
import { _decorator, Color, Component, Label, tween, UIOpacity } from 'cc';
const { ccclass } = _decorator;

const GOLD = new Color(255, 233, 176, 255);

@ccclass('Toast')
export class Toast extends Component {
  private lb: Label | null = null;

  onLoad() {
    const labelNode = this.node?.getChildByName('ToastLabel') || (this.node?.children.length ? this.node.children[0] : null);
    if (labelNode) {
      this.lb = labelNode.getComponent(Label);
    }
    if (this.node) {
      this.node.active = false;
    }
  }

  show(msg: string, duration = 1.2) {
    if (this.lb) {
      this.lb.string = msg;
    }
    const op = this.getComponent(UIOpacity) || this.node?.addComponent(UIOpacity);
    if (op) {
      op.opacity = 255;
    }
    if (this.node) {
      this.node.active = true;
    }
    if (op) {
      tween(op).stop();
      tween(op).delay(duration).to(0.25, { opacity: 0 }).call(() => {
        if (this.node) this.node.active = false;
      }).start();
    }
  }
}
