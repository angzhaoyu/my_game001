/**
 * ui/ShopItem.ts —— 商店物品卡单项组件
 * 复用预制体里已有的子节点（icon / name / price / resale / buy_btn），只做查找+赋值，不再动态生成节点。
 */
import { _decorator, Button, Color, Component, Label, Node, resources, Sprite, SpriteFrame, UITransform } from 'cc';
import type { ShopDef } from '../data/ItemData';

const { ccclass } = _decorator;
const CELL = 97.33;
const C_PRICE  = new Color(58, 42, 18, 255);
const C_POOR   = new Color(192, 57, 43, 255);

@ccclass('ShopItem')
export class ShopItem extends Component {
  init(def: ShopDef, canBuy: boolean, onBuy: (def: ShopDef) => void) {
    const ut = this.getComponent(UITransform) || this.node.addComponent(UITransform);
    ut.setContentSize(CELL, CELL);

    // 复用预制体里的子节点：先按名字找，找不到就用组件兜底；都不存在则跳过，绝不生成重复节点
    const iconNode   = this.findNode(['icon', 'Icon', 'IconSprite', 'sp_icon', 'icon_sprite', 'Sprite']);
    const nameNode   = this.findNode(['name', 'NameLabel', 'label_name', 'lb_name', 'nameLabel']);
    const priceNode  = this.findNode(['price', 'PriceLabel', 'lb_price', 'priceLabel']);
    const resaleNode = this.findNode(['resale', 'ResaleLabel', 'lb_resale', 'resaleLabel']);
    const btnNode    = this.findNode(['buy_btn', 'BuyBtn', 'btn_buy', 'buy']);

    // 图标
    if (iconNode) {
      const sp = iconNode.getComponent(Sprite) || iconNode.getComponentInChildren(Sprite);
      if (sp) {
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        this.loadIcon(sp, def.icon || '');
      }
    }

    // 名称
    const nameLb = nameNode ? (nameNode.getComponent(Label) || nameNode.getComponentInChildren(Label)) : null;
    if (nameLb) nameLb.string = def.name;

    // 价格
    const priceLb = priceNode ? (priceNode.getComponent(Label) || priceNode.getComponentInChildren(Label)) : null;
    if (priceLb) {
      priceLb.string = '价格 ' + def.price;
      priceLb.color = canBuy ? C_PRICE : C_POOR;
    }

    // 回收价
    const resaleLb = resaleNode ? (resaleNode.getComponent(Label) || resaleNode.getComponentInChildren(Label)) : null;
    if (resaleLb) resaleLb.string = '回收 ' + def.value;

    // 购买按钮
    if (btnNode) {
      const btn = btnNode.getComponent(Button) || btnNode.getComponentInChildren(Button);
      if (btn) {
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.95;
        btn.interactable = canBuy;
      }
      btnNode.off(Button.EventType.CLICK);
      btnNode.on(Button.EventType.CLICK, () => onBuy(def));

      const btnLb = btnNode.getComponentInChildren(Label);
      if (btnLb) btnLb.string = '购买';
    }
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