/**
 * ui/FarmPicker.ts —— 通用选择弹窗（复用现有 panel / cell 资源）
 * 用于「种哪种种子」「施哪种肥」。UI 尽量少用代码画，主体用现有贴图。
 */
import {
  _decorator, Color, Component, Graphics, Label, Layers, Node, resources, Sprite, SpriteFrame, UITransform,
} from 'cc';

const { ccclass } = _decorator;

export interface PickerOption {
  key: string;        // 作物 id 或化肥 id
  name: string;       // 显示名
  icon: string;       // 贴图名（textures/items/ 下）
  sub?: string;       // 副标题，如 "x3" 或 "+25 养分"
  disabled?: boolean;
}

@ccclass('FarmPicker')
export class FarmPicker extends Component {
  private overlay!: Node;
  private listRoot!: Node;
  private onPick: (key: string) => void = () => {};
  private picked = false;

  onLoad() {
    this.build();
    this.node.active = false;
  }

  open(title: string, options: PickerOption[], onPick: (key: string) => void) {
    this.picked = false;
    this.onPick = onPick;

    const titleLb = this.node.getChildByName('title');
    if (titleLb) {
      const lb = titleLb.getComponent(Label);
      if (lb) lb.string = title;
    }

    // 重建选项
    this.listRoot.destroyAllChildren();
    const cellW = 108, cellH = 128, pad = 10, gap = 8;
    const totalW = options.length * cellW + (options.length - 1) * gap + pad * 2;
    const ut = this.listRoot.getComponent(UITransform) || this.listRoot.addComponent(UITransform);
    ut.setContentSize(totalW, cellH + pad * 2);

    options.forEach((opt, i) => {
      const cell = new Node('opt_' + i);
      cell.layer = Layers.Enum.UI_2D;
      cell.addComponent(UITransform).setContentSize(cellW, cellH);
      this.listRoot.addChild(cell);
      cell.setPosition((i - (options.length - 1) / 2) * (cellW + gap), 0);

      // 底色
      const bg = cell.addComponent(Graphics);
      bg.fillColor = opt.disabled ? new Color(70, 70, 70, 200) : new Color(120, 95, 55, 230);
      bg.roundRect(-cellW / 2, -cellH / 2, cellW, cellH, 8);
      bg.fill();

      // 图标
      const iconNode = new Node('icon');
      iconNode.layer = Layers.Enum.UI_2D;
      iconNode.addComponent(UITransform).setContentSize(46, 46);
      iconNode.setPosition(0, 18);
      cell.addChild(iconNode);
      const sp = iconNode.addComponent(Sprite);
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      loadItemIcon(opt.icon, sp);

      // 名称
      const nameNode = new Node('name');
      nameNode.layer = Layers.Enum.UI_2D;
      nameNode.addComponent(UITransform).setContentSize(cellW - 10, 20);
      nameNode.setPosition(0, -28);
      const nameLb = nameNode.addComponent(Label);
      nameLb.string = opt.name;
      nameLb.fontSize = 13;
      nameLb.color = new Color(255, 245, 220, 255);
      nameLb.horizontalAlign = Label.HorizontalAlign.CENTER;
      nameLb.verticalAlign = Label.VerticalAlign.CENTER;
      cell.addChild(nameNode);

      // 副标题
      if (opt.sub) {
        const subNode = new Node('sub');
        subNode.layer = Layers.Enum.UI_2D;
        subNode.addComponent(UITransform).setContentSize(cellW - 10, 16);
        subNode.setPosition(0, -50);
        const subLb = subNode.addComponent(Label);
        subLb.string = opt.sub;
        subLb.fontSize = 11;
        subLb.color = opt.disabled ? new Color(190, 190, 190, 255) : new Color(255, 220, 140, 255);
        subLb.horizontalAlign = Label.HorizontalAlign.CENTER;
        subLb.verticalAlign = Label.VerticalAlign.CENTER;
        cell.addChild(subNode);
      }

      if (!opt.disabled) {
        cell.on(Node.EventType.TOUCH_END, () => this.confirm(opt.key));
      }
    });

    this.node.active = true;
    this.node.setSiblingIndex(this.node.parent ? this.node.parent.children.length - 1 : 0);
  }

  close() {
    this.node.active = false;
  }

  private confirm(key: string) {
    if (this.picked) return;
    this.picked = true;
    this.node.active = false;
    this.onPick(key);
  }

  private build() {
    this.node.layer = Layers.Enum.UI_2D;

    this.overlay = new Node('overlay');
    this.overlay.layer = Layers.Enum.UI_2D;
    this.overlay.addComponent(UITransform).setContentSize(3000, 3000);
    const g = this.overlay.addComponent(Graphics);
    g.fillColor = new Color(0, 0, 0, 150);
    g.rect(-1500, -1500, 3000, 3000);
    g.fill();
    this.overlay.on(Node.EventType.TOUCH_END, () => this.close());
    this.node.addChild(this.overlay);

    // 标题
    const titleNode = new Node('title');
    titleNode.layer = Layers.Enum.UI_2D;
    titleNode.addComponent(UITransform).setContentSize(600, 40);
    titleNode.setPosition(0, 170);
    const titleLb = titleNode.addComponent(Label);
    titleLb.fontSize = 24;
    titleLb.color = new Color(255, 233, 176, 255);
    titleLb.horizontalAlign = Label.HorizontalAlign.CENTER;
    titleLb.verticalAlign = Label.VerticalAlign.CENTER;
    this.node.addChild(titleNode);

    this.listRoot = new Node('list');
    this.listRoot.layer = Layers.Enum.UI_2D;
    this.listRoot.addComponent(UITransform).setContentSize(200, 120);
    this.node.addChild(this.listRoot);
  }
}

/** 从 textures/items 加载图标（多路径兜底） */
export function loadItemIcon(icon: string, sp: Sprite): void {
  if (!icon) return;
  const paths = [
    `textures/items/${icon}/spriteFrame`,
    `textures/items/${icon}`,
    `farm/crop/${icon}/spriteFrame`,
    `farm/crop/${icon}`,
  ];
  const tryLoad = (idx: number) => {
    if (idx >= paths.length) return;
    resources.load(paths[idx], SpriteFrame, (err, sf) => {
      if (!err && sf && sp) sp.spriteFrame = sf;
      else tryLoad(idx + 1);
    });
  };
  tryLoad(0);
}