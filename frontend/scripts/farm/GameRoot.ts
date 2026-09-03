/**
 * 农场场景装配层：只负责 Cocos 节点绑定、远端快照投影和命令分发。
 * 金币/背包/土地不再由客户端整包覆盖，服务端是唯一权威来源。
 */
import {
  _decorator, Button, Component, director, Game, game as cocosGame, Label, Node, ResolutionPolicy, Sprite, view,
} from 'cc';
import { InventoryModel } from './data/InventoryModel';
import { PlayerModel } from './data/PlayerModel';
import { FarmModel } from './data/FarmModel';
import { BackpackPanel } from './ui/BackpackPanel';
import { ShopPanel } from './ui/ShopPanel';
import { Toast } from './ui/Toast';
import { LandView } from './ui/LandView';
import type { ToolMode } from './ui/LandView';
import { SessionStore } from '../core/auth/SessionStore';
import { applyRemoteCatalog } from '../core/game/RemoteCatalog';
import { ApiError } from '../core/network/HttpClient';
import type { GameCommandType, GameSnapshot } from '../core/network/Contracts';
import { gameSync } from '../core/sync/GameSyncService';
import type { GameActionFeedback } from './GameAction';

const { ccclass, property } = _decorator;
export const DESIGN_W = 1280;
export const DESIGN_H = 720;

@ccclass('GameRoot')
export class GameRoot extends Component {
  @property({ type: Node }) public backpackButton: Node | null = null;
  @property({ type: Node }) public shopButton: Node | null = null;
  @property({ type: Node }) public backpackPanelNode: Node | null = null;
  @property({ type: Node }) public shopPanelNode: Node | null = null;
  @property({ type: Node }) public goldLabelNode: Node | null = null;
  @property({ type: Node }) public toastNode: Node | null = null;

  private player = new PlayerModel(0);
  private inventory = new InventoryModel();
  private farm = new FarmModel();
  private landView: LandView | null = null;
  private goldLabel: Label | null = null;
  private levelLabel: Label | null = null;
  private diamondsLabel: Label | null = null;
  private energyLabel: Label | null = null;
  private toast: Toast | null = null;
  private backpack: BackpackPanel | null = null;
  private shop: ShopPanel | null = null;
  private unsubscribeSnapshot: (() => void) | null = null;
  private ready = false;

  async onLoad() {
    view.setDesignResolutionSize(DESIGN_W, DESIGN_H, ResolutionPolicy.FIXED_HEIGHT);
    if (!SessionStore.get()) {
      director.loadScene('login');
      return;
    }

    this.bindSceneNodes();
    this.unsubscribeSnapshot = gameSync.onSnapshot(snapshot => this.applySnapshot(snapshot));
    cocosGame.on(Game.EVENT_SHOW, this.onAppShow, this);

    // 缓存只用于弱网首屏展示，离线时禁止经济操作，绝不回写覆盖服务端。
    const cached = gameSync.restoreCached();
    if (cached) this.toast?.show('正在同步最新数据…');

    try {
      await gameSync.bootstrap();
      this.ready = true;
      if (gameSync.pendingCount > 0) this.toast?.show(`正在恢复 ${gameSync.pendingCount} 个待同步操作`);
    } catch (error) {
      this.ready = false;
      if (error instanceof ApiError && error.status === 401) {
        director.loadScene('login');
      } else if (cached) {
        this.toast?.show('网络不可用：当前为只读缓存', 2.5);
      } else {
        this.toast?.show(this.errorMessage(error), 2.5);
      }
    }
  }

  onDestroy() {
    this.unsubscribeSnapshot?.();
    cocosGame.off(Game.EVENT_SHOW, this.onAppShow, this);
  }

  private onAppShow = () => {
    if (!SessionStore.get()) { director.loadScene('login'); return; }
    void gameSync.bootstrap().then(() => { this.ready = true; }).catch(error => {
      console.warn('[GameRoot] 回前台同步失败', error);
    });
  };

  private applySnapshot(snapshot: GameSnapshot): void {
    applyRemoteCatalog(snapshot.catalog);
    this.player.loadJSON({
      gold: snapshot.profile.gold,
      userId: snapshot.profile.id,
      username: snapshot.profile.username,
      level: snapshot.profile.level,
      exp: snapshot.profile.exp,
      energy: snapshot.profile.energy,
    });
    this.inventory.loadJSON(snapshot.inventory as any);
    this.farm.loadJSON({ plots: snapshot.plots, lastTick: snapshot.lastTick });
    this.refreshHud();
    this.landView?.render();
    if (this.backpack?.isOpen) this.backpack.render();
    if (this.shop?.isOpen) this.shop.render();
  }

  private async executeAction(
    type: GameCommandType,
    payload: Record<string, unknown>,
  ): Promise<GameActionFeedback> {
    if (!this.ready) return { ok: false, message: '正在连接服务器，请稍候' };
    if (gameSync.pendingCount > 0) {
      void gameSync.resume();
      return { ok: false, message: '有操作等待同步，请恢复网络后再试' };
    }
    try {
      const snapshot = await gameSync.execute(type, payload);
      return { ok: true, message: snapshot.message || '操作成功' };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        director.loadScene('login');
        return { ok: false, message: '登录已失效' };
      }
      if (error instanceof ApiError && error.retryable && gameSync.pendingCount > 0) {
        return { ok: false, message: '网络不稳定，操作已保留，将在恢复后自动确认' };
      }
      return { ok: false, message: this.errorMessage(error) };
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '网络异常，请稍后重试';
  }

  private refreshHud(): void {
    // TopBar 已有 CoinsIcon / DiamondsIcon / EnergyIcon，Label 只显示数值。
    if (this.goldLabel) this.goldLabel.string = String(this.player.gold);
    if (this.levelLabel) this.levelLabel.string = `Lv.${this.player.level}`;
    if (this.diamondsLabel) this.diamondsLabel.string = String(gameSync.snapshot?.profile.diamonds ?? 0);
    if (this.energyLabel) this.energyLabel.string = String(this.player.energy);
  }

  private bindToolButton(leftBar: Node, childName: string, mode: Exclude<ToolMode, 'none'>) {
    const node = leftBar.getChildByName(childName);
    if (!node) return;
    const button = node.getComponent(Button) || node.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.92;
    node.off(Button.EventType.CLICK);
    node.on(Button.EventType.CLICK, () => {
      if (!this.landView) return;
      const next = this.landView.currentTool === mode ? 'none' : mode;
      const icon = node.getComponent(Sprite) || node.getComponentInChildren(Sprite);
      this.landView.setTool(next, next === 'none' ? null : (icon?.spriteFrame || null));
      const prompts: Record<Exclude<ToolMode, 'none'>, string> = {
        water: '请选择要浇水的土地',
        fert: '请选择要施肥的土地',
        harvest: '请选择要采摘的土地',
        shovel: '请选择要铲除作物的土地',
      };
      this.toast?.show(next === 'none' ? '已取消工具' : prompts[mode]);
    });
  }

  private findNode(root: Node | null, name: string): Node | null {
    if (!root) return null;
    if (root.name === name) return root;
    for (const child of root.children) {
      const found = this.findNode(child, name);
      if (found) return found;
    }
    return null;
  }

  private bindSceneNodes() {
    const root = this.node.scene || this.node;
    const goldNode = this.goldLabelNode || this.findNode(root, 'CoinsLabel') || this.findNode(root, 'gold_hud');
    this.goldLabel = goldNode?.getComponent(Label) || goldNode?.getComponentInChildren(Label) || null;
    const levelNode = this.findNode(root, 'LevelLabel');
    this.levelLabel = levelNode?.getComponent(Label) || levelNode?.getComponentInChildren(Label) || null;
    const diamondsNode = this.findNode(root, 'DiamondsLabel');
    this.diamondsLabel = diamondsNode?.getComponent(Label) || diamondsNode?.getComponentInChildren(Label) || null;
    const energyNode = this.findNode(root, 'EnergyLabel');
    this.energyLabel = energyNode?.getComponent(Label) || energyNode?.getComponentInChildren(Label) || null;

    const toastNode = this.toastNode || this.findNode(root, 'Toast');
    if (toastNode) this.toast = toastNode.getComponent(Toast) || toastNode.addComponent(Toast);

    const action = (type: GameCommandType, payload: Record<string, unknown>) => this.executeAction(type, payload);
    const lands = this.findNode(root, 'lands');
    if (lands) {
      this.landView = lands.getComponent(LandView) || lands.addComponent(LandView);
      this.landView.farm = this.farm;
      this.landView.player = this.player;
      this.landView.inventory = this.inventory;
      this.landView.onToast = (message, duration) => this.toast?.show(message, duration);
      this.landView.onAction = action;
      this.landView.now = () => gameSync.serverNow();
      this.landView.configureToolLayers(
        this.findNode(root, 'ToolCursorLayer'),
        this.findNode(root, 'ToolEffectLayer'),
      );
    }

    const leftBar = this.findNode(root, 'LeftBar') || this.findNode(root, 'LefttBar');
    if (leftBar) {
      this.bindToolButton(leftBar, 'Water', 'water');
      this.bindToolButton(leftBar, 'Fertilizer', 'fert');
      this.bindToolButton(leftBar, 'Harvest', 'harvest');
      this.bindToolButton(leftBar, 'Shovel', 'shovel');
    }

    const backpackNode = this.backpackPanelNode || this.findNode(root, 'BackpackPanel');
    if (backpackNode) {
      this.backpack = backpackNode.getComponent(BackpackPanel) || backpackNode.addComponent(BackpackPanel);
      this.backpack.inventory = this.inventory;
      this.backpack.player = this.player;
      this.backpack.onToast = (message, duration) => this.toast?.show(message, duration);
      this.backpack.onAction = action;
    }

    const shopNode = this.shopPanelNode || this.findNode(root, 'ShopPanel');
    if (shopNode) {
      this.shop = shopNode.getComponent(ShopPanel) || shopNode.addComponent(ShopPanel);
      this.shop.inventory = this.inventory;
      this.shop.player = this.player;
      this.shop.onToast = (message, duration) => this.toast?.show(message, duration);
      this.shop.onAction = action;
    }

    this.bindOpenButton(
      this.backpackButton || this.findNode(root, 'BackpackBtn') || this.findNode(root, 'btn_open_btn'),
      () => { if (this.shop?.isOpen) this.shop.close(); this.backpack?.open(); },
    );
    this.bindOpenButton(
      this.shopButton || this.findNode(root, 'ShopBtn') || this.findNode(root, 'btn_shop_btn'),
      () => { if (this.backpack?.isOpen) this.backpack.close(); this.shop?.open(); },
    );
  }

  private bindOpenButton(node: Node | null, handler: () => void): void {
    if (!node) return;
    const button = node.getComponent(Button) || node.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.92;
    node.off(Button.EventType.CLICK);
    node.on(Button.EventType.CLICK, handler);
  }
}
