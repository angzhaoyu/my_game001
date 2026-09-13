/**
 * ui/ItemPickerPanel.ts —— 通用物品选择框（种子 / 药品都复用它）
 *
 * 布局在 Cocos 里搭好：ScrollView/view/content 下预置若干 Cell 预制体实例，
 * 代码只负责填入图标/名称/数量并绑定点击，数量不足时用模板克隆补齐。
 */
import { _decorator, Component, Label, Layout, Node, ScrollView, Sprite } from 'cc';
import { applySprite } from './Ui';

const { ccclass, property } = _decorator;

export interface PickerRow {
  key: string;      // 作物 id / 物品 id
  name: string;
  icon: string;
  sub: string;      // 副标题（数量、效果）
  disabled?: boolean;
}

@ccclass('ItemPickerPanel')
export class ItemPickerPanel extends Component {
  @property(Node) public contentNode: Node | null = null;
  @property(Node) public closeButton: Node | null = null;
  @property(Label) public titleLabel: Label | null = null;
  @property(Label) public hintLabel: Label | null = null;

  isOpen = false;
  onPick: (key: string) => void = () => {};

  onLoad() {
    this.node.on(Node.EventType.TOUCH_END, (event: any) => {
      if (event?.target === this.node) this.close();
    });
    if (this.closeButton) {
      this.closeButton.off(Node.EventType.TOUCH_END);
      this.closeButton.on(Node.EventType.TOUCH_END, () => this.close());
    }
    this.node.active = false;
  }

  open(title: string, hint: string, rows: PickerRow[], onPick: (key: string) => void): void {
    this.onPick = onPick;
    this.isOpen = true;
    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
    if (this.titleLabel) this.titleLabel.string = title;
    if (this.hintLabel) this.hintLabel.string = hint;
    this.render(rows);
  }

  close(): void {
    this.isOpen = false;
    this.node.active = false;
  }

  private render(rows: PickerRow[]): void {
    const content = this.contentNode;
    if (!content) return;
    const children = content.children;
    children.forEach((child, index) => {
      setActive(child, index < rows.length);
      if (index < rows.length) this.bindCell(child, rows[index]);
    });
    const template = children.length > 0 ? children[0] : null;
    for (let index = children.length; index < rows.length; index++) {
      if (!template) break;
      const cell = template.clone();
      cell.active = true;
      content.addChild(cell);
      this.bindCell(cell, rows[index]);
    }
    const layout = content.getComponent(Layout) || content.addComponent(Layout);
    layout.updateLayout();
    const scroll = content.parent?.parent?.getComponent(ScrollView);
    if (scroll) scroll.scrollToTop(0);
  }

  private bindCell(cell: Node, row: PickerRow): void {
    const icon = findSprite(cell, 'icon');
    if (icon) applySprite(icon, [
      `textures/items/${row.icon}/spriteFrame`,
      `farm/crop/${row.icon}/spriteFrame`,
    ]);
    const name = findLabel(cell, 'lb_name');
    if (name) name.string = row.name;
    const sub = findLabel(cell, 'lb_count') || findLabel(cell, 'lb_sub');
    if (sub) sub.string = row.sub;
    cell.off(Node.EventType.TOUCH_END);
    if (!row.disabled) {
      cell.on(Node.EventType.TOUCH_END, () => {
        const key = row.key;
        this.close();
        this.onPick(key);
      });
    }
  }
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
