/** 服务端背包快照的查询投影；不提供客户端增删资产方法。 */
import type { ItemCategory, InventoryStack } from './ItemData';

export type SortKey = 'time' | 'name';
export type SortDir = 'asc' | 'desc';

export interface QueryOptions {
  category?: ItemCategory | 'all';
  sort?: SortKey;
  dir?: SortDir;
}

export class InventoryModel {
  private stacks: InventoryStack[] = [];

  getAll(): InventoryStack[] {
    return this.stacks.map(stack => ({ ...stack }));
  }

  get length(): number {
    return this.stacks.length;
  }

  findByItemId(itemId: string): InventoryStack | undefined {
    const stack = this.stacks.find(item => item.id === itemId);
    return stack ? { ...stack } : undefined;
  }

  query(options: QueryOptions = {}): InventoryStack[] {
    const { category = 'all', sort = 'time', dir = 'desc' } = options;
    let list = this.getAll();
    if (category !== 'all') list = list.filter(stack => stack.category === category);
    list.sort((left, right) => {
      const result = sort === 'time'
        ? left.acquired - right.acquired
        : left.name.localeCompare(right.name, 'zh-Hans-CN');
      return dir === 'desc' ? -result : result;
    });
    return list;
  }

  loadJSON(data: InventoryStack[]): void {
    this.stacks = Array.isArray(data)
      ? data.filter(stack => stack && Number(stack.count) > 0).map(stack => ({ ...stack }))
      : [];
  }
}
