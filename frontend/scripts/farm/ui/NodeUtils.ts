/**
 * ui/NodeUtils.ts —— UI 通用小工具（按名字找节点、切 active、填进度条、复用列表格子）
 *
 * 统一约定：**节点全部在 Cocos 里摆好**，代码只查找 / 切显隐 / 换图 / 填字 / 播动画，
 * 不在运行时创建 UI 节点。各面板共用这里的函数，避免每个文件都写一遍 findLabel / setActive。
 */
import { Button, Color, Component, Label, Layout, Node, ScrollView, Size, Sprite, Toggle, UITransform } from 'cc';

/** 前缀归一化：`lb_growth`、`bar_moisture`、`btn_shop` 之类的命名差异都能被找到 */
function normalize(name: string): string {
  return String(name ?? '').trim().toLowerCase().replace(/^(lb|lbl|node|img|sp|icon|btn|bar)_/, '');
}

/** 广度优先按名字查找：先精确匹配，再忽略大小写与前缀；不会生成节点 */
export function findChild(root: Node | null, ...names: string[]): Node | null {
  if (!root) return null;
  const wanted = names.map(normalize);
  const queue: Node[] = [root];
  let fallback: Node | null = null;
  while (queue.length > 0) {
    const node = queue.shift() as Node;
    if (names.includes(node.name)) return node;
    if (!fallback && wanted.includes(normalize(node.name))) fallback = node;
    queue.push(...node.children);
  }
  return fallback;
}

export function findLabel(root: Node | null, ...names: string[]): Label | null {
  const node = findChild(root, ...names);
  if (!node) return null;
  return node.getComponent(Label) || node.getComponentInChildren(Label);
}

export function findSprite(root: Node | null, ...names: string[]): Sprite | null {
  const node = findChild(root, ...names);
  if (!node) return null;
  return node.getComponent(Sprite) || node.getComponentInChildren(Sprite);
}

export function setActive(node: Node | null | undefined, active: boolean): void {
  if (node && node.isValid && node.active !== active) node.active = active;
}

/** 进度条：`maxWidth > 0` 时按宽度缩放，否则用 sprite 的 fillRange（0~1） */
export function setBar(fill: Sprite | null, ratio: number, maxWidth = 0): void {
  if (!fill) return;
  const clamped = Math.min(1, Math.max(0, ratio));
  if (maxWidth > 0) {
    const transform = fill.getComponent(UITransform) || fill.addComponent(UITransform);
    transform.setContentSize(maxWidth * clamped, transform.height);
  } else {
    fill.fillRange = clamped;
  }
}

/** 把「作物适宜区间」画成进度条上的一段高亮：只改 width / x，不新建节点 */
export function setRange(rangeNode: Node | null, barNode: Node | null, range: [number, number] | null): void {
  if (!rangeNode) return;
  setActive(rangeNode, !!range);
  if (!range || !barNode) return;
  const width = barNode.getComponent(UITransform)?.width ?? 100;
  const low = Math.min(1, Math.max(0, range[0] / 100));
  const high = Math.min(1, Math.max(0, range[1] / 100));
  const transform = rangeNode.getComponent(UITransform) || rangeNode.addComponent(UITransform);
  transform.setContentSize(Math.max(2, width * (high - low)), transform.height || 8);
  rangeNode.setPosition(((low + high) / 2) * width - width / 2, rangeNode.position.y, 0);
}

/** 按钮点击（场景节点没挂 Button 时补一个，仍然不新建节点） */
export function bindClick(node: Node | null | undefined, handler: () => void): void {
  if (!node) return;
  const button = node.getComponent(Button) || node.addComponent(Button);
  button.transition = Button.Transition.SCALE;
  button.zoomScale = 0.92;
  node.off(Button.EventType.CLICK);
  node.on(Button.EventType.CLICK, handler);
}

const CHECK_MARK_NAMES = ['checkmark', 'checkMark', 'CheckMark', 'mark'];

/** 勾选框：优先用 Toggle 组件，没有就按子节点 `checkmark` 的显隐表示勾选 */
export function bindToggle(node: Node | null | undefined, handler: (checked: boolean) => void): void {
  if (!node) return;
  const toggle = node.getComponent(Toggle);
  if (toggle) {
    node.off(Toggle.EventType.TOGGLE);
    node.on(Toggle.EventType.TOGGLE, (event: { isChecked?: boolean }) => handler(!!event?.isChecked));
    return;
  }
  const mark = CHECK_MARK_NAMES.map(name => node.getChildByName(name)).find(child => !!child) ?? null;
  node.off(Node.EventType.TOUCH_END);
  node.on(Node.EventType.TOUCH_END, () => {
    const checked = !(mark ? mark.active : false);
    setActive(mark, checked);
    handler(checked);
  });
}

/** 点击面板根节点的空白处（没有落在子节点上）→ 关闭 */
export function closeOnOutsideTouch(owner: Component, close: () => void): void {
  owner.node.on(Node.EventType.TOUCH_END, (event: { target?: Node | null }) => {
    if (event?.target === owner.node) close();
  });
}

/** 面板弹到父节点最上层 */
export function showOnTop(node: Node): void {
  const parent = node.parent;
  node.setSiblingIndex(parent ? parent.children.length - 1 : 0);
}

/**
 * 列表复用：编辑器里预置的格子够就切 active，不够就克隆第一个当模板。
 * `bind` 只负责往格子里填数据，不参与创建节点。
 */
export function renderCells(
  content: Node | null,
  count: number,
  bind: (cell: Node, index: number) => void,
): void {
  if (!content) return;
  const children = content.children;
  children.forEach((child, index) => {
    setActive(child, index < count);
    if (index < count) bind(child, index);
  });
  const template = children.length > 0 ? children[0] : null;
  for (let index = children.length; index < count && template; index++) {
    const cell = template.clone();
    cell.active = true;
    content.addChild(cell);
    bind(cell, index);
  }
  content.getComponent(Layout)?.updateLayout();
  const scroll = content.parent?.getComponent(ScrollView) || content.parent?.parent?.getComponent(ScrollView);
  scroll?.scrollToTop(0);
}

// ---------------------------------------------------------------- 面板通用装配

export const TAB_ACTIVE = new Color(58, 42, 18, 255);
export const TAB_IDLE = new Color(243, 232, 207, 255);

/** 找到 ScrollView 与它的 content，顺手把布局格子尺寸与锚点设好 */
export function bindScrollList(
  root: Node,
  cellSize = 97.33,
): { scroll: ScrollView | null; content: Node | null; panel: Node } {
  const panel = findChild(root, 'Panel') || root;
  const scroll = findChild(panel, 'ScrollView')?.getComponent(ScrollView) ?? null;
  if (scroll) scroll.verticalScrollBar = null;
  const content = scroll ? (scroll.content ?? findChild(scroll.node, 'content')) : findChild(panel, 'content');
  if (content && scroll) scroll.content = content;
  if (content) {
    const layout = content.getComponent(Layout) || content.addComponent(Layout);
    layout.cellSize = new Size(cellSize, cellSize);
    content.getComponent(UITransform)?.setAnchorPoint(0.5, 1);
  }
  return { scroll, content, panel };
}

/** 一排 tab：按名字绑定点击，返回「设置选中项」的函数（选中项加粗 + 换色） */
export function bindTabs(
  toolbar: Node | null,
  names: string[],
  onSelect: (index: number) => void,
): (active: number) => void {
  const tabs = names
    .map(name => (toolbar ? findChild(toolbar, name) : null))
    .filter((node): node is Node => !!node);
  tabs.forEach((tab, index) => {
    tab.off(Button.EventType.CLICK);
    tab.on(Button.EventType.CLICK, () => onSelect(index));
  });
  return active => {
    tabs.forEach((tab, index) => {
      const label = tab.getComponentInChildren(Label);
      if (!label) return;
      label.color = index === active ? TAB_ACTIVE : TAB_IDLE;
      label.isBold = index === active;
    });
  };
}
