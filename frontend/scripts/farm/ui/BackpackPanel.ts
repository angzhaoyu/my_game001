/**
 * ui/BackpackPanel.ts —— 背包面板逻辑
 *
 * 结构详见 farm.scene.md §7。
 * 点击 right 筛选，点击 left 排序。
 * 点击出售按钮弹出 SellPanel。
 */
import { _decorator, Button, Color, Component, EventTouch, instantiate, Label, Layout, Layers, Node, ScrollView, Size, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { InventoryModel } from '../data/InventoryModel';
import { PlayerModel } from '../data/PlayerModel';
import type { ItemCategory, InventoryStack } from '../data/ItemData';
import { CATEGORY_LABEL } from '../data/ItemData';
import { BackpackItem } from './BackpackItem';
import type { GameActionHandler } from '../GameAction';

const { ccclass } = _decorator;

const C_TITLE   = new Color(255, 233, 176, 255);
const C_TEXT    = new Color(243, 232, 207, 255);
const C_TEXT_D  = new Color(58, 42, 18, 255);
// CELL 由 calcCellSize() 动态计算

@ccclass('BackpackPanel')
export class BackpackPanel extends Component {
  inventory!: InventoryModel;
  player!: PlayerModel;
  onToast: (msg: string, duration?: number) => void = () => {};
  onAction: GameActionHandler = async () => ({ ok: false, message: '网络服务尚未就绪' });
  onOpenSell: (stack: InventoryStack) => void = () => {};

  private scrollView: ScrollView | null = null;
  private contentNode: Node | null = null;
  private footerLabel: Label | null = null;
  private tabs: { node: Node; lb: Label | null; cat: ItemCategory | 'all' }[] = [];
  private sortBtns: { node: Node; lb: Label | null; key: 'time' | 'name' }[] = [];

  private category: ItemCategory | 'all' = 'all';
  private sortKey: 'time' | 'name' = 'time';
  private sortDir: 'asc' | 'desc' = 'desc';
  private cellSize = 124;
  isOpen = false;

  onLoad() {
    this.bindNodes();
  }

  private bindNodes() {
    this.node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      if (e.target === this.node) this.close();
    });

    
    const toolbar = this.findDescendant(this.node, 'Toolbar') || this.findDescendant(this.node, 'toolbar');
    const header = this.findDescendant(this.node, 'Header') || this.findDescendant(this.node, 'header');
    const scroll = this.findDescendant(this.node, 'ScrollView');
    const footer = this.findDescendant(this.node, 'Footer') || this.findDescendant(this.node, 'footer');

    if (scroll) {
      this.scrollView = scroll.getComponent(ScrollView);
      if (this.scrollView) this.scrollView.verticalScrollBar = null;
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
      this.cellSize = this.detectCellSize(layout);
      layout.cellSize = new Size(this.cellSize, this.cellSize);
      const ut = this.contentNode.getComponent(UITransform);
      if (ut) ut.setAnchorPoint(0.5, 1);
    }

    if (header) {
      const closeBtn = header.getChildByName('CloseBth') || header.getChildByName('close_btn') || header.getChildByName('CloseBtn');
      if (closeBtn) {
        closeBtn.off(Button.EventType.CLICK);
        closeBtn.on(Button.EventType.CLICK, () => this.close());
      }
    }

    if (toolbar) {
      const right = this.findDescendant(toolbar, 'right');
      if (right) {
        const catList: (ItemCategory | 'all')[] = ['all', 'fruit', 'seed', 'fert', 'pesticide'];
        const btnNames = ['all', 'fruit', 'seed', 'fertilizer', 'pesticide'];
        btnNames.forEach((name, i) => {
          const tabNode = right.getChildByName(name);
          if (tabNode) {
            const lb = tabNode.getComponentInChildren(Label);
            tabNode.off(Button.EventType.CLICK);
            tabNode.on(Button.EventType.CLICK, () => this.setCategory(catList[i]));
            this.tabs.push({ node: tabNode, lb, cat: catList[i] });
          }
        });
      }

      const left = this.findDescendant(toolbar, 'left');
      const timeBtn = left ? (left.getChildByName('time') || left.getChildByName('btn_time'))
        : (toolbar.getChildByName('btn_time') || toolbar.getChildByName('time'));
      const nameBtn = left ? (left.getChildByName('name') || left.getChildByName('btn_name'))
        : (toolbar.getChildByName('btn_name') || toolbar.getChildByName('name'));

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

      if (this.tabs.length === 0) {
        const catList: (ItemCategory | 'all')[] = ['all', 'seed', 'fruit', 'fert', 'pesticide'];
        const tabNames = ['tab', 'tab-001', 'tab-002', 'tab-003', 'tab-004'];
        tabNames.forEach((name, i) => {
          const tabNode = toolbar.getChildByName(name);
          if (tabNode) {
            const lb = tabNode.getComponentInChildren(Label);
            tabNode.off(Button.EventType.CLICK);
            tabNode.on(Button.EventType.CLICK, () => this.setCategory(catList[i]));
            this.tabs.push({ node: tabNode, lb, cat: catList[i] });
          }
        });
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
    if (!this.contentNode) this.bindNodes();
    this.isOpen = true;
    this.node.active = true;
    this.render();
    if (this.node) {
      const op = this.node.getComponent(UIOpacity) || this.node.addComponent(UIOpacity);
      op.opacity = 0;
      this.node.setScale(0.9, 0.9, 1);
      tween(op).stop();
      tween(op).to(0.18, { opacity: 255 }).start();
      tween(this.node).stop();
      tween(this.node).to(0.22, { scale: new Vec3(1, 1, 1) }).start();
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

    // 复用已有子节点
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (i < list.length) {
        child.active = true;
        let ci = child.getComponent(BackpackItem) || child.addComponent(BackpackItem);
        ci.init(list[i], (st) => this.sellItem(st), (st) => this.showDetail(st));
      } else {
        child.active = false;
      }
    }

    // 不够时：优先克隆第一个子节点，没有则动态创建
    const template = children.length > 0 ? children[0] : null;
    for (let i = children.length; i < list.length; i++) {
      const cell = template ? instantiate(template) : this.createCell();
      cell.active = true;
      let ci = cell.getComponent(BackpackItem) || cell.addComponent(BackpackItem);
      ci.init(list[i], (st) => this.sellItem(st), (st) => this.showDetail(st));
      this.contentNode.addChild(cell);
    }

    const layout = this.contentNode.getComponent(Layout);
    if (layout) {
      layout.updateLayout();
    }
    if (this.footerLabel) {
      this.footerLabel.string = `共 ${list.length} 件物品`;
    }
    if (this.scrollView) {
      this.scrollView.scrollToTop(0);
    }
  }

  /**
   * 检测格子尺寸：优先读取编辑器放置的预制体大小，其次读取 Layout 已有 cellSize，
   * 最后才根据 ScrollView 宽度动态计算。
   */
  private detectCellSize(layout: Layout | null): number {
    // 1. 优先读取已有子节点（编辑器放入的预制体）的 UITransform 尺寸
    if (this.contentNode && this.contentNode.children.length > 0) {
      const firstChild = this.contentNode.children[0];
      const childUT = firstChild.getComponent(UITransform);
      if (childUT && childUT.contentSize.width > 0) {
        return childUT.contentSize.width;
      }
    }

    // 2. 读取 Layout 组件中已设置的 cellSize（编辑器 Inspector 里配的）
    if (layout && layout.cellSize.width > 0) {
      return layout.cellSize.width;
    }

    // 3. 兜底：根据 ScrollView 宽度动态计算
    return this.calcCellSizeFromView(layout);
  }

  /**
   * 根据 ScrollView 宽度和 Layout 的 padding/spacing/constraint 动态计算格子尺寸。
   */
  private calcCellSizeFromView(layout: Layout | null): number {
    if (!this.scrollView) return 124;
    const scrollUT = this.scrollView.node.getComponent(UITransform);
    const viewWidth = scrollUT ? scrollUT.contentSize.width : 720;

    const padL = layout ? layout.paddingLeft : 20;
    const padR = layout ? layout.paddingRight : 0;
    const spX  = layout ? layout.spacingX : 20;

    const cols = (layout && layout.type === Layout.Type.GRID && layout.resizeMode === Layout.ResizeMode.CONTAINER)
      ? Math.max(1, (layout as any).constraintNum || 5)
      : 5;

    const available = viewWidth - padL - padR;
    const cell = Math.floor((available - (cols - 1) * spX) / cols);
    return Math.max(60, Math.min(cell, 160));
  }

  /** content 里没有预制体子节点时，动态创建一个空白 BackpackItem 单元格 */
  private createCell(): Node {
    const n = new Node('BackpackItem');
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(this.cellSize, this.cellSize);
    return n;
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
    const idx = (['all', 'fruit', 'seed', 'fert', 'pesticide'] as (ItemCategory | 'all')[])
      .indexOf(this.category);
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

  private sellItem(stack: InventoryStack) {
    this.onOpenSell(stack);
  }
}
