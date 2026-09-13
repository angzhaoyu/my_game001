/**
 * ui/FertilizePanel.ts —— 施肥选择框
 *
 * 结构（全部在 Cocos 里搭好，代码只填数据与切 active）：
 *   Panel
 *   ├─ top/ScrollView/view/content     已选肥料（预置 Cell，不够时克隆第一个）
 *   ├─ bottom/ScrollView/view/content  背包里已有的肥料
 *   ├─ toggle_append                   追加时间（勾选后同种肥料剩余时间累加）
 *   ├─ lb_hint                         已选提示
 *   ├─ btn_shop                        跳转商店（关闭商店后自动回到本框）
 *   └─ btn_confirm / btn_close
 *
 * 交互：点下面的肥料 → 上面出现；已选过则数量 +1；点上面的格子 → 数量 -1。
 * 肥料名称、类型、肥力与效果说明全部来自 `Fertilizer_Data` 表。
 */
import { _decorator, Component, Label, Node } from 'cc';
import { InventoryModel } from '../data/InventoryModel';
import type { InventoryStack } from '../data/ItemData';
import { fertilizerHint, getFertilizerDef } from '../config/FertilizerConfig';
import { applySprite, itemPaths } from './Assets';
import { bindClick, bindToggle, closeOnOutsideTouch, findChild, findLabel, findSprite, renderCells, showOnTop } from './NodeUtils';

const { ccclass, property } = _decorator;

interface CellRow {
  icon: string;
  name: string;
  count: string;
  onClick: () => void;
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
  inventory: InventoryModel | null = null;
  onConfirm: (items: { itemId: string; count: number }[], appendTime: boolean) => void = () => {};
  onOpenShop: () => void = () => {};
  onToast: (message: string, duration?: number) => void = () => {};

  private plotId = 0;
  private selections = new Map<string, { itemId: string; name: string; icon: string; count: number }>();
  private appendTime = false;
  private hiddenByShop = false;

  onLoad(): void {
    closeOnOutsideTouch(this, () => this.close());
    this.topContent = this.topContent || findChild(this.node, 'top_content', 'topContent')
      || findChild(findChild(this.node, 'top'), 'content');
    this.bottomContent = this.bottomContent || findChild(this.node, 'bottom_content', 'bottomContent')
      || findChild(findChild(this.node, 'bottom'), 'content');
    this.appendToggle = this.appendToggle || findChild(this.node, 'toggle_append', 'appendToggle');
    this.titleLabel = this.titleLabel || findLabel(this.node, 'title', 'lb_title');
    this.hintLabel = this.hintLabel || findLabel(this.node, 'hint', 'lb_hint');
    bindClick(this.confirmButton || findChild(this.node, 'btn_confirm'), () => this.confirm());
    bindClick(this.closeButton || findChild(this.node, 'btn_close'), () => this.close());
    bindClick(this.shopButton || findChild(this.node, 'btn_shop'), () => {
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
  }

  get plot(): number { return this.plotId; }

  open(plotId: number): void {
    this.plotId = plotId;
    this.selections.clear();
    this.hiddenByShop = false;
    this.isOpen = true;
    this.node.active = true;
    showOnTop(this.node);
    if (this.titleLabel) this.titleLabel.string = `给第 ${plotId} 块土地施肥`;
    this.refresh();
  }

  /** 商店关闭后由 GameRoot 调用：如果之前是被商店挡住，就回到施肥框 */
  restoreIfHidden(): boolean {
    if (!this.hiddenByShop || this.plotId <= 0) return false;
    this.hiddenByShop = false;
    this.isOpen = true;
    this.node.active = true;
    this.refresh();
    return true;
  }

  close(): void {
    this.isOpen = false;
    this.hiddenByShop = false;
    this.node.active = false;
    this.plotId = 0;
  }

  /** 快照刷新时调用，保证背包数量与已选数量同步 */
  refresh(): void {
    if (!this.isOpen && !this.hiddenByShop) return;
    this.clampSelections();
    const chosen = Array.from(this.selections.values());
    renderCells(this.topContent, chosen.length, (cell, index) => this.bindCell(cell, {
      icon: chosen[index].icon,
      name: chosen[index].name,
      count: `×${chosen[index].count}`,
      onClick: () => this.removeOne(chosen[index].itemId),
    }));
    const stacks = this.stacks();
    renderCells(this.bottomContent, stacks.length, (cell, index) => this.bindCell(cell, {
      icon: stacks[index].icon,
      name: describe(stacks[index]),
      count: `×${stacks[index].count}`,
      onClick: () => this.addOne(stacks[index]),
    }));
    this.refreshHint();
  }

  private bindCell(cell: Node, row: CellRow): void {
    const icon = findSprite(cell, 'icon');
    if (icon) applySprite(icon, itemPaths(row.icon));
    const name = findLabel(cell, 'lb_name', 'name');
    if (name) name.string = row.name;
    const count = findLabel(cell, 'lb_count', 'count');
    if (count) count.string = row.count;
    cell.off(Node.EventType.TOUCH_END);
    cell.on(Node.EventType.TOUCH_END, () => row.onClick());
  }

  private stacks(): InventoryStack[] {
    return this.inventory ? this.inventory.query({ category: 'fert' }) : [];
  }

  // ---------------- 交互 ----------------

  private addOne(stack: InventoryStack): void {
    const current = this.selections.get(stack.id)?.count ?? 0;
    if (current >= stack.count) {
      this.onToast(`${stack.name} 只有 ${stack.count} 个`);
      return;
    }
    this.selections.set(stack.id, { itemId: stack.id, name: stack.name, icon: stack.icon, count: current + 1 });
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
    const owned = new Map(this.stacks().map(stack => [stack.id, stack.count]));
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
    const chosen = Array.from(this.selections.values());
    const total = chosen.reduce((sum, row) => sum + row.count, 0);
    this.hintLabel.string = total === 0
      ? '点下面的肥料加入上方；勾选「追加时间」后同种肥料剩余时间累加'
      : `已选 ${total} 份：${chosen.map(row => row.name).join('、')}${this.appendTime ? '（追加时间）' : ''}`;
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

/** 一行肥料的显示文案：优先用表里的效果说明，其次按类型拼（服务端 catalog 同一口径） */
function describe(stack: InventoryStack): string {
  const definition = getFertilizerDef(stack.id.replace(/^fert_/, ''));
  if (!definition) return stack.name;
  const hint = fertilizerHint(definition);
  return `${definition.name}（${hint}${definition.note ? ` · ${definition.note}` : ''}）`;
}
