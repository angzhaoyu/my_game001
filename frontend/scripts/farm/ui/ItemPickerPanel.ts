/**
 * ui/ItemPickerPanel.ts —— 通用物品选择框（种子 / 药品共用）
 *
 * 布局在 Cocos 里搭好：`ScrollView/view/content` 下预置若干 Cell，代码只填图标 / 名称 / 副标题
 * 并绑定点击；格子不够时克隆第一个当模板（不新建布局节点）。
 *
 * ```text
 * Panel
 * ├─ lb_title / lb_hint      Label
 * ├─ ScrollView/view/content Node   每格：icon(Sprite) + lb_name(Label) + lb_count(Label)
 * └─ btn_close               Button
 * ```
 */
import { _decorator, Component, Label, Node } from 'cc';
import { applySprite, itemPaths } from './Assets';
import { bindClick, closeOnOutsideTouch, findChild, findLabel, findSprite, renderCells, showOnTop } from './NodeUtils';

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

  onLoad(): void {
    closeOnOutsideTouch(this, () => this.close());
    this.contentNode = this.contentNode || findChild(this.node, 'content', 'contentNode');
    const close = this.closeButton || findChild(this.node, 'btn_close', 'closeButton');
    bindClick(close, () => this.close());
    this.node.active = false;
  }

  open(title: string, hint: string, rows: PickerRow[], onPick: (key: string) => void): void {
    this.onPick = onPick;
    this.isOpen = true;
    this.node.active = true;
    showOnTop(this.node);
    if (this.titleLabel) this.titleLabel.string = title;
    if (this.hintLabel) this.hintLabel.string = hint;
    renderCells(this.contentNode, rows.length, (cell, index) => this.bindCell(cell, rows[index]));
  }

  close(): void {
    this.isOpen = false;
    this.node.active = false;
  }

  private bindCell(cell: Node, row: PickerRow): void {
    const icon = findSprite(cell, 'icon');
    if (icon) applySprite(icon, itemPaths(row.icon));
    const name = findLabel(cell, 'lb_name', 'name');
    if (name) name.string = row.name;
    const sub = findLabel(cell, 'lb_count', 'lb_sub', 'sub');
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
