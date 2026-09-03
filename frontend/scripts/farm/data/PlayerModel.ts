/**
 * 服务端玩家快照的只读投影。业务 UI 只能通过 GameAction 发命令，不能在这里扣/加资产。
 */
import { expForNextLevel } from '../config/LandConfig';

export class PlayerModel {
  gold: number;
  userId: string | null = null;
  username: string | null = null;
  level = 1;
  exp = 0;
  energy = 100;

  constructor(initialGold = 0) {
    this.gold = initialGold;
  }

  get expToNext(): number {
    return Math.max(1, expForNextLevel(this.level));
  }

  loadJSON(value: any): void {
    if (!value || typeof value !== 'object') return;
    if (typeof value.gold === 'number') this.gold = value.gold;
    if (typeof value.level === 'number') this.level = value.level;
    if (typeof value.exp === 'number') this.exp = value.exp;
    if (typeof value.energy === 'number') this.energy = value.energy;
    if (typeof value.userId === 'string' || typeof value.userId === 'number') this.userId = String(value.userId);
    if (typeof value.username === 'string') this.username = value.username;
  }
}
