/**
 * ui/ShopPanel.ts —— 商店面板逻辑（参考 BackpackPanel 实现）
 */
import { _decorator, Button, Color, Component, EventTouch, Label, Layout, Node, ScrollView, Size, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { InventoryModel } from '../data/InventoryModel';
import { PlayerModel } from '../data/PlayerModel';
import type { ShopDef } from '../data/ItemData';
import { SHOP_ITEMS } from '../config/ItemConfig';
import { ShopItem } from './ShopItem';
import type { GameActionHandler } from '../GameAction';

const { ccclass } = _decorator;

const C_TITLE   = new Color(255, 233, 176, 255);
const C_TEXT    = new Color(243, 232, 207, 255);
const C_TEXT_D  = new Color(58, 42, 18, 255);

@ccclass('ShopPanel')
export class ShopPanel extends Component {
  inventory!: InventoryModel;
  player!: PlayerModel;
  onToast: (msg: string, duration?: number) => void = () => {};
  onAction: GameActionHandler = async () => ({ ok: false, message: '网络服务尚未就绪' });

  private panelNode: Node | null = null;
  private pendingItems = new Set<string>();
  private scrollView: ScrollView | null = null;
  private contentNode: Node | null = null;
  private goldLabel: Label | null = null;
  private tabs: { node: Node; lb: Label | null; cat: 'seed' | 'fert' }[] = [];

  private category: 'seed' | 'fert' = 'seed';
  isOpen = false;

  onLoad() {
    this.bindNodes();
    this.node.active = false;
  }

  private bindNodes() {
    this.node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      if (e.target === this.node) this.close();
    });

    this.panelNode = this.node.getChildByName('Panel') || this.node;
    const toolbar = this.findDescendant(this.panelNode, 'toolbar');
    const header = this.findDescendant(this.panelNode, 'header');
    const scroll = this.findDescendant(this.panelNode, 'ScrollView');
    const footer = this.findDescendant(this.panelNode, 'Footer') || this.findDescendant(this.panelNode, 'footer');

    if (scroll) {
      this.scrollView = scroll.getComponent(ScrollView);
      if (this.scrollView) {
        this.scrollView.verticalScrollBar = null;
      }
      const viewNode = scroll.getChildByName('view');
      if (viewNode) {
        this.contentNode = viewNode.getChildByName('content');
        if (this.scrollView && this.contentNode) {
          this.scrollView.content = this.contentNode;
        }
      }
    }

    if (this.contentNode) {
      let layout = this.contentNode.getComponent(Layout) || this.contentNode.addComponent(Layout);
      layout.cellSize = new Size(97.33, 97.33);
      const ut = this.contentNode.getComponent(UITransform);
      if (ut) {
        ut.setAnchorPoint(0.5, 1);
      }
    }

    if (header) {
      const closeBtn = header.getChildByName('CloseBth') || header.getChildByName('close_btn') || header.getChildByName('CloseBtn');
      if (closeBtn) {
        closeBtn.off(Button.EventType.CLICK);
        closeBtn.on(Button.EventType.CLICK, () => this.close());
      }
    }

    if (toolbar) {
      const catList: ('seed' | 'fert')[] = ['seed', 'fert'];
      const tabNames = ['tab', 'tab-001'];
      tabNames.forEach((name, i) => {
        const tabNode = toolbar.getChildByName(name);
        if (tabNode) {
          const lb = tabNode.getComponentInChildren(Label);
          const cat = catList[i];
          tabNode.off(Button.EventType.CLICK);
          tabNode.on(Button.EventType.CLICK, () => this.setCategory(cat));
          this.tabs.push({ node: tabNode, lb, cat });
        }
      });
    }

    if (footer) {
      this.goldLabel = footer.getComponentInChildren(Label);
    }

    this.refreshTab();
  }

  /**
   * 把 content 及其子节点（商品卡）的 z 归零。
   * 预制体实例可能带着很深的 z（卡片 -2000），叠加面板自身 -1000 后会超出相机远裁剪面(far=2000)
   * 被裁掉，导致 ScrollView/view 下面整块看不见。归零即与其它 UI 同层渲染。
   */
  private normalizeDepth() {
    if (!this.contentNode) return;
    const p = this.contentNode.position;
    this.contentNode.setPosition(p.x, p.y, 0);
    for (const child of this.contentNode.children) {
      const c = child.position;
      child.setPosition(c.x, c.y, 0);
    }
  }

  private findDescendant(root: Node | null, name: string): Node | null {
    if (!root) return null;
    if (root.name === name) return root;
    for (const child of root.children) {
      const found = this.findDescendant(child, name);
      if (found) return found;
    }
    return null;
  }

  open() {
    this.isOpen = true;
    this.node.active = true;
    this.render();
    this.normalizeDepth();
    if (this.panelNode) {
      const op = this.panelNode.getComponent(UIOpacity) || this.panelNode.addComponent(UIOpacity);
      op.opacity = 0;
      this.panelNode.setScale(0.9, 0.9, 1);
      tween(op).stop();
      tween(op).to(0.18, { opacity: 255 }).start();
      tween(this.panelNode).stop();
      tween(this.panelNode).to(0.22, { scale: new Vec3(1, 1, 1) }).start();
    }
  }

  close() {
    this.isOpen = false;
    this.node.active = false;
  }

  render() {
    if (!this.contentNode) return;
    const list: ShopDef[] = SHOP_ITEMS.filter(s => s.category === this.category);
    const children = this.contentNode.children;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (i < list.length) {
        child.active = true;
        let si = child.getComponent(ShopItem) || child.addComponent(ShopItem);
        si.init(list[i], this.player.gold >= list[i].price && !this.pendingItems.has(list[i].id), (d) => { void this.buy(d); });
      } else {
        child.active = false;
      }
    }

    // 复用第一个卡片作为模板克隆补齐（不再 new 空节点）
    const template = children.length > 0 ? children[0] : null;
    for (let i = children.length; i < list.length; i++) {
      if (!template) break;
      const def = list[i];
      const item = template.clone();
      item.active = true;
      const si = item.getComponent(ShopItem) || item.addComponent(ShopItem);
      si.init(def, this.player.gold >= def.price && !this.pendingItems.has(def.id), (d) => { void this.buy(d); });
      this.contentNode.addChild(item);
    }

    const layout = this.contentNode.getComponent(Layout);
    const ut = this.contentNode.getComponent(UITransform);
    if (ut) {
      ut.setAnchorPoint(0.5, 1);
    }
    if (layout) {
      layout.cellSize = new Size(97.33, 97.33);
      layout.updateLayout();
    }
    this.normalizeDepth();
    if (this.goldLabel) {
      this.goldLabel.string = `金币：${this.player.gold} · 在售 ${list.length} 种`;
    }
    if (this.scrollView) {
      this.scrollView.scrollToTop(0);
    }
  }

  private setCategory(c: 'seed' | 'fert') {
    this.category = c;
    this.refreshTab();
    this.render();
  }

  private refreshTab() {
    const idx = ['seed', 'fert'].indexOf(this.category);
    this.tabs.forEach((t, i) => {
      const active = i === idx;
      if (t.lb) {
        t.lb.color = active ? C_TEXT_D : C_TEXT;
        t.lb.isBold = active;
      }
    });
  }

  private async buy(def: ShopDef) {
    if (this.pendingItems.has(def.id)) return;
    if (this.player.gold < def.price) { this.onToast('金币不足'); return; }
    this.pendingItems.add(def.id);
    this.render();
    try {
      const result = await this.onAction('buy_item', { itemId: def.id, quantity: 1 });
      this.onToast(result.message);
    } finally {
      this.pendingItems.delete(def.id);
      this.render();
    }
  }
}