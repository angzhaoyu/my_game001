/**
 * ui/ShopPanel.ts —— 商店面板（结构同 BackpackPanel：header / toolbar / ScrollView / footer）
 *
 * 商品来自服务端 catalog（`config/ItemConfig` 的 SHOP_ITEMS），购买统一发 `buy_item` 命令；
 * 面板只负责填格子与显示金币，不做任何价格计算。
 */
import { _decorator, Component, Label, Node, ScrollView, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { InventoryModel } from '../data/InventoryModel';
import { PlayerModel } from '../data/PlayerModel';
import type { ShopDef } from '../data/ItemData';
import { SHOP_ITEMS } from '../config/ItemConfig';
import { ShopItem } from './ShopItem';
import type { GameActionHandler } from '../GameAction';
import { bindScrollList, bindTabs, closeOnOutsideTouch, findChild } from './NodeUtils';

const { ccclass } = _decorator;

type ShopCategory = 'seed' | 'fert' | 'medicine';
const CATEGORIES: ShopCategory[] = ['seed', 'fert', 'medicine'];
const TAB_NAMES = ['tab', 'tab-001', 'tab-002'];

@ccclass('ShopPanel')
export class ShopPanel extends Component {
  inventory!: InventoryModel;
  player!: PlayerModel;
  onToast: (message: string, duration?: number) => void = () => {};
  onAction: GameActionHandler = async () => ({ ok: false, message: '网络服务尚未就绪' });
  /** 关闭回调：施肥框跳商店后靠它回到施肥框 */
  onClose: () => void = () => {};

  isOpen = false;

  private panelNode: Node | null = null;
  private scrollView: ScrollView | null = null;
  private contentNode: Node | null = null;
  private goldLabel: Label | null = null;
  private selectTab: (index: number) => void = () => {};
  private pendingItems = new Set<string>();
  private category: ShopCategory = 'seed';

  onLoad(): void {
    closeOnOutsideTouch(this, () => this.close());
    const list = bindScrollList(this.node);
    this.panelNode = list.panel;
    this.scrollView = list.scroll;
    this.contentNode = list.content;

    const header = findChild(this.panelNode, 'header');
    const close = header ? findChild(header, 'CloseBth', 'CloseBtn', 'close_btn', 'btn_close') : null;
    close?.off(Node.EventType.TOUCH_END);
    close?.on(Node.EventType.TOUCH_END, () => this.close());

    const toolbar = findChild(this.panelNode, 'toolbar');
    this.selectTab = bindTabs(toolbar, TAB_NAMES, index => this.setCategory(CATEGORIES[index]));
    this.goldLabel = findChild(this.panelNode, 'footer', 'Footer')?.getComponentInChildren(Label) ?? null;
    this.node.active = false;
    this.refreshTab();
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
    if (!this.isOpen) return;
    this.isOpen = false;
    this.node.active = false;
    this.onClose();
  }

  render(): void {
    if (!this.contentNode) return;
    const list: ShopDef[] = SHOP_ITEMS.filter(item => item.category === this.category);
    const children = this.contentNode.children;
    const template = children.length > 0 ? children[0] : null;
    children.forEach((child, index) => {
      child.active = index < list.length;
      if (index < list.length) bindShopItem(child, list[index], this);
    });
    for (let index = children.length; index < list.length && template; index++) {
      const cell = template.clone();
      cell.active = true;
      this.contentNode.addChild(cell);
      bindShopItem(cell, list[index], this);
    }
    this.contentNode.getComponent(UITransform)?.setAnchorPoint(0.5, 1);
    this.normalizeDepth();
    if (this.goldLabel) this.goldLabel.string = `金币：${this.player.gold} · 在售 ${list.length} 种`;
    this.scrollView?.scrollToTop(0);
  }

  /**
   * 把 content 与商品卡的 z 归零：预制体实例可能带很深的 z（卡片 -2000），
   * 叠加面板自身 -1000 后会超出相机远裁剪面（far=2000）被裁掉。
   */
  private normalizeDepth(): void {
    if (!this.contentNode) return;
    const reset = (node: Node) => node.setPosition(node.position.x, node.position.y, 0);
    reset(this.contentNode);
    this.contentNode.children.forEach(reset);
  }

  private setCategory(category: ShopCategory): void {
    this.category = category;
    this.refreshTab();
    this.render();
  }

  private refreshTab(): void {
    this.selectTab(CATEGORIES.indexOf(this.category));
  }

  async buy(def: ShopDef): Promise<void> {
    if (this.pendingItems.has(def.id)) return;
    if (this.player.gold < def.price) {
      this.onToast('金币不足');
      return;
    }
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

  canAfford(def: ShopDef): boolean {
    return this.player.gold >= def.price && !this.pendingItems.has(def.id);
  }
}

function bindShopItem(cell: Node, def: ShopDef, panel: ShopPanel): void {
  const item = cell.getComponent(ShopItem) || cell.addComponent(ShopItem);
  item.init(def, panel.canAfford(def), shopDef => { void panel.buy(shopDef); });
}
