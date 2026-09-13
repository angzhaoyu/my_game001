/**
 * ui/Assets.ts —— 资源装载小工具（贴图 + CSV 配置表）
 *
 * 场景节点与贴图都在 Cocos 里摆好；代码只负责「换图 / 读表」，不负责创建节点。
 * 贴图加载做了缓存与路径兜底，避免每次刷新都重复 load。
 */
import { Sprite, SpriteFrame, TextAsset, resources } from 'cc';
import { applyCsvText } from '../config/Tables';

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

/**
 * 物品图标的候选路径：兼容 `textures/items/<icon>` 与表里直接写完整路径两种写法。
 * 背包 / 商店 / 选择框共用，避免每个面板各写一长串兜底路径。
 */
export function itemPaths(icon: string): string[] {
  if (!icon) return [];
  if (icon.startsWith('textures/')) return [`${icon}/spriteFrame`, icon];
  return [
    `textures/items/${icon}/spriteFrame`,
    `textures/items/${icon}`,
    `textures/items/fruit_${icon}/spriteFrame`,
    `textures/items/seed_${icon}/spriteFrame`,
    `textures/items/fert_${icon}/spriteFrame`,
    `textures/items/med_${icon}/spriteFrame`,
    `textures/ui/cell/spriteFrame`,
  ];
}

/** 作物阶段图（`{cropId}-01/02/03`）：优先 farm/crop，其次 textures/items */
export function cropPaths(icon: string, pattern = 'farm/crop/{icon}/spriteFrame'): string[] {
  if (!icon) return [];
  return [fillPath(pattern, { icon }), `textures/items/${icon}/spriteFrame`];
}

/** 把路径模板里的 {col} / {state} 等占位符替换掉。 */
export function fillPath(pattern: string, values: Record<string, string | number>): string {
  return pattern.replace(/\{(\w+)\}/g, (_, key: string) =>
    values[key] === undefined ? `{${key}}` : String(values[key]));
}

// ---------------------------------------------------------------- 配置表

let tablesLoaded: Promise<void> | null = null;

/**
 * 读取 `resources/datas/` 下的全部 CSV（文件名即表名，例如 `Crop_Data.csv` → 表 `Crop_Data`）。
 * 读不到只打日志：服务端 catalog 到达后仍会覆盖同一批表，UI 不会崩。
 */
export function loadResourceTables(dir = 'datas'): Promise<void> {
  if (tablesLoaded) return tablesLoaded;
  tablesLoaded = new Promise<void>(resolve => {
    resources.loadDir(dir, TextAsset, (error, assets) => {
      if (error || !Array.isArray(assets)) {
        console.warn(`[Assets] 读取 resources/${dir} 失败，只使用服务端下发目录：`, error);
        resolve();
        return;
      }
      assets.forEach(asset => {
        const name = String(asset?.name ?? '').replace(/\.(csv|txt)$/i, '');
        if (!applyCsvText(name, asset.text)) console.warn(`[Assets] 代码里没有声明表 ${name}，已忽略`);
      });
      resolve();
    });
  });
  return tablesLoaded;
}
