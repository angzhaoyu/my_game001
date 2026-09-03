/**
 * ui/Assets.ts —— 贴图加载小工具
 *
 * 场景节点与贴图都在 Cocos 里摆好；代码只负责「换图」，不负责创建节点。
 * 这里做了一层缓存和路径兜底，避免每次刷新都重复 load。
 */
import { Sprite, SpriteFrame, resources } from 'cc';

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
  const tryIndex = (index: number) => {
    if (index >= paths.length) return;
    loadSpriteFrame(paths[index], frame => {
      if (!sprite.isValid) return;
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
