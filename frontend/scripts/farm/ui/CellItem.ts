/**
 * ui/CellItem.ts —— 背包格子单项组件
 * 复用预制体里已有的子节点（icon / name / count / sell_btn），只做查找+赋值，不再动态生成节点。
 */
import { _decorator, Button, Component, EventTouch, Label, Node, resources, Sprite, SpriteFrame, UITransform } from 'cc';
import type { InventoryStack } from '../data/ItemData';

const { ccclass } = _decorator;
const CELL = 97.33;

@ccclass('CellItem')
export class CellItem extends Component {
  init(data: InventoryStack, onSell: (id: string) => void, onDetail: (st: InventoryStack) => void) {
    const ut = this.getComponent(UITransform) || this.node.addComponent(UITransform);
    ut.setContentSize(CELL, CELL);

    // 复用预制体里的子节点：先按名字找，找不到就用组件兜底；都不存在则跳过，绝不生成重复节点
    const iconNode  = this.findNode(['icon', 'Icon', 'IconSprite', 'sp_icon', 'icon_sprite', 'Sprite']);
    const nameNode  = this.findNode(['name', 'NameLabel', 'label_name', 'lb_name', 'nameLabel']);
    const countNode = this.findNode(['count', 'CountLabel', 'lb_count', 'countLabel']);
    const sellNode  = this.findNode(['sell_btn', 'SellBtn', 'SellBadge', 'btn_sell', 'sell']);

    // 图标
    if (iconNode) {
      const sp = iconNode.getComponent(Sprite) || iconNode.getComponentInChildren(Sprite);
      if (sp) {
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        this.loadIcon(sp, data.icon || '');
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

  /** 在自身子树里按候选名查找节点（广度优先，不生成新节点） */
  private findNode(names: string[]): Node | null {
    const queue: Node[] = [...this.node.children];
    while (queue.length) {
      const n = queue.shift()!;
      if (names.indexOf(n.name) >= 0) return n;
      queue.push(...n.children);
    }
    return null;
  }

  /** 多路径精准加载 SpriteFrame（支持 Cocos 3.x 的 /spriteFrame 子资产路径） */
  private loadIcon(sp: Sprite, icon: string) {
    const paths = [
      icon.startsWith('textures/') ? `${icon}/spriteFrame` : `textures/items/${icon}/spriteFrame`,
      icon.startsWith('textures/') ? icon : `textures/items/${icon}`,
      `textures/items/${icon}/spriteFrame`,
      `textures/items/${icon}`,
      `textures/items/fruit_${icon}/spriteFrame`,
      `textures/items/seed_${icon}/spriteFrame`,
      `textures/items/fert_${icon}/spriteFrame`,
      `textures/ui/cell/spriteFrame`,
      `textures/ui/cell`,
    ];

    const tryLoad = (idx: number) => {
      if (idx >= paths.length) return;
      resources.load(paths[idx], SpriteFrame, (err, sf) => {
        if (!err && sf && sp) {
          sp.spriteFrame = sf;
        } else {
          tryLoad(idx + 1);
        }
      });
    };
    tryLoad(0);
  }
}