/**
 * ui/ItemPickerPanel.ts —— 通用物品选择框（种子 / 药剂都复用它）
 *
 * 结构详见 farm.scene.md §14/§15。
 * 使用 BaseItem 预制体显示物品。
 */
import { _decorator, Button, Component, instantiate, Label, Layout, Layers, Node, ScrollView, Size, UITransform } from 'cc';
import { BaseItem, type BaseItemData } from './BaseItem';

const { ccclass, property } = _decorator;
// CELL 由 detectCellSize() 动态检测

export interface PickerRow {
  key: string;
  name: string;
  icon: string;
  sub: string;
  disabled?: boolean;
  category?: string;
  count?: number;
}

@ccclass('ItemPickerPanel')
export class ItemPickerPanel extends Component {
  @property(Node) public contentNode: Node | null = null;
  @property(Node) public closeButton: Node | null = null;
  @property(Label) public titleLabel: Label | null = null;
  @property(Label) public hintLabel: Label | null = null;

  isOpen = false;
  private cellSize = 120;
  onPick: (key: string) => void = () => {};

  onLoad() {
    this.node.on(Node.EventType.TOUCH_END, (event: any) => {
      if (event?.target === this.node) this.close();
    });
    this.bindNodes();
    this.node.active = false;
  }

  private bindNodes(): void {
    if (!this.contentNode) {
      this.contentNode = this.findDescendant(this.node, 'content');
    }
    if (!this.closeButton) {
      this.closeButton = this.findDescendant(this.node, 'CloseBth')
        || this.findDescendant(this.node, 'close')
        || this.findDescendant(this.node, 'btn_close');
    }
    if (!this.titleLabel) {
      const titleNode = this.findDescendant(this.node, 'Title') || this.findDescendant(this.node, 'title');
      if (titleNode) this.titleLabel = titleNode.getComponent(Label) || titleNode.getComponentInChildren(Label);
    }
    if (!this.hintLabel) {
      const hintNode = this.findDescendant(this.node, 'lb_hint');
      if (hintNode) this.hintLabel = hintNode.getComponent(Label) || hintNode.getComponentInChildren(Label);
    }

    if (this.closeButton) {
      this.closeButton.off(Button.EventType.CLICK);
      this.closeButton.on(Button.EventType.CLICK, () => this.close());
      this.closeButton.off(Node.EventType.TOUCH_END);
      this.closeButton.on(Node.EventType.TOUCH_END, () => this.close());
    }
  }

  open(title: string, hint: string, rows: PickerRow[], onPick: (key: string) => void): void {
    if (!this.contentNode) this.bindNodes();
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
  private cellSize = 120;
    this.node.active = false;
  }

  private render(rows: PickerRow[]): void {
    const content = this.contentNode;
    if (!content) return;

    const children = content.children;

    // 复用已有子节点
    children.forEach((child, index) => {
      if (index < rows.length) {
        child.active = true;
        this.bindBaseItem(child, rows[index]);
      } else {
        child.active = false;
      }
    });

    // 不够时：优先克隆，没有则动态创建
    const template = children.length > 0 ? children[0] : null;
    for (let index = children.length; index < rows.length; index++) {
      const cell = template ? instantiate(template) : this.createCell();
      cell.active = true;
      content.addChild(cell);
      this.bindBaseItem(cell, rows[index]);
    }

    const layout = content.getComponent(Layout) || content.addComponent(Layout);
    this.cellSize = this.detectCellSize(layout, content);
    layout.cellSize = new Size(this.cellSize, this.cellSize);
    layout.updateLayout();
    const scroll = content.parent?.parent?.getComponent(ScrollView);
    if (scroll) scroll.scrollToTop(0);
  }

  private bindBaseItem(cell: Node, row: PickerRow): void {
    const data: BaseItemData = {
      key: row.key,
      name: row.name,
      icon: row.icon,
      count: row.count ?? this.parseCount(row.sub),
      category: row.category,
      disabled: row.disabled,
    };
    let bi = cell.getComponent(BaseItem) || cell.addComponent(BaseItem);
    bi.init(data, (d) => {
      this.close();
      this.onPick(d.key);
    });
  }

  private parseCount(sub: string): number {
    const match = /(\d+)/.exec(sub);
    return match ? parseInt(match[1], 10) : 1;
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

  private createCell(): Node {
    const n = new Node('BaseItem');
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform).setContentSize(this.cellSize, this.cellSize);
    return n;
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
