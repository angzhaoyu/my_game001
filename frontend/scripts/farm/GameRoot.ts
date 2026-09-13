/**
 * 农场场景装配层：只负责把 Cocos 场景里已经搭好的节点与脚本绑定起来，
 * 并把服务端快照投影到这些节点上。金币/背包/土地不在客户端修改，服务端是唯一权威。
 *
 * 所有面板、土块、动画都是 Cocos 里的节点；这里只做「取组件 + 注入依赖 + 绑定事件」。
 */
import {
  _decorator, Button, Component, director, Game, game as cocosGame, Label, Node,
  ResolutionPolicy, Sprite, view,
} from 'cc';
import { InventoryModel } from './data/InventoryModel';
import { PlayerModel } from './data/PlayerModel';
import { FarmModel } from './data/FarmModel';
import { BackpackPanel } from './ui/BackpackPanel';
import { ShopPanel } from './ui/ShopPanel';
import { Toast } from './ui/Toast';
import { LandView } from './ui/LandView';
import type { ToolMode } from './ui/LandView';
import { SoilInfoPanel } from './ui/SoilInfoPanel';
import { WaterPrompt } from './ui/WaterPrompt';
import { FertilizePanel } from './ui/FertilizePanel';
import { ItemPickerPanel } from './ui/ItemPickerPanel';
import { WeatherHud } from './ui/WeatherHud';
import { SessionStore } from '../core/auth/SessionStore';
import { applyRemoteCatalog } from '../core/game/RemoteCatalog';
import { loadResourceTables } from './ui/Assets';
import { findChild } from './ui/NodeUtils';
import { applyWorldSnapshot } from './config/WeatherConfig';
import { ApiError } from '../core/network/HttpClient';
import type { GameCommandType, GameSnapshot } from '../core/network/Contracts';
import { gameSync } from '../core/sync/GameSyncService';
import type { GameActionFeedback } from './GameAction';

const { ccclass, property } = _decorator;
export const DESIGN_W = 1280;
export const DESIGN_H = 720;
/** 轮询间隔：服务端按分钟结算，客户端定期拉取最新快照 */
const POLL_INTERVAL_SECONDS = 15;

@ccclass('GameRoot')
export class GameRoot extends Component {
  // 场景节点（优先拖拽绑定，缺失时按名字查找）
  @property({ type: Node }) public landsNode: Node | null = null;
  @property({ type: Node }) public leftBar: Node | null = null;
  @property({ type: Node }) public backpackButton: Node | null = null;
  @property({ type: Node }) public shopButton: Node | null = null;
  @property({ type: Node }) public backpackPanelNode: Node | null = null;
  @property({ type: Node }) public shopPanelNode: Node | null = null;
  @property({ type: Node }) public goldLabelNode: Node | null = null;
  @property({ type: Node }) public toastNode: Node | null = null;
  @property({ type: Node }) public weatherHudNode: Node | null = null;
  @property({ type: Node }) public soilInfoNode: Node | null = null;
  @property({ type: Node }) public waterPromptNode: Node | null = null;
  @property({ type: Node }) public fertilizePanelNode: Node | null = null;
  @property({ type: Node }) public seedPanelNode: Node | null = null;
  @property({ type: Node }) public medicinePanelNode: Node | null = null;

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
  private weatherHud: WeatherHud | null = null;
  private soilInfo: SoilInfoPanel | null = null;
  private waterPrompt: WaterPrompt | null = null;
  private fertilizePanel: FertilizePanel | null = null;
  private seedPanel: ItemPickerPanel | null = null;
  private medicinePanel: ItemPickerPanel | null = null;
  private unsubscribeSnapshot: (() => void) | null = null;
  private ready = false;

  async onLoad() {
    view.setDesignResolutionSize(DESIGN_W, DESIGN_H, ResolutionPolicy.FIXED_HEIGHT);
    if (!SessionStore.get()) {
      director.loadScene('login');
      return;
    }

    // 静态定义来自 resources/datas/*.csv（服务端 catalog 到达后覆盖）
    await loadResourceTables();
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
    this.schedule(this.poll, POLL_INTERVAL_SECONDS);
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

  /** 定期拉取最新快照（不带目录，流量更小） */
  private poll = () => {
    if (!SessionStore.get()) return;
    void gameSync.refresh().catch(() => { /* 轮询失败静默重试 */ });
  };

  private applySnapshot(snapshot: GameSnapshot): void {
    applyRemoteCatalog(snapshot.catalog);
    applyWorldSnapshot(snapshot.world);
    this.farm.setHumidityModifier(snapshot.world?.humidityModifier ?? 1);
    this.player.loadJSON({
      gold: snapshot.profile.gold,
      userId: snapshot.profile.id,
      username: snapshot.profile.username,
      level: snapshot.profile.level,
      exp: snapshot.profile.exp,
      energy: snapshot.profile.energy,
    });
    this.inventory.loadJSON(snapshot.inventory as any);
    this.farm.loadJSON({ plots: snapshot.plots as any, lastTick: snapshot.lastTick });
    this.refreshHud();
    this.landView?.render();
    this.weatherHud?.refresh();
    if (this.soilInfo?.isOpen) {
      const plot = this.farm.getPlot(this.soilInfo.currentPlotId);
      if (plot) this.soilInfo.render(plot, this.farm);
    }
    this.fertilizePanel?.refresh();
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
    if (this.goldLabel) this.goldLabel.string = String(this.player.gold);
    if (this.levelLabel) this.levelLabel.string = `Lv.${this.player.level}`;
    if (this.diamondsLabel) this.diamondsLabel.string = String(gameSync.snapshot?.profile.diamonds ?? 0);
    if (this.energyLabel) this.energyLabel.string = String(this.player.energy);
  }

  // ---------------- 场景绑定 ----------------

  private bindToolButton(leftBar: Node, childName: string, mode: Exclude<ToolMode, 'none'>) {
    const node = leftBar.getChildByName(childName);
    if (!node) return;
    const button = node.getComponent(Button) || node.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.92;
    node.off(Button.EventType.CLICK);
    node.on(Button.EventType.CLICK, () => {
      if (!this.landView) return;
      // 再点一次同一个工具 → 取消
      const next: ToolMode = this.landView.currentTool === mode ? 'none' : mode;
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

  private bindSceneNodes() {
    const root = this.node.scene || this.node;
    const goldNode = this.goldLabelNode || findChild(root, 'CoinsLabel', 'gold_hud');
    this.goldLabel = labelOf(goldNode);
    this.levelLabel = labelOf(findChild(root, 'LevelLabel'));
    this.diamondsLabel = labelOf(findChild(root, 'DiamondsLabel'));
    this.energyLabel = labelOf(findChild(root, 'EnergyLabel'));

    const toastNode = this.toastNode || findChild(root, 'Toast');
    if (toastNode) this.toast = toastNode.getComponent(Toast) || toastNode.addComponent(Toast);

    const action = (type: GameCommandType, payload: Record<string, unknown>) => this.executeAction(type, payload);

    // ---- 土地 ----
    const lands = this.landsNode || findChild(root, 'lands');
    if (lands) {
      this.landView = lands.getComponent(LandView) || lands.addComponent(LandView);
      this.landView.farm = this.farm;
      this.landView.player = this.player;
      this.landView.inventory = this.inventory;
      this.landView.onToast = (message, duration) => this.toast?.show(message, duration);
      this.landView.onAction = action;
      this.landView.now = () => gameSync.serverNow();
      this.landView.configureToolCursor(findChild(root, 'ToolCursorLayer'));
      // 面板注入（全部是 Cocos 场景节点上的组件）
      this.soilInfo = componentOf(this.soilInfoNode || findChild(root, 'SoilInfoPanel'), SoilInfoPanel);
      this.waterPrompt = componentOf(this.waterPromptNode || findChild(root, 'WaterPrompt'), WaterPrompt);
      this.fertilizePanel = componentOf(
        this.fertilizePanelNode || findChild(root, 'FertilizePanel'), FertilizePanel);
      this.seedPanel = componentOf(this.seedPanelNode || findChild(root, 'SeedPanel'), ItemPickerPanel);
      this.medicinePanel = componentOf(
        this.medicinePanelNode || findChild(root, 'MedicinePanel'), ItemPickerPanel);
      this.landView.soilInfoPanel = this.soilInfo;
      this.landView.waterPrompt = this.waterPrompt;
      this.landView.fertilizePanel = this.fertilizePanel;
      this.landView.seedPicker = this.seedPanel;
      this.landView.medicinePicker = this.medicinePanel;
      this.landView.openShop = () => this.openShop();
    }

    const weatherNode = this.weatherHudNode || findChild(root, 'WeatherHud');
    this.weatherHud = componentOf(weatherNode, WeatherHud);

    // ---- 左栏工具 ----
    const leftBar = this.leftBar || findChild(root, 'LeftBar', 'LefttBar');
    if (leftBar) {
      this.bindToolButton(leftBar, 'Water', 'water');
      this.bindToolButton(leftBar, 'Fertilizer', 'fert');
      this.bindToolButton(leftBar, 'Harvest', 'harvest');
      this.bindToolButton(leftBar, 'Shovel', 'shovel');
    }

    // ---- 背包 / 商店 ----
    const backpackNode = this.backpackPanelNode || findChild(root, 'BackpackPanel');
    if (backpackNode) {
      this.backpack = backpackNode.getComponent(BackpackPanel) || backpackNode.addComponent(BackpackPanel);
      this.backpack.inventory = this.inventory;
      this.backpack.player = this.player;
      this.backpack.onToast = (message, duration) => this.toast?.show(message, duration);
      this.backpack.onAction = action;
    }

    const shopNode = this.shopPanelNode || findChild(root, 'ShopPanel');
    if (shopNode) {
      this.shop = shopNode.getComponent(ShopPanel) || shopNode.addComponent(ShopPanel);
      this.shop.inventory = this.inventory;
      this.shop.player = this.player;
      this.shop.onToast = (message, duration) => this.toast?.show(message, duration);
      this.shop.onAction = action;
      // 施肥框跳转商店后，关闭商店自动回到施肥框
      this.shop.onClose = () => { this.fertilizePanel?.restoreIfHidden(); };
    }

    this.bindOpenButton(
      this.backpackButton || findChild(root, 'BackpackBtn', 'btn_open_btn'),
      () => { if (this.shop?.isOpen) this.shop.close(); this.backpack?.open(); },
    );
    this.bindOpenButton(
      this.shopButton || findChild(root, 'ShopBtn', 'btn_shop_btn'),
      () => this.openShop(),
    );
  }

  private openShop(): void {
    if (this.backpack?.isOpen) this.backpack.close();
    this.shop?.open();
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

function labelOf(node: Node | null): Label | null {
  return node ? (node.getComponent(Label) || node.getComponentInChildren(Label)) : null;
}

function componentOf<T extends Component>(node: Node | null, type: new () => T): T | null {
  if (!node) return null;
  return node.getComponent(type) || node.addComponent(type);
}
