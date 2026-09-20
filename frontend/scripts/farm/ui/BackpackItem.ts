/**
 * ui/BackpackItem.ts —— 背包物品单元格组件
 *
 * 预制体结构：
 *   BackpackItem
 *   ├─ cell_bg     Sprite  单元格背景（果实时根据品质变色）
 *   ├─ icon        Sprite  物品图标
 *   ├─ lb_name     Label   物品名称
 *   ├─ lb_count    Label   物品数量（如「剩余:10」）
 *   ├─ price       Node
 *   │  ├─ Sprite   Sprite
 *   │  └─ lb_price Label   价格
 *   └─ buy         Node
 *      └─ btn_buy  Button  出售按钮
 *      └─ lb_buy_text Label「出售」
 *
 * 如果预制体不存在（content 为空时动态创建的裸节点），
 * 代码会自动创建最基本的子节点以保证内容可见。
 */
import { _decorator, Button, Color, Component, EventTouch, Label, Layers, Node, Sprite, UITransform } from 'cc';
import type { InventoryStack } from '../data/ItemData';
import { QUALITY_GRADE_COLORS } from '../data/ItemData';
import { applySprite } from './Assets';

const { ccclass } = _decorator;
const CELL = 97.33;

@ccclass('BackpackItem')
export class BackpackItem extends Component {
  private data: InventoryStack | null = null;
  onSell: (data: InventoryStack) => void = () => {};
  onDetail: (data: InventoryStack) => void = () => {};

  onLoad() {
    const ut = this.getComponent(UITransform) || this.node.addComponent(UITransform);
    ut.setContentSize(CELL, CELL);
  }

  init(
    data: InventoryStack,
    onSell?: (data: InventoryStack) => void,
    onDetail?: (data: InventoryStack) => void,
  ) {
    this.data = data;
    if (onSell) this.onSell = onSell;
    if (onDetail) this.onDetail = onDetail;

    // 如果节点没有任何子节点 → 自动创建最基本的 UI
    if (this.node.children.length === 0) {
      this.buildFallbackUI();
    }

    // ---- cell_bg ----
    const cellBg = this.findNode('cell_bg');
    if (cellBg) {
      const sp = cellBg.getComponent(Sprite) || cellBg.getComponentInChildren(Sprite);
      if (sp && data.category === 'fruit' && data.qualityGrade) {
        const colorDef = QUALITY_GRADE_COLORS[data.qualityGrade];
        if (colorDef) sp.color = new Color(colorDef.r, colorDef.g, colorDef.b, 255);
        else sp.color = Color.WHITE;
      } else if (sp) {
        sp.color = Color.WHITE;
      }
    }

    // ---- icon ----
    const iconNode = this.findNode('icon');
    if (iconNode) {
      const sp = iconNode.getComponent(Sprite) || iconNode.getComponentInChildren(Sprite);
      if (sp && data.icon) this.loadItemIcon(sp, data);
      else if (sp) sp.spriteFrame = null;
    }

    // ---- lb_name ----
    const nameNode = this.findNode('lb_name');
    if (nameNode) {
      const lb = nameNode.getComponent(Label) || nameNode.getComponentInChildren(Label);
      if (lb) lb.string = data.name;
    }

    // ---- lb_count ----
    const countNode = this.findNode('lb_count');
    if (countNode) {
      const lb = countNode.getComponent(Label) || countNode.getComponentInChildren(Label);
      if (lb) lb.string = `剩余:${data.count}`;
    }

    // ---- price ----
    const priceNode = this.findNode('lb_price');
    if (priceNode) {
      const lb = priceNode.getComponent(Label) || priceNode.getComponentInChildren(Label);
      if (lb) {
        let price = data.value;
        if (data.category === 'fruit' && data.qualityMultiplier) {
          price = Math.round(data.value * data.qualityMultiplier);
        }
        lb.string = String(price);
      }
    }

    // ---- buy（出售按钮） ----
    const btnNode = this.findNode('btn_buy');
    if (btnNode) {
      const btn = btnNode.getComponent(Button) || btnNode.getComponentInChildren(Button);
      if (btn) {
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.95;
      }
      btnNode.off(Button.EventType.CLICK);
      btnNode.on(Button.EventType.CLICK, () => {
        if (this.data) this.onSell(this.data);
      });
      btnNode.off(Node.EventType.TOUCH_END);
      btnNode.on(Node.EventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; });

      const buyLb = this.findNode('lb_buy_text');
      if (buyLb) {
        const lb = buyLb.getComponent(Label) || buyLb.getComponentInChildren(Label);
        if (lb) lb.string = '出售';
      }
    }

    // 点击格子看详情
    this.node.off(Node.EventType.TOUCH_END);
    this.node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      if (e.target === this.node && this.data) this.onDetail(this.data);
    });
  }

  /**
   * 当节点没有任何子节点时（动态创建的空白格子），
   * 自动创建最基本的 UI 元素以保证内容可见。
   */
  private buildFallbackUI(): void {
    this.node.layer = Layers.Enum.UI_2D;
    const ut = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
    const W = ut.contentSize.width || 97;
    const H = ut.contentSize.height || 97;
    const halfW = W / 2;
    const halfH = H / 2;
    const fontSize = Math.max(10, Math.min(14, Math.floor(W / 8)));

    // 名称 Label
    const nameNode = new Node('lb_name');
    nameNode.layer = Layers.Enum.UI_2D;
    const nameUT = nameNode.addComponent(UITransform);
    nameUT.setContentSize(W - 8, 20);
    nameUT.setAnchorPoint(0.5, 1);
    const nameLb = nameNode.addComponent(Label);
    nameLb.fontSize = fontSize;
    nameLb.lineHeight = 16;
    nameLb.color = new Color(255, 255, 255, 255);
    nameLb.horizontalAlign = Label.HorizontalAlign.CENTER;
    nameLb.verticalAlign = Label.VerticalAlign.CENTER;
    nameLb.overflow = Label.Overflow.CLAMP;
    nameNode.setPosition(0, halfH - 4, 0);
    this.node.addChild(nameNode);

    // 数量 Label
    const countNode = new Node('lb_count');
    countNode.layer = Layers.Enum.UI_2D;
    const countUT = countNode.addComponent(UITransform);
    countUT.setContentSize(W - 8, 16);
    countUT.setAnchorPoint(0.5, 1);
    const countLb = countNode.addComponent(Label);
    countLb.fontSize = Math.max(10, fontSize - 2);
    countLb.lineHeight = 14;
    countLb.color = new Color(200, 200, 200, 255);
    countLb.horizontalAlign = Label.HorizontalAlign.CENTER;
    countLb.verticalAlign = Label.VerticalAlign.CENTER;
    countLb.overflow = Label.Overflow.CLAMP;
    countNode.setPosition(0, halfH - 26, 0);
    this.node.addChild(countNode);

    // 价格 Label
    const priceNode = new Node('lb_price');
    priceNode.layer = Layers.Enum.UI_2D;
    const priceUT = priceNode.addComponent(UITransform);
    priceUT.setContentSize(W - 8, 16);
    priceUT.setAnchorPoint(0.5, 0);
    const priceLb = priceNode.addComponent(Label);
    priceLb.fontSize = Math.max(10, fontSize - 2);
    priceLb.lineHeight = 14;
    priceLb.color = new Color(255, 233, 176, 255);
    priceLb.horizontalAlign = Label.HorizontalAlign.CENTER;
    priceLb.verticalAlign = Label.VerticalAlign.CENTER;
    priceLb.overflow = Label.Overflow.CLAMP;
    priceNode.setPosition(0, -halfH + 20, 0);
    this.node.addChild(priceNode);

    // 出售按钮
    const buyNode = new Node('btn_buy');
    buyNode.layer = Layers.Enum.UI_2D;
    const buyUT = buyNode.addComponent(UITransform);
    buyUT.setContentSize(W - 16, 18);
    buyUT.setAnchorPoint(0.5, 0);
    const buyBtn = buyNode.addComponent(Button);
    buyBtn.transition = Button.Transition.SCALE;
    buyBtn.zoomScale = 0.92;
    const buyLbNode = new Node('lb_buy_text');
    buyLbNode.layer = Layers.Enum.UI_2D;
    buyLbNode.addComponent(UITransform).setContentSize(W - 16, 18);
    const buyLb = buyLbNode.addComponent(Label);
    buyLb.string = '出售';
    buyLb.fontSize = Math.max(10, fontSize - 2);
    buyLb.lineHeight = 14;
    buyLb.color = new Color(58, 42, 18, 255);
    buyLb.horizontalAlign = Label.HorizontalAlign.CENTER;
    buyLb.verticalAlign = Label.VerticalAlign.CENTER;
    buyNode.addChild(buyLbNode);
    buyNode.setPosition(0, -halfH + 2, 0);
    this.node.addChild(buyNode);
  }

  private findNode(name: string): Node | null {
    const queue: Node[] = [...this.node.children];
    while (queue.length) {
      const n = queue.shift()!;
      if (n.name === name) return n;
      queue.push(...n.children);
    }
    return null;
  }

  private loadItemIcon(sp: Sprite, data: InventoryStack) {
    const rawIcon = data.icon || data.id;
    const categoryFolder = data.category === 'pesticide' ? 'pesticide'
      : data.category === 'fert' ? 'fertilizer'
      : data.category;
    
    // 去掉前缀（如 fert_, med_, seed_, fruit_），只保留核心名称
    const icon = rawIcon.replace(/^(fert_|med_|seed_|fruit_)/, '');
    
    const paths = [
      `textures/${categoryFolder}/${icon}/spriteFrame`,
      `textures/${categoryFolder}/${icon}`,
      `textures/items/${icon}/spriteFrame`,
      `textures/items/${icon}`,
      `farm/crop/${icon}/spriteFrame`,
    ];
    applySprite(sp, paths);
  }
}
