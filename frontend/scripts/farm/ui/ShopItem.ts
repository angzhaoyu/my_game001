import { findNamedChild, loadItemIcon } from './Ui';
/**
 * ui/ShopItem.ts —— 商店物品卡单项组件
 * 复用预制体里已有的子节点（icon / name / price / resale / buy_btn），只做查找+赋值，不再动态生成节点。
 */
import { _decorator, Button, Color, Component, Label, Node, Sprite, UITransform } from 'cc';
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
    const iconNode   = findNamedChild(this.node, ['icon', 'Icon', 'IconSprite', 'sp_icon', 'icon_sprite', 'Sprite']);
    const nameNode   = findNamedChild(this.node, ['name', 'NameLabel', 'label_name', 'lb_name', 'nameLabel']);
    const priceNode  = findNamedChild(this.node, ['price', 'PriceLabel', 'lb_price', 'priceLabel']);
    const resaleNode = findNamedChild(this.node, ['resale', 'ResaleLabel', 'lb_resale', 'resaleLabel']);
    const btnNode    = findNamedChild(this.node, ['buy_btn', 'BuyBtn', 'btn_buy', 'buy']);

    // 图标
    if (iconNode) {
      const sp = iconNode.getComponent(Sprite) || iconNode.getComponentInChildren(Sprite);
      if (sp) {
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        loadItemIcon(sp, def.icon || '');
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

}
