/**
 * ui/BackpackPanel.ts —— 背包面板（绑定 farm.scene 里的 BackpackPanel 节点）
 *
 * 面板结构在 Cocos 里摆好：header（标题 + 关闭）、toolbar（分类 tab + 排序）、
 * ScrollView/view/content（预置格子，每格挂 CellItem 或按名字找 icon/name/count/sell_btn）、footer。
 * 这里只填数据与切显隐，不生成节点。
 */
import { _decorator, Component, Label, Node, ScrollView, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { InventoryModel } from '../data/InventoryModel';
import { PlayerModel } from '../data/PlayerModel';
import type { ItemCategory, InventoryStack } from '../data/ItemData';
import { CATEGORY_LABEL } from '../data/ItemData';
import { CellItem } from './CellItem';
import type { GameActionHandler } from '../GameAction';
import { bindScrollList, bindTabs, closeOnOutsideTouch, findChild } from './NodeUtils';

const { ccclass } = _decorator;

const CATEGORIES: (ItemCategory | 'all')[] = ['all', 'seed', 'fruit', 'fert', 'medicine'];
const TAB_NAMES = ['tab', 'tab-001', 'tab-002', 'tab-003', 'tab-004'];
type SortKey = 'time' | 'name';

@ccclass('BackpackPanel')
export class BackpackPanel extends Component {
  inventory!: InventoryModel;
  player!: PlayerModel;
  onToast: (message: string, duration?: number) => void = () => {};
  onAction: GameActionHandler = async () => ({ ok: false, message: '网络服务尚未就绪' });

  isOpen = false;

  private panelNode: Node | null = null;
  private scrollView: ScrollView | null = null;
  private contentNode: Node | null = null;
  private footerLabel: Label | null = null;
  private sortButtons: { node: Node; key: SortKey }[] = [];
  private selectTab: (index: number) => void = () => {};
  private pendingItems = new Set<string>();
  private category: ItemCategory | 'all' = 'all';
  private sortKey: SortKey = 'time';
  private sortDir: 'asc' | 'desc' = 'desc';

  onLoad(): void {
    closeOnOutsideTouch(this, () => this.close());
    const list = bindScrollList(this.node);
    this.panelNode = list.panel;
    this.scrollView = list.scroll;
    this.contentNode = list.content;

    const header = findChild(this.panelNode, 'header');
    bindCloseButton(header, () => this.close());

    const toolbar = findChild(this.panelNode, 'toolbar');
    this.selectTab = bindTabs(toolbar, TAB_NAMES, index => this.setCategory(CATEGORIES[index]));
    this.bindSortButtons(toolbar);

    const footer = findChild(this.panelNode, 'footer', 'Footer');
    this.footerLabel = footer?.getComponentInChildren(Label) ?? null;
    this.refreshTab();
    this.refreshSort();
  }

  /** 排序按钮：点当前项切换升 / 降序 */
  private bindSortButtons(toolbar: Node | null): void {
    if (!toolbar) return;
    ([['btn_time', 'time'], ['btn_name', 'name']] as [string, SortKey][]).forEach(([name, key]) => {
      const node = findChild(toolbar, name, key === 'time' ? 'btn_时间' : 'btn_名称');
      if (!node) return;
      node.off(Node.EventType.TOUCH_END);
      node.on(Node.EventType.TOUCH_END, () => this.setSort(key));
      this.sortButtons.push({ node, key });
    });
  }

  open(): void {
    this.isOpen = true;
    this.node.active = true;
    this.render();
    if (!this.panelNode) return;
    const opacity = this.panelNode.getComponent(UIOpacity) || this.panelNode.addComponent(UIOpacity);
    opacity.opacity = 0;
    this.panelNode.setScale(0.9, 0.9, 1);
    tween(opacity).stop();
    tween(opacity).to(0.18, { opacity: 255 }).start();
    tween(this.panelNode).stop();
    tween(this.panelNode).to(0.22, { scale: new Vec3(1, 1, 1) }).start();
  }

  close(): void {
    this.isOpen = false;
    this.node.active = false;
  }

  render(): void {
    if (!this.contentNode) return;
    const list = this.inventory.query({ category: this.category, sort: this.sortKey, dir: this.sortDir });
    const children = this.contentNode.children;
    const template = children.length > 0 ? children[0] : null;
    children.forEach((child, index) => {
      child.active = index < list.length;
      if (index < list.length) bindCellItem(child, list[index], this);
    });
    for (let index = children.length; index < list.length && template; index++) {
      const cell = template.clone();
      cell.active = true;
      this.contentNode.addChild(cell);
      bindCellItem(cell, list[index], this);
    }
    this.contentNode.getComponent(UITransform)?.setAnchorPoint(0.5, 1);
    if (this.footerLabel) this.footerLabel.string = `共 ${list.length} 件物品`;
    this.scrollView?.scrollToTop(0);
  }

  private setCategory(category: ItemCategory | 'all'): void {
    this.category = category;
    this.refreshTab();
    this.render();
  }

  private setSort(key: SortKey): void {
    if (this.sortKey === key) this.sortDir = this.sortDir === 'desc' ? 'asc' : 'desc';
    else {
      this.sortKey = key;
      this.sortDir = 'desc';
    }
    this.refreshSort();
    this.render();
  }

  private refreshTab(): void {
    this.selectTab(CATEGORIES.indexOf(this.category));
  }

  private refreshSort(): void {
    this.sortButtons.forEach(({ node, key }) => {
      const label = node.getComponentInChildren(Label);
      if (!label) return;
      const active = this.sortKey === key;
      label.string = (key === 'time' ? '时间' : '名称') + (active ? (this.sortDir === 'desc' ? ' ↓' : ' ↑') : '');
    });
  }

  /** 详情走 Toast，不再单独做弹窗（按需求：优先用场景里现成的节点） */
  showDetail(stack: InventoryStack): void {
    const hours = Math.floor((Date.now() - stack.acquired) / 3_600_000);
    const ago = hours < 1 ? '刚刚' : (hours < 24 ? `${hours}小时前` : `${Math.floor(hours / 24)}天前`);
    this.onToast(`【${CATEGORY_LABEL[stack.category]}】${stack.name} × ${stack.count} · 回收价 ${stack.value} · 获得于 ${ago}`, 2.5);
  }

  async sellItem(itemId: string): Promise<void> {
    if (this.pendingItems.has(itemId)) {
      this.onToast('该物品正在同步');
      return;
    }
    this.pendingItems.add(itemId);
    try {
      const result = await this.onAction('sell_item', { itemId, quantity: 1 });
      this.onToast(result.message);
      this.render();
    } finally {
      this.pendingItems.delete(itemId);
    }
  }
}

function bindCloseButton(header: Node | null, close: () => void): void {
  const button = header ? findChild(header, 'CloseBth', 'CloseBtn', 'close_btn', 'btn_close') : null;
  if (!button) return;
  button.off(Node.EventType.TOUCH_END);
  button.on(Node.EventType.TOUCH_END, close);
}

function bindCellItem(cell: Node, stack: InventoryStack, panel: BackpackPanel): void {
  const item = cell.getComponent(CellItem) || cell.addComponent(CellItem);
  item.init(stack, id => { void panel.sellItem(id); }, stack2 => panel.showDetail(stack2));
}
