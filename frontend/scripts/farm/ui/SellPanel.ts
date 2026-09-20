/**
 * ui/SellPanel.ts —— 出售确认面板（与 BuyPanel 结构相同，但使用 BackpackItem）
 *
 * 预制体结构与 BuyPanel 相同：
 *   Sell
 *   ├─ Header
 *   │  ├─ header        Sprite
 *   │  ├─ close         Button  关闭按钮
 *   │  └─ title         Label   「出售」
 *   ├─ Body
 *   │  ├─ Icon
 *   │  │  └─ BackpackItem  （默认隐藏 price 和 buy 节点）
 *   │  ├─ numbers
 *   │  │  ├─ bg         Sprite
 *   │  │  ├─ minus      Button
 *   │  │  ├─ munber
 *   │  │  │  └─ number   Label  默认[1]
 *   │  │  ├─ plus       Button
 *   │  │  ├─ lb_name-001 Label  「单价：X 金币」
 *   │  │  └─ lb_name-002 Label  「总价：X 金币」
 *   │  ├─ cancel
 *   │  │  └─ label      Label
 *   │  └─ confirm
 *   │     └─ label      Label
 *
 * 数量不能低于1，不能大于背包中该物品的数量。
 */
import { _decorator, Button, Component, EditBox, Label, Node } from 'cc';
import type { InventoryStack } from '../data/ItemData';
import { QUALITY_GRADE_MULTIPLIERS } from '../data/ItemData';
import { BackpackItem } from './BackpackItem';
import type { GameActionHandler } from '../GameAction';

const { ccclass, property } = _decorator;

@ccclass('SellPanel')
export class SellPanel extends Component {
  @property(Node) public backpackItemNode: Node | null = null;
  @property(Node) public minusBtn: Node | null = null;
  @property(Node) public plusBtn: Node | null = null;
  @property(Node) public numberNode: Node | null = null;
  @property(Label) public unitPriceLabel: Label | null = null;
  @property(Label) public totalPriceLabel: Label | null = null;
  @property(Node) public cancelBtn: Node | null = null;
  @property(Node) public confirmBtn: Node | null = null;
  @property(Node) public closeBtn: Node | null = null;

  isOpen = false;
  onToast: (msg: string, duration?: number) => void = () => {};
  onAction: GameActionHandler = async () => ({ ok: false, message: '网络服务尚未就绪' });
  onRefresh: () => void = () => {};

  private currentStack: InventoryStack | null = null;
  private quantity = 1;
  private pending = false;

  onLoad() {
    this.node.on(Node.EventType.TOUCH_END, (event: any) => {
      if (event?.target === this.node) this.close();
    });
    this.node.active = false;
  }

  open(stack: InventoryStack): void {
    this.currentStack = stack;
    this.quantity = 1;
    this.isOpen = true;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);

    // 隐藏 BackpackItem 中的 price 和 buy 节点
    if (this.backpackItemNode) {
      const priceNode = this.findDescendant(this.backpackItemNode, 'price');
      const buyNode = this.findDescendant(this.backpackItemNode, 'buy');
      if (priceNode) priceNode.active = false;
      if (buyNode) buyNode.active = false;

      // 初始化 BackpackItem 显示
      const bpItem = this.backpackItemNode.getComponent(BackpackItem)
        || this.backpackItemNode.addComponent(BackpackItem);
      bpItem.init(stack, () => {}, () => {});
    }

    this.bindButtons();
    this.bindDoubleClick();
    this.refreshDisplay();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.node.active = false;
    this.currentStack = null;
  }

  private bindButtons(): void {
    if (this.minusBtn) {
      this.minusBtn.off(Button.EventType.CLICK);
      this.minusBtn.on(Button.EventType.CLICK, () => {
        if (this.quantity > 1) {
          this.quantity--;
          this.refreshDisplay();
        }
      });
    }

    if (this.plusBtn) {
      this.plusBtn.off(Button.EventType.CLICK);
      this.plusBtn.on(Button.EventType.CLICK, () => {
        const maxQty = this.getMaxQuantity();
        if (this.quantity < maxQty) {
          this.quantity++;
          this.refreshDisplay();
        }
      });
    }

    if (this.cancelBtn) {
      this.cancelBtn.off(Button.EventType.CLICK);
      this.cancelBtn.on(Button.EventType.CLICK, () => this.close());
    }

    if (this.closeBtn) {
      this.closeBtn.off(Button.EventType.CLICK);
      this.closeBtn.on(Button.EventType.CLICK, () => this.close());
    }

    if (this.confirmBtn) {
      this.confirmBtn.off(Button.EventType.CLICK);
      this.confirmBtn.on(Button.EventType.CLICK, () => { void this.confirmSell(); });
    }
  }

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
    if (!munberNode || !this.currentStack) return;

    const editBox = munberNode.getComponent(EditBox);
    if (editBox) {
      editBox.string = String(this.quantity);
      editBox.node.active = true;
      editBox.node.once(EditBox.EventType.EDITING_RETURN, () => {
        const val = parseInt(editBox.string, 10);
        if (!isNaN(val) && val >= 1) {
          this.quantity = Math.min(val, this.getMaxQuantity());
          this.refreshDisplay();
        }
        editBox.node.active = false;
      });
      editBox.setFocus();
    }
  }

  private getMaxQuantity(): number {
    if (!this.currentStack) return 1;
    return Math.max(1, this.currentStack.count);
  }

  /** 计算单价（考虑品质倍率） */
  private getUnitPrice(): number {
    if (!this.currentStack) return 0;
    let price = this.currentStack.value;
    if (this.currentStack.category === 'fruit' && this.currentStack.qualityGrade) {
      const mult = QUALITY_GRADE_MULTIPLIERS[this.currentStack.qualityGrade] || 1;
      price = Math.round(price * mult);
    }
    return price;
  }

  private refreshDisplay(): void {
    if (!this.currentStack) return;
    const unitPrice = this.getUnitPrice();

    if (this.numberNode) {
      const lb = this.numberNode.getComponent(Label) || this.numberNode.getComponentInChildren(Label);
      if (lb) lb.string = String(this.quantity);
    }

    if (this.unitPriceLabel) {
      this.unitPriceLabel.string = `单价：${unitPrice} 金币`;
    }

    if (this.totalPriceLabel) {
      const total = unitPrice * this.quantity;
      this.totalPriceLabel.string = `总价：${total} 金币`;
    }
  }

  private async confirmSell(): Promise<void> {
    if (!this.currentStack || this.pending) return;
    if (this.quantity < 1) { this.onToast('数量不能低于1'); return; }
    if (this.quantity > this.currentStack.count) {
      this.onToast('数量不能超过拥有数量');
      return;
    }

    this.pending = true;
    try {
      const result = await this.onAction('sell_item', {
        itemId: this.currentStack.id,
        quantity: this.quantity,
      });
      this.onToast(result.message);
      if (result.ok) {
        this.onRefresh();
      }
      this.close();
    } finally {
      this.pending = false;
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
