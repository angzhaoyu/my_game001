/**
 * ui/WaterPrompt.ts —— 浇水次数选择框
 *
 * 预制体结构：
 *   WaterPrompt（挂载在 WaterPrompt 节点下）
 *   ├─ Header
 *   │  ├─ header        Sprite
 *   │  ├─ close         Button  关闭按钮
 *   │  └─ title         Label   「浇 水」
 *   ├─ Body
 *   │  ├─ numbers
 *   │  │  ├─ minus      Button  减号
 *   │  │  ├─ munber
 *   │  │  │  └─ number   Label  默认[1]
 *   │  │  └─ plus       Button  加号
 *   │  ├─ cancel
 *   │  │  └─ label      Label
 *   │  └─ confirm
 *   │     └─ label      Label
 *
 * 确认后鼠标变成水壶，点击激活的土地，然后水壶消失，触发浇水动画。
 */
import { _decorator, Button, Component, EditBox, Label, Node } from 'cc';
import { LAND } from '../config/LandConfig';

const { ccclass, property } = _decorator;

@ccclass('WaterPrompt')
export class WaterPrompt extends Component {
  @property(Node) public minusBtn: Node | null = null;
  @property(Node) public plusBtn: Node | null = null;
  @property(Node) public numberNode: Node | null = null;
  @property(Node) public confirmButton: Node | null = null;
  @property(Node) public closeButton: Node | null = null;
  @property(Node) public cancelBtn: Node | null = null;

  isOpen = false;
  onConfirm: (times: number) => void = () => {};

  private times = 1;

  onLoad() {
    this.node.on(Node.EventType.TOUCH_END, (event: any) => {
      if (event?.target === this.node) this.close(0);
    });

    if (this.minusBtn) {
      this.minusBtn.off(Button.EventType.CLICK);
      this.minusBtn.on(Button.EventType.CLICK, () => {
        if (this.times > 1) {
          this.times--;
          this.refreshDisplay();
        }
      });
    }

    if (this.plusBtn) {
      this.plusBtn.off(Button.EventType.CLICK);
      this.plusBtn.on(Button.EventType.CLICK, () => {
        if (this.times < LAND.WATER_MAX_TIMES) {
          this.times++;
          this.refreshDisplay();
        }
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

    if (this.cancelBtn) {
      this.cancelBtn.off(Button.EventType.CLICK);
      this.cancelBtn.on(Button.EventType.CLICK, () => this.close(0));
    }

    // 双击 munber 节点可以手动输入数字
    this.bindDoubleClick();

    this.node.active = false;
  }

  open(): void {
    this.isOpen = true;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    this.times = this.times || 1;
    this.refreshDisplay();
  }

  close(times = 0): void {
    this.isOpen = false;
    this.node.active = false;
    if (times > 0) this.onConfirm(times);
  }

  private refreshDisplay(): void {
    if (this.numberNode) {
      const lb = this.numberNode.getComponent(Label) || this.numberNode.getComponentInChildren(Label);
      if (lb) lb.string = String(this.times);
    }
  }

  /** 双击 munber 节点可以手动输入数字 */
  private bindDoubleClick(): void {
    const munberNode = this.findDescendant(this.node, 'munber');
    if (!munberNode) return;

    let lastClick = 0;
    munberNode.off(Node.EventType.TOUCH_END);
    munberNode.on(Node.EventType.TOUCH_END, () => {
      const now = Date.now();
      if (now - lastClick <= 400) {
        this.promptNumber();
      }
      lastClick = now;
    });
  }

  private promptNumber(): void {
    const munberNode = this.findDescendant(this.node, 'munber');
    if (!munberNode) return;

    const editBox = munberNode.getComponent(EditBox);
    if (editBox) {
      editBox.string = String(this.times);
      editBox.node.active = true;
      editBox.node.once(EditBox.EventType.EDITING_RETURN, () => {
        const val = parseInt(editBox.string, 10);
        if (!isNaN(val) && val >= 1) {
          this.times = Math.min(val, LAND.WATER_MAX_TIMES);
          this.refreshDisplay();
        }
        editBox.node.active = false;
      });
      editBox.setFocus();
    }
  }

  private findDescendant(root: Node, name: string): Node | null {
    if (root.name === name) return root;
    for (const child of root.children) {
      const found = this.findDescendant(child, name);
      if (found) return found;
    }
    return null;
  }
}
