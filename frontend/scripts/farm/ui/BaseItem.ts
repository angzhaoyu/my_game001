/**
 * ui/BaseItem.ts —— 通用物品选择单元格（施肥、除虫、播种时使用）
 *
 * 预制体结构：
 *   BaseItem
 *   ├─ cell_bg     Sprite  单元格背景
 *   ├─ icon        Sprite  物品图标
 *   ├─ lb_name     Label   物品名称
 *   ├─ lb_count    Label   物品数量
 *   └─ select      Node
 *      └─ btn_select Button 选择按钮
 *      └─ Label     Label  「选择」
 *
 * 如果预制体不存在，代码自动创建最基本的子节点。
 */
import { _decorator, Button, Color, Component, Label, Layers, Node, Sprite, UITransform } from 'cc';
import { applySprite } from './Assets';

const { ccclass } = _decorator;
const CELL = 97.33;

export interface BaseItemData {
  key: string;
  name: string;
  icon: string;
  count: number;
  category?: string;
  disabled?: boolean;
}

@ccclass('BaseItem')
export class BaseItem extends Component {
  private data: BaseItemData | null = null;
  onSelect: (data: BaseItemData) => void = () => {};

  onLoad() {
    const ut = this.getComponent(UITransform) || this.node.addComponent(UITransform);
    ut.setContentSize(CELL, CELL);
  }

  init(data: BaseItemData, onSelect?: (data: BaseItemData) => void) {
    this.data = data;
    if (onSelect) this.onSelect = onSelect;

    if (this.node.children.length === 0) {
      this.buildFallbackUI();
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

    // ---- btn_select ----
    const btnNode = this.findNode('btn_select');
    if (btnNode) {
      const btn = btnNode.getComponent(Button) || btnNode.getComponentInChildren(Button);
      if (btn) {
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 0.95;
        btn.interactable = !data.disabled && data.count > 0;
      }
      btnNode.off(Button.EventType.CLICK);
      btnNode.on(Button.EventType.CLICK, () => {
        if (this.data && !this.data.disabled && this.data.count > 0) {
          this.onSelect(this.data);
        }
      });
    }
  }

  private buildFallbackUI(): void {
    this.node.layer = Layers.Enum.UI_2D;

    const ut = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
    const W = ut.contentSize.width || 97;
    const halfH = ut.contentSize.height / 2 || 48;
    const fontSize = Math.max(10, Math.min(14, Math.floor(W / 8)));

    const nameNode = new Node('lb_name');
    nameNode.layer = Layers.Enum.UI_2D;
    nameNode.addComponent(UITransform).setContentSize(W - 8, 20);
    const nameLb = nameNode.addComponent(Label);
    nameLb.fontSize = fontSize;
    nameLb.lineHeight = 16;
    nameLb.color = new Color(255, 255, 255, 255);
    nameLb.horizontalAlign = Label.HorizontalAlign.CENTER;
    nameLb.verticalAlign = Label.VerticalAlign.CENTER;
    nameLb.overflow = Label.Overflow.CLAMP;
    nameNode.setPosition(0, halfH - 4, 0);
    this.node.addChild(nameNode);

    const countNode = new Node('lb_count');
    countNode.layer = Layers.Enum.UI_2D;
    countNode.addComponent(UITransform).setContentSize(W - 8, 16);
    const countLb = countNode.addComponent(Label);
    countLb.fontSize = Math.max(10, fontSize - 2);
    countLb.lineHeight = 14;
    countLb.color = new Color(200, 200, 200, 255);
    countLb.horizontalAlign = Label.HorizontalAlign.CENTER;
    countLb.verticalAlign = Label.VerticalAlign.CENTER;
    countLb.overflow = Label.Overflow.CLAMP;
    countNode.setPosition(0, halfH - 26, 0);
    this.node.addChild(countNode);

    const selectNode = new Node('btn_select');
    selectNode.layer = Layers.Enum.UI_2D;
    selectNode.addComponent(UITransform).setContentSize(W - 16, 18);
    const selBtn = selectNode.addComponent(Button);
    selBtn.transition = Button.Transition.SCALE;
    selBtn.zoomScale = 0.92;
    const selLbNode = new Node('Label');
    selLbNode.layer = Layers.Enum.UI_2D;
    selLbNode.addComponent(UITransform).setContentSize(W - 16, 18);
    const selLb = selLbNode.addComponent(Label);
    selLb.string = '选择';
    selLb.fontSize = Math.max(10, fontSize - 2);
    selLb.lineHeight = 14;
    selLb.color = new Color(58, 42, 18, 255);
    selLb.horizontalAlign = Label.HorizontalAlign.CENTER;
    selLb.verticalAlign = Label.VerticalAlign.CENTER;
    selectNode.addChild(selLbNode);
    selectNode.setPosition(0, -halfH + 2, 0);
    this.node.addChild(selectNode);
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

  private loadItemIcon(sp: Sprite, data: BaseItemData) {
    const rawIcon = data.icon || data.key;
    const cat = data.category || '';
    const categoryFolder = cat === 'pesticide' ? 'pesticide'
      : cat === 'fert' ? 'fertilizer'
      : cat === 'medicine' ? 'pesticide'
      : cat || 'seed';
    
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
