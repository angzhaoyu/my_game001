/**
 * ui/FertilizePanel.ts —— 施肥选择框
 *
 * 结构（全部在 Cocos 里搭好，代码只填数据与切 active）：
 *   Panel
 *   ├─ top/ScrollView/view/content     已选肥料（Cell 预制体实例，代码克隆补齐）
 *   ├─ bottom/ScrollView/view/content  背包里已有的肥料
 *   ├─ toggle_append                   追加时间（选中 → 同种肥料剩余时间累加）
 *   ├─ btn_shop                        跳转商店（关闭后自动回到施肥框）
 *   └─ btn_confirm / btn_close
 *
 * 交互：点击下面的肥料 → 上面出现；已经选过则数量 +1；点击上面的格子 → 数量 -1。
 */
import { _decorator, Button, Component, instantiate, Label, Layout, Layers, Node, ScrollView, Size, Sprite, UITransform } from 'cc';
import { InventoryModel } from '../data/InventoryModel';
import type { InventoryStack } from '../data/ItemData';
import { FERTILIZERS, getFertilizerDef } from '../config/FertilizerConfig';
import { applySprite } from './Assets';

const { ccclass, property } = _decorator;

interface Selection {
  itemId: string;
  name: string;
  icon: string;
  count: number;
}

@ccclass('FertilizePanel')
export class FertilizePanel extends Component {
  @property(Node) public topContent: Node | null = null;
  @property(Node) public bottomContent: Node | null = null;
  @property(Node) public appendToggle: Node | null = null;
  @property(Node) public shopButton: Node | null = null;
  @property(Node) public confirmButton: Node | null = null;
  @property(Node) public closeButton: Node | null = null;
  @property(Label) public titleLabel: Label | null = null;
  @property(Label) public hintLabel: Label | null = null;

  isOpen = false;
  private _initialized = false;
  private cellSize = 120;
  inventory: InventoryModel | null = null;
  onConfirm: (items: { itemId: string; count: number }[], appendTime: boolean) => void = () => {};
  onOpenShop: () => void = () => {};
  onToast: (message: string, duration?: number) => void = () => {};

  private plotId = 0;
  private selections = new Map<string, Selection>();
  private appendTime = false;
  private hiddenByShop = false;

  onLoad() {
    this.node.on(Node.EventType.TOUCH_END, (event: any) => {
      if (event?.target === this.node) this.close();
    });
    bindClick(this.confirmButton, () => this.confirm());
    bindClick(this.closeButton, () => this.close());
    bindClick(this.shopButton, () => {
      // 记住是被商店挡住的，商店关闭后自动回到施肥框
      this.hiddenByShop = true;
      this.node.active = false;
      this.onOpenShop();
    });
    bindToggle(this.appendToggle, checked => {
      this.appendTime = checked;
      this.refreshHint();
    });
    this.node.active = false;
    this._initialized = true;
  }

  get plot(): number { return this.plotId; }

  open(plotId: number): void {
    if (!this._initialized) { this.onLoad(); }
    this.plotId = plotId;
    this.selections.clear();
    this.hiddenByShop = false;
    this.isOpen = true;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    if (this.titleLabel) this.titleLabel.string = `给第 ${plotId} 块土地施肥`;
    this.refresh();
  }

  /** 商店关闭后由 GameRoot 调用：如果之前是被商店挡住，就回到施肥框。 */
  restoreIfHidden(): boolean {
    if (!this.hiddenByShop) return false;
    this.hiddenByShop = false;
    if (this.plotId > 0) {
      this.node.active = true;
      this.isOpen = true;
      this.refresh();
      return true;
    }
    return false;
  }

  close(): void {
    this.isOpen = false;
    this.hiddenByShop = false;
    this.node.active = false;
    this.plotId = 0;
  }

  /** 快照刷新时调用，保证背包数量与已选数量同步。 */
  refresh(): void {
    if (!this.isOpen && !this.hiddenByShop) return;
    this.clampSelections();
    this.renderTop();
    this.renderBottom();
    this.refreshHint();
  }

  // ---------------- 渲染 ----------------

  private renderTop(): void {
    const rows = Array.from(this.selections.values());
    this.fillList(this.topContent, rows.map(row => ({
      icon: row.icon,
      name: row.name,
      count: `×${row.count}`,
      onClick: () => this.removeOne(row.itemId),
    })));
  }

  private renderBottom(): void {
    const stacks = this.inventory ? this.inventory.query({ category: 'fert' }) : [];
    this.fillList(this.bottomContent, stacks.map(stack => ({
      icon: stack.icon,
      name: this.describe(stack),
      count: `×${stack.count}`,
      onClick: () => this.addOne(stack),
    })));
  }

  private fillList(content: Node | null, rows: { icon: string; name: string; count: string; onClick: () => void }[]): void {
    if (!content) return;
    
    // 检测格子尺寸
    let layout = content.getComponent(Layout);
    this.cellSize = this.detectCellSize(layout, content);
    if (layout) {
      layout.cellSize = new Size(this.cellSize, this.cellSize);
    }
    
    const children = content.children;
    children.forEach((child, index) => {
      setActive(child, index < rows.length);
      if (index < rows.length) this.bindCell(child, rows[index]);
    });
    const template = children.length > 0 ? children[0] : null;
    for (let index = children.length; index < rows.length; index++) {
      const cell = template ? instantiate(template) : this.createFallbackCell();
      cell.active = true;
      content.addChild(cell);
      this.bindCell(cell, rows[index]);
    }
    layout = layout || content.addComponent(Layout);
    layout.updateLayout();
    const scroll = content.parent?.parent?.getComponent(ScrollView);
    if (scroll) scroll.scrollToTop(0);
  }

  private bindCell(cell: Node, row: { icon: string; name: string; count: string; onClick: () => void }): void {
    const icon = findSprite(cell, 'icon');
    if (icon) applySprite(icon, [`textures/items/${row.icon}/spriteFrame`, `farm/crop/${row.icon}/spriteFrame`]);
    const name = findLabel(cell, 'lb_name') || cell.getComponentInChildren(Label);
    if (name) name.string = row.name;
    const count = findLabel(cell, 'lb_count');
    if (count) count.string = row.count;
    cell.off(Node.EventType.TOUCH_END);
    cell.on(Node.EventType.TOUCH_END, () => row.onClick());
  }

  /**
   * 检测格子尺寸：优先读取已有子节点的 UITransform，其次读取 Layout 的 cellSize，
   * 最后才根据 ScrollView 宽度动态计算。
   */
  private detectCellSize(layout: Layout | null, content: Node): number {
    // 1. 优先读取已有子节点（编辑器放入的预制体）的 UITransform 尺寸
    if (content.children.length > 0) {
      const firstChild = content.children[0];
      const childUT = firstChild.getComponent(UITransform);
      if (childUT && childUT.contentSize.width > 0) {
        return childUT.contentSize.width;
      }
    }

    // 2. 读取 Layout 组件中已设置的 cellSize
    if (layout && layout.cellSize.width > 0) {
      return layout.cellSize.width;
    }

    // 3. 兜底：根据 ScrollView 宽度动态计算
    const scrollView = content.parent?.parent?.getComponent(ScrollView);
    if (scrollView) {
      const scrollUT = scrollView.node.getComponent(UITransform);
      const viewWidth = scrollUT ? scrollUT.contentSize.width : 720;

      const padL = layout ? layout.paddingLeft : 20;
      const padR = layout ? layout.paddingRight : 0;
      const spX = layout ? layout.spacingX : 20;

      const cols = (layout && layout.type === Layout.Type.GRID)
        ? Math.max(1, (layout as any).constraintNum || 5)
        : 5;

      const available = viewWidth - padL - padR;
      const cell = Math.floor((available - (cols - 1) * spX) / cols);
      return Math.max(60, Math.min(cell, 160));
    }

    return 120;
  }

  private createFallbackCell(): Node {
    const n = new Node('Cell');
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(this.cellSize, this.cellSize);
    return n;
  }

  private describe(stack: InventoryStack): string {
    const definition = getFertilizerDef(stack.id.replace(/^fert_/, ''));
    if (!definition) return stack.name;
    return definition.type === 'organic'
      ? `${definition.name}(有机 +${definition.perMinute}/分钟 ${definition.duration}分钟)`
      : `${definition.name}(无机 +${definition.amount} ${definition.duration}分钟)`;
  }

  // ---------------- 交互 ----------------

  private addOne(stack: InventoryStack): void {
    const owned = stack.count;
    const current = this.selections.get(stack.id)?.count ?? 0;
    if (current >= owned) {
      this.onToast(`${stack.name} 只有 ${owned} 个`);
      return;
    }
    this.selections.set(stack.id, {
      itemId: stack.id,
      name: stack.name,
      icon: stack.icon,
      count: current + 1,
    });
    this.refresh();
  }

  private removeOne(itemId: string): void {
    const current = this.selections.get(itemId);
    if (!current) return;
    if (current.count <= 1) this.selections.delete(itemId);
    else current.count -= 1;
    this.refresh();
  }

  private clampSelections(): void {
    const stacks = this.inventory ? this.inventory.query({ category: 'fert' }) : [];
    const owned = new Map(stacks.map(stack => [stack.id, stack.count]));
    Array.from(this.selections.keys()).forEach(itemId => {
      const limit = owned.get(itemId) ?? 0;
      const selection = this.selections.get(itemId);
      if (!selection) return;
      if (limit <= 0) this.selections.delete(itemId);
      else if (selection.count > limit) selection.count = limit;
    });
  }

  private refreshHint(): void {
    if (!this.hintLabel) return;
    const total = Array.from(this.selections.values()).reduce((sum, row) => sum + row.count, 0);
    const kinds = Array.from(this.selections.values())
      .map(row => (FERTILIZERS[row.itemId.replace(/^fert_/, '')]?.name ?? row.name));
    this.hintLabel.string = total === 0
      ? '点击下面的肥料加入上方；追加时间：勾选后同种肥料剩余时间累加'
      : `已选 ${total} 份：${kinds.join('、')}${this.appendTime ? '（追加时间）' : ''}`;
  }

  private confirm(): void {
    const items = Array.from(this.selections.values()).map(row => ({ itemId: row.itemId, count: row.count }));
    if (items.length === 0) {
      this.onToast('请先选择要施用的肥料');
      return;
    }
    const appendTime = this.appendTime;
    this.close();
    this.onConfirm(items, appendTime);
  }
}

function bindClick(node: Node | null, handler: () => void): void {
  if (!node) return;
  const button = node.getComponent(Button) || node.addComponent(Button);
  button.transition = Button.Transition.SCALE;
  button.zoomScale = 0.92;
  node.off(Button.EventType.CLICK);
  node.on(Button.EventType.CLICK, handler);
}

const CHECK_MARK_NAMES = ['checkmark', 'checkMark', 'CheckMark', 'mark'];

function bindToggle(node: Node | null, handler: (checked: boolean) => void): void {
  if (!node) return;
  const mark = CHECK_MARK_NAMES
    .map(name => node.getChildByName(name))
    .find(child => !!child) || null;
  node.off(Node.EventType.TOUCH_END);
  node.on(Node.EventType.TOUCH_END, () => {
    const checked = !(mark ? mark.active : false);
    setActive(mark, checked);
    handler(checked);
  });
}

function setActive(node: Node | null, active: boolean): void {
  if (node && node.isValid && node.active !== active) node.active = active;
}

function findLabel(root: Node, name: string): Label | null {
  const direct = root.getChildByName(name);
  if (direct) return direct.getComponent(Label) || direct.getComponentInChildren(Label);
  return root.getComponentInChildren(Label);
}

function findSprite(root: Node, name: string): Sprite | null {
  const direct = root.getChildByName(name);
  if (direct) return direct.getComponent(Sprite) || direct.getComponentInChildren(Sprite);
  return root.getComponentInChildren(Sprite);
}
