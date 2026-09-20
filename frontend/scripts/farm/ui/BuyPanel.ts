/**
 * ui/BuyPanel.ts —— 购买确认面板
 *
 * 预制体结构：
 *   Buy
 *   ├─ Header
 *   │  ├─ header        Sprite
 *   │  ├─ close         Button  关闭按钮
 *   │  └─ title         Label   「购买」
 *   ├─ Body
 *   │  ├─ Icon
 *   │  │  └─ ShopItem   （默认隐藏 price 和 buy 节点）
 *   │  ├─ numbers
 *   │  │  ├─ bg         Sprite  背景
 *   │  │  ├─ minus      Button  减号
 *   │  │  ├─ munber
 *   │  │  │  └─ number   Label  默认[1]
 *   │  │  ├─ plus       Button  加号
 *   │  │  ├─ lb_name-001 Label  「单价：5 金币」
 *   │  │  └─ lb_name-002 Label  「总价：25 金币」
 *   │  ├─ cancel
 *   │  │  └─ label      Label
 *   │  └─ confirm
 *   │     └─ label      Label
 *
 * 逻辑：
 * - ShopItem 中 price 和 buy 节点默认隐藏
 * - minus/plus 改变 number
 * - lb_name-001/002 中的数字根据物品和数量显示
 * - confirm 确认后用户数据改变
 * - 数量不能低于1，不能大于最大金币可购买数
 * - 双击 munber 可以自行输入数字
 */
import { _decorator, Button, Component, EditBox, Label, Node } from 'cc';
import type { ShopDef } from '../data/ItemData';
import { ShopItem } from './ShopItem';
import type { GameActionHandler } from '../GameAction';

const { ccclass, property } = _decorator;

@ccclass('BuyPanel')
export class BuyPanel extends Component {
  @property(Node) public shopItemNode: Node | null = null;
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
  getPlayerGold: () => number = () => 0;
  onRefresh: () => void = () => {};

  private currentDef: ShopDef | null = null;
  private quantity = 1;
  private pending = false;

  onLoad() {
    this.node.on(Node.EventType.TOUCH_END, (event: any) => {
      if (event?.target === this.node) this.close();
    });
    this.node.active = false;
  }

  open(def: ShopDef): void {
    this.currentDef = def;
    this.quantity = 1;
    this.isOpen = true;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);

    // 隐藏 ShopItem 中的 price 和 buy 节点
    if (this.shopItemNode) {
      const priceNode = this.findDescendant(this.shopItemNode, 'price');
      const buyNode = this.findDescendant(this.shopItemNode, 'buy');
      if (priceNode) priceNode.active = false;
      if (buyNode) buyNode.active = false;

      // 初始化 ShopItem 显示
      const shopItem = this.shopItemNode.getComponent(ShopItem) || this.shopItemNode.addComponent(ShopItem);
      shopItem.init(def, true, () => {});
    }

    this.bindButtons();
    this.bindDoubleClick();
    this.refreshDisplay();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.node.active = false;
    this.currentDef = null;
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
      this.confirmBtn.on(Button.EventType.CLICK, () => { void this.confirmPurchase(); });
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
        // 双击：弹出输入框（复用 EditBox 或简单 prompt）
        this.promptNumber();
      }
      lastClick = now;
    });
  }

  /** 弹出数字输入（使用 Cocos EditBox 或浏览器 prompt 兜底） */
  private promptNumber(): void {
    // 尝试在 munber 节点上动态创建 EditBox
    const munberNode = this.findDescendant(this.node, 'munber');
    if (!munberNode || !this.currentDef) return;

    // 简单实现：如果场景有预制 EditBox 节点则使用，否则跳过
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
    if (!this.currentDef) return 1;
    const gold = this.getPlayerGold();
    return Math.max(1, Math.floor(gold / this.currentDef.price));
  }

  private refreshDisplay(): void {
    if (!this.currentDef) return;

    // number label
    if (this.numberNode) {
      const lb = this.numberNode.getComponent(Label) || this.numberNode.getComponentInChildren(Label);
      if (lb) lb.string = String(this.quantity);
    }

    // 单价
    if (this.unitPriceLabel) {
      this.unitPriceLabel.string = `单价：${this.currentDef.price} 金币`;
    }

    // 总价
    if (this.totalPriceLabel) {
      const total = this.currentDef.price * this.quantity;
      this.totalPriceLabel.string = `总价：${total} 金币`;
    }
  }

  private async confirmPurchase(): Promise<void> {
    if (!this.currentDef || this.pending) return;
    if (this.quantity < 1) { this.onToast('数量不能低于1'); return; }
    const totalCost = this.currentDef.price * this.quantity;
    if (totalCost > this.getPlayerGold()) {
      this.onToast('金币不足');
      return;
    }

    this.pending = true;
    try {
      const result = await this.onAction('buy_item', {
        itemId: this.currentDef.id,
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
