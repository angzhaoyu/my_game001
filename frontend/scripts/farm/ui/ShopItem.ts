/**
 * ui/ShopItem.ts —— 商店物品卡单项
 *
 * 只填预制体里已有的子节点（icon / name / price / resale / buy_btn），不动态生成节点。
 */
import { _decorator, Button, Component, Sprite, UITransform } from 'cc';
import type { ShopDef } from '../data/ItemData';
import { applySprite, itemPaths } from './Assets';
import { bindClick, findChild, findLabel, findSprite } from './NodeUtils';

const { ccclass } = _decorator;
const CELL = 97.33;

@ccclass('ShopItem')
export class ShopItem extends Component {
  init(def: ShopDef, canBuy: boolean, onBuy: (def: ShopDef) => void): void {
    const transform = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
    transform.setContentSize(CELL, CELL);

    const icon = findSprite(this.node, 'icon', 'Sprite');
    if (icon) {
      icon.sizeMode = Sprite.SizeMode.CUSTOM;
      applySprite(icon, itemPaths(def.icon));
    }

    const name = findLabel(this.node, 'lb_name', 'name');
    if (name) name.string = def.name;
    const resale = findLabel(this.node, 'lb_resale', 'resale');
    if (resale) resale.string = `回收 ${def.value}`;

    // 买不起时只改按钮的可点状态，不重建节点
    const buy = findChild(this.node, 'buy_btn', 'btn_buy', 'BuyBtn', 'buy');
    if (buy) {
      bindClick(buy, () => onBuy(def));
      const button = buy.getComponent(Button);
      if (button) button.interactable = canBuy;
      const label = findLabel(buy, 'label', 'lb_buy');
      if (label) label.string = canBuy ? '购买' : '金币不足';
    }
    const price = findLabel(this.node, 'lb_price', 'price');
    if (price) price.string = `价格 ${def.price}`;
  }
}
