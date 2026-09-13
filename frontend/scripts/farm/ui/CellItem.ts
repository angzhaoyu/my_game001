import { findNamedChild, loadItemIcon } from './Ui';
/**
 * ui/CellItem.ts —— 背包格子单项组件
 * 复用预制体里已有的子节点（icon / name / count / sell_btn），只做查找+赋值，不再动态生成节点。
 */
import { _decorator, Button, Component, EventTouch, Label, Node, Sprite, UITransform } from 'cc';
import type { InventoryStack } from '../data/ItemData';

const { ccclass } = _decorator;
const CELL = 97.33;

@ccclass('CellItem')
export class CellItem extends Component {
  init(data: InventoryStack, onSell: (id: string) => void, onDetail: (st: InventoryStack) => void) {
    const ut = this.getComponent(UITransform) || this.node.addComponent(UITransform);
    ut.setContentSize(CELL, CELL);

    // 复用预制体里的子节点：先按名字找，找不到就用组件兜底；都不存在则跳过，绝不生成重复节点
    const iconNode  = findNamedChild(this.node, ['icon', 'Icon', 'IconSprite', 'sp_icon', 'icon_sprite', 'Sprite']);
    const nameNode  = findNamedChild(this.node, ['name', 'NameLabel', 'label_name', 'lb_name', 'nameLabel']);
    const countNode = findNamedChild(this.node, ['count', 'CountLabel', 'lb_count', 'countLabel']);
    const sellNode  = findNamedChild(this.node, ['sell_btn', 'SellBtn', 'SellBadge', 'btn_sell', 'sell']);

    // 图标
    if (iconNode) {
      const sp = iconNode.getComponent(Sprite) || iconNode.getComponentInChildren(Sprite);
      if (sp) {
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        loadItemIcon(sp, data.icon || '', true);
      }
    }

    // 名称
    const nameLb = nameNode ? (nameNode.getComponent(Label) || nameNode.getComponentInChildren(Label)) : null;
    if (nameLb) nameLb.string = data.name;

    // 数量
    const countLb = countNode ? (countNode.getComponent(Label) || countNode.getComponentInChildren(Label)) : null;
    if (countLb) countLb.string = 'x' + data.count;

    // 出售按钮
    if (sellNode) {
      const btn = sellNode.getComponent(Button) || sellNode.getComponentInChildren(Button);
      if (btn) {
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.95;
      }
      sellNode.off(Button.EventType.CLICK);
      sellNode.on(Button.EventType.CLICK, () => onSell(data.id));
      sellNode.off(Node.EventType.TOUCH_END);
      sellNode.on(Node.EventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; });

      const sellLb = sellNode.getComponentInChildren(Label);
      if (sellLb) sellLb.string = '出售 ' + data.value;
    }

    // 点击格子看详情
    this.node.off(Node.EventType.TOUCH_END);
    this.node.on(Node.EventType.TOUCH_END, () => onDetail(data));
  }

}
