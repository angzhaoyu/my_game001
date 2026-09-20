/**
 * ui/ShopPanel.ts —— 商店面板逻辑
 *
 * 商店卖种子、化肥、药剂。默认显示全部，可按分类筛选。
 * 格子尺寸根据 ScrollView 实际宽度和 Layout 参数动态计算，适配不同屏幕。
 * 点击购买弹出 BuyPanel。
 */
import { _decorator, Button, Color, Component, EventTouch, instantiate, Label, Layout, Layers, Node, ScrollView, Size, tween, UIOpacity, UITransform, Vec3 } from 'cc';
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

type ShopCategory = 'all' | 'seed' | 'fert' | 'pesticide';

@ccclass('ShopPanel')
export class ShopPanel extends Component {
  inventory!: InventoryModel;
  player!: PlayerModel;
  onToast: (msg: string, duration?: number) => void = () => {};
  onAction: GameActionHandler = async () => ({ ok: false, message: '网络服务尚未就绪' });
  onOpenBuy: (def: ShopDef) => void = () => {};

  private scrollView: ScrollView | null = null;
  private contentNode: Node | null = null;
  private footerLabel: Label | null = null;
  private tabs: { node: Node; lb: Label | null; cat: ShopCategory }[] = [];
  private sortBtns: { node: Node; lb: Label | null; key: 'time' | 'name' }[] = [];

  onClose: () => void = () => {};

  private category: ShopCategory = 'all';
  private sortKey: 'time' | 'name' = 'name';
  private sortDir: 'asc' | 'desc' = 'asc';
  private cellSize = 124;
  isOpen = false;

  onLoad() {
    this.bindNodes();
    this.node.active = false;
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
      const layout = this.contentNode.getComponent(Layout) || this.contentNode.addComponent(Layout);
      const ut = this.contentNode.getComponent(UITransform);
      if (ut) ut.setAnchorPoint(0.5, 1);
      this.cellSize = this.detectCellSize(layout);
      layout.cellSize = new Size(this.cellSize, this.cellSize);
    }

    if (header) {
      const closeBtn = header.getChildByName('CloseBth') || header.getChildByName('close_btn') || header.getChildByName('CloseBtn');
      if (closeBtn) {
        closeBtn.off(Button.EventType.CLICK);
        closeBtn.on(Button.EventType.CLICK, () => this.close());
      }
    }

    if (toolbar) {
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

      // 分类 tab：优先找 right 子节点，再兼容旧 tab 名称
      const right = this.findDescendant(toolbar, 'right');
      if (right) {
        const catList: ShopCategory[] = ['all', 'seed', 'fert', 'pesticide'];
        const btnNames = ['all', 'seed', 'fert', 'pesticide'];
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
      if (this.tabs.length === 0) {
        const catList: ShopCategory[] = ['seed', 'fert', 'pesticide'];
        const tabNames = ['tab', 'tab-001', 'tab-002'];
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

    this.refreshSort();
    this.refreshTab();
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
   * 仅在编辑器未放置预制体且 Layout 未设 cellSize 时使用。
   */
  private calcCellSizeFromView(layout: Layout | null): number {
    if (!this.scrollView) return 120;
    const scrollUT = this.scrollView.node.getComponent(UITransform);
    const viewWidth = scrollUT ? scrollUT.contentSize.width : 720;

    const padL = layout ? layout.paddingLeft : 20;
    const padR = layout ? layout.paddingRight : 0;
    const spX  = layout ? layout.spacingX : 20;

    // FIXED_COL 模式：constraintNum 列
    const cols = (layout && layout.type === Layout.Type.GRID && layout.resizeMode === Layout.ResizeMode.CONTAINER)
      ? Math.max(1, (layout as any).constraintNum || 5)
      : 5;

    const available = viewWidth - padL - padR;
    const cell = Math.floor((available - (cols - 1) * spX) / cols);
    return Math.max(60, Math.min(cell, 160));  // 限制在 60~160 之间
  }

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
    if (!this.contentNode) this.bindNodes();
    this.isOpen = true;
    this.node.active = true;
    this.render();
    this.normalizeDepth();
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
    if (!this.isOpen) return;
    this.isOpen = false;
    this.node.active = false;
    this.onClose();
  }

  render() {
    if (!this.contentNode) return;

    // 'all' 显示全部，否则按分类过滤
    let list: ShopDef[] = this.category === 'all'
      ? [...SHOP_ITEMS]
      : SHOP_ITEMS.filter(s => s.category === this.category);

    // 排序
    list = list.sort((a, b) => {
      let result: number;
      if (this.sortKey === 'name') {
        result = a.name.localeCompare(b.name, 'zh-Hans-CN');
      } else {
        result = a.price - b.price;
      }
      return this.sortDir === 'desc' ? -result : result;
    });

    const children = this.contentNode.children;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (i < list.length) {
        child.active = true;
        let si = child.getComponent(ShopItem) || child.addComponent(ShopItem);
        si.init(list[i], this.player.gold >= list[i].price, (d) => { this.buyItem(d); });
      } else {
        child.active = false;
      }
    }

    const template = children.length > 0 ? children[0] : null;
    for (let i = children.length; i < list.length; i++) {
      const def = list[i];
      const cell = template ? instantiate(template) : this.createCell();
      cell.active = true;
      let si = cell.getComponent(ShopItem) || cell.addComponent(ShopItem);
      si.init(def, this.player.gold >= def.price, (d) => { this.buyItem(d); });
      this.contentNode.addChild(cell);
    }

    const layout = this.contentNode.getComponent(Layout);
    if (layout) {
      layout.updateLayout();
    }
    this.normalizeDepth();
    if (this.footerLabel) {
      this.footerLabel.string = `金币：${this.player.gold} · 在售 ${list.length} 种`;
    }
    if (this.scrollView) {
      this.scrollView.scrollToTop(0);
    }
  }

  private createCell(): Node {
    const n = new Node('ShopItem');
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(this.cellSize, this.cellSize);
    return n;
  }

  private setCategory(c: ShopCategory) {
    this.category = c;
    this.refreshTab();
    this.render();
  }

  private setSort(k: 'time' | 'name') {
    if (this.sortKey === k) {
      this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this.sortKey = k;
      this.sortDir = 'asc';
    }
    this.refreshSort();
    this.render();
  }

  private refreshTab() {
    this.tabs.forEach((t) => {
      const active = t.cat === this.category;
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

  private buyItem(def: ShopDef) {
    if (this.player.gold < def.price) { this.onToast('金币不足'); return; }
    this.onOpenBuy(def);
  }
}
