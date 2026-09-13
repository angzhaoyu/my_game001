/**
 * ui/CellItem.ts —— 背包格子单项
 *
 * 只填预制体里已有的子节点（icon / name / count / sell_btn），不动态生成节点。
 */
import { _decorator, Component, EventTouch, Node, Sprite, UITransform } from 'cc';
import type { InventoryStack } from '../data/ItemData';
import { applySprite, itemPaths } from './Assets';
import { bindClick, findChild, findLabel, findSprite } from './NodeUtils';

const { ccclass } = _decorator;
const CELL = 97.33;

@ccclass('CellItem')
export class CellItem extends Component {
  init(data: InventoryStack, onSell: (itemId: string) => void, onDetail: (stack: InventoryStack) => void): void {
    const transform = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
    transform.setContentSize(CELL, CELL);

    const icon = findSprite(this.node, 'icon', 'Sprite');
    if (icon) {
      icon.sizeMode = Sprite.SizeMode.CUSTOM;
      applySprite(icon, itemPaths(data.icon));
    }

    const name = findLabel(this.node, 'lb_name', 'name');
    if (name) name.string = data.name;
    const count = findLabel(this.node, 'lb_count', 'count');
    if (count) count.string = `×${data.count}`;

    const sell = findChild(this.node, 'sell_btn', 'btn_sell', 'SellBtn', 'SellBadge', 'sell');
    if (sell) {
      bindClick(sell, () => onSell(data.id));
      const label = findLabel(sell, 'label', 'lb_sell');
      if (label) label.string = `出售 ${data.value}`;
      // 出售按钮不吃掉冒泡的话，会连带触发「看详情」
      sell.off(Node.EventType.TOUCH_END);
      sell.on(Node.EventType.TOUCH_END, (event: EventTouch) => { event.propagationStopped = true; });
    }

    this.node.off(Node.EventType.TOUCH_END);
    this.node.on(Node.EventType.TOUCH_END, () => onDetail(data));
  }
}
