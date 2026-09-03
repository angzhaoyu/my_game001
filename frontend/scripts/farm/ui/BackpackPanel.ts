/**
 * ui/BackpackPanel.ts —— 背包面板逻辑（绑定 farm.scene 中的 BackpackPanel 节点）
 */
import { _decorator, Button, Color, Component, EventTouch, Label, Layout, Node, ScrollView, Size, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { InventoryModel } from '../data/InventoryModel';
import { PlayerModel } from '../data/PlayerModel';
import type { ItemCategory, InventoryStack } from '../data/ItemData';
import { CATEGORY_LABEL } from '../data/ItemData';
import { CellItem } from './CellItem';
import type { GameActionHandler } from '../GameAction';

const { ccclass } = _decorator;

const C_TITLE   = new Color(255, 233, 176, 255);
const C_TEXT    = new Color(243, 232, 207, 255);
const C_TEXT_D  = new Color(58, 42, 18, 255);

@ccclass('BackpackPanel')
export class BackpackPanel extends Component {
  inventory!: InventoryModel;
  player!: PlayerModel;
  onToast: (msg: string, duration?: number) => void = () => {};
  onAction: GameActionHandler = async () => ({ ok: false, message: '网络服务尚未就绪' });

  private panelNode: Node | null = null;
  private pendingItems = new Set<string>();
  private scrollView: ScrollView | null = null;
  private contentNode: Node | null = null;
  private footerLabel: Label | null = null;
  private tabs: { node: Node; lb: Label | null; cat: ItemCategory | 'all' }[] = [];
  private sortBtns: { node: Node; lb: Label | null; key: 'time' | 'name' }[] = [];

  private category: ItemCategory | 'all' = 'all';
  private sortKey: 'time' | 'name' = 'time';
  private sortDir: 'asc' | 'desc' = 'desc';
  isOpen = false;

  onLoad() {
    this.bindNodes();
    //this.node.active = false;
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
      const catList: (ItemCategory | 'all')[] = ['all', 'seed', 'fruit', 'fert'];
      const tabNames = ['tab', 'tab-001', 'tab-002', 'tab-003'];
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

      const timeBtn = toolbar.getChildByName('btn_time') || toolbar.getChildByName('btn_时间');
      const nameBtn = toolbar.getChildByName('btn_name') || toolbar.getChildByName('btn_名称');
      if (timeBtn) {
        const lb = timeBtn.getComponentInChildren(Label);
        timeBtn.off(Button.EventType.CLICK);
        timeBtn.on(Button.EventType.CLICK, () => this.setSort('time'));
        this.sortBtns.push({ node: timeBtn, lb, key: 'time' });
      }
      if (nameBtn) {
        const lb = nameBtn.getComponentInChildren(Label);
        nameBtn.off(Button.EventType.CLICK);
        nameBtn.on(Button.EventType.CLICK, () => this.setSort('name'));
        this.sortBtns.push({ node: nameBtn, lb, key: 'name' });
      }
    }

    if (footer) {
      this.footerLabel = footer.getComponentInChildren(Label);
    }

    this.refreshTab();
    this.refreshSort();
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
    const list = this.inventory.query({ category: this.category, sort: this.sortKey, dir: this.sortDir });
    const children = this.contentNode.children;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (i < list.length) {
        child.active = true;
        let ci = child.getComponent(CellItem) || child.addComponent(CellItem);
        ci.init(list[i],
          (id) => this.sellItem(id),
          (st) => this.showDetail(st));
      } else {
        child.active = false;
      }
    }

    // 复用第一个格子作为模板克隆补齐（不再 new 空节点）
    const template = children.length > 0 ? children[0] : null;
    for (let i = children.length; i < list.length; i++) {
      if (!template) break;
      const it = list[i];
      const cell = template.clone();
      cell.active = true;
      const ci = cell.getComponent(CellItem) || cell.addComponent(CellItem);
      ci.init(it,
        (id) => this.sellItem(id),
        (st) => this.showDetail(st));
      this.contentNode.addChild(cell);
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
    if (this.footerLabel) {
      this.footerLabel.string = `共 ${list.length} 件物品`;
    }
    if (this.scrollView) {
      this.scrollView.scrollToTop(0);
    }
  }

  private setCategory(c: ItemCategory | 'all') {
    this.category = c;
    this.refreshTab();
    this.render();
  }

  private setSort(k: 'time' | 'name') {
    if (this.sortKey === k) {
      this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this.sortKey = k;
      this.sortDir = 'desc';
    }
    this.refreshSort();
    this.render();
  }

  private refreshTab() {
    const idx = ['all', 'seed', 'fruit', 'fert'].indexOf(this.category);
    this.tabs.forEach((t, i) => {
      const active = i === idx;
      if (t.lb) {
        t.lb.color = active ? C_TEXT_D : C_TEXT;
        t.lb.isBold = active;
      }
    });
  }

  private refreshSort() {
    this.sortBtns.forEach((b) => {
      const active = this.sortKey === b.key;
      const arrow = active ? (this.sortDir === 'desc' ? ' ↓' : ' ↑') : '';
      if (b.lb) {
        b.lb.string = (b.key === 'time' ? '时间' : '名称') + arrow;
        b.lb.color = active ? C_TITLE : C_TEXT;
        b.lb.isBold = active;
      }
    });
  }

  private showDetail(st: InventoryStack) {
    const h = Math.floor((Date.now() - st.acquired) / 3600000);
    const ago = h < 1 ? '刚刚' : (h < 24 ? h + '小时前' : Math.floor(h / 24) + '天前');
    this.onToast(`【${CATEGORY_LABEL[st.category]}】${st.name} × ${st.count} · 回收价 ${st.value} · 获得于 ${ago}`, 2.5);
  }

  private async sellItem(id: string) {
    if (this.pendingItems.has(id)) { this.onToast('该物品正在同步'); return; }
    this.pendingItems.add(id);
    try {
      const result = await this.onAction('sell_item', { itemId: id, quantity: 1 });
      this.onToast(result.message);
      this.render();
    } finally {
      this.pendingItems.delete(id);
    }
  }
}