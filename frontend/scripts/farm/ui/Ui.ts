/**
 * ui/Ui.ts —— 节点查找与贴图加载工具
 *
 * 场景节点与贴图都在 Cocos 里摆好；代码只负责「换图」，不负责创建节点。
 * 这里做了一层缓存和路径兜底，避免每次刷新都重复 load。
 */
import { Node, Sprite, SpriteFrame, resources } from 'cc';

const spriteRequests = new WeakMap<Sprite, number>();
const cache = new Map<string, SpriteFrame | null>();
const pending = new Map<string, Array<(frame: SpriteFrame | null) => void>>();

export function loadSpriteFrame(path: string, callback: (frame: SpriteFrame | null) => void): void {
  if (!path) { callback(null); return; }
  if (cache.has(path)) { callback(cache.get(path) ?? null); return; }
  const queue = pending.get(path);
  if (queue) { queue.push(callback); return; }
  pending.set(path, [callback]);
  resources.load(path, SpriteFrame, (error, frame) => {
    const result = error || !frame ? null : frame;
    cache.set(path, result);
    const waiters = pending.get(path) || [];
    pending.delete(path);
    waiters.forEach(waiter => waiter(result));
  });
}

/** 依次尝试候选路径，第一个成功即应用到 sprite 上。 */
export function applySprite(sprite: Sprite | null, paths: string[]): void {
  if (!sprite) return;
  const request = (spriteRequests.get(sprite) || 0) + 1;
  spriteRequests.set(sprite, request);
  const tryIndex = (index: number) => {
    if (index >= paths.length) return;
    loadSpriteFrame(paths[index], frame => {
      if (!sprite.isValid || spriteRequests.get(sprite) !== request) return;
      if (frame) sprite.spriteFrame = frame;
      else tryIndex(index + 1);
    });
  };
  tryIndex(0);
}

/** 把路径模板里的 {col} / {state} 等占位符替换掉。 */
export function fillPath(pattern: string, values: Record<string, string | number>): string {
  return pattern.replace(/\{(\w+)\}/g, (_, key: string) =>
    values[key] === undefined ? `{${key}}` : String(values[key]));
}

/** 深度优先，包含根节点；用于场景装配与面板内查找。 */
export function findNode(root: Node | null, name: string): Node | null {
  if (!root) return null;
  if (root.name === name) return root;
  for (const child of root.children) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return null;
}

/** 广度优先，不包含根节点；候选名不改变节点遍历优先级。 */
export function findNamedChild(root: Node, names: string[]): Node | null {
  const queue = [...root.children];
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index];
    if (names.includes(node.name)) return node;
    queue.push(...node.children);
  }
  return null;
}

/** 格子图标保留原路径顺序；仅背包格子额外回退到空格背景。 */
export function loadItemIcon(sprite: Sprite, icon: string, cellFallback = false): void {
  const paths = [
    icon.startsWith('textures/') ? `${icon}/spriteFrame` : `textures/items/${icon}/spriteFrame`,
    icon.startsWith('textures/') ? icon : `textures/items/${icon}`,
    `textures/items/${icon}/spriteFrame`,
    `textures/items/${icon}`,
    ...['fruit', 'seed', 'fert'].map(prefix => `textures/items/${prefix}_${icon}/spriteFrame`),
    ...(cellFallback ? ['textures/ui/cell/spriteFrame', 'textures/ui/cell'] : []),
  ];
  // 不使用缓存版 applySprite：保留格子加载失败后下次刷新可重试的行为。
  const tryLoad = (index: number) => {
    if (index >= paths.length) return;
    resources.load(paths[index], SpriteFrame, (error, frame) => {
      if (!error && frame && sprite) sprite.spriteFrame = frame;
      else tryLoad(index + 1);
    });
  };
  tryLoad(0);
}

export function setActive(node: Node | null | undefined, active: boolean): void {
  if (node?.isValid && node.active !== active) node.active = active;
}
