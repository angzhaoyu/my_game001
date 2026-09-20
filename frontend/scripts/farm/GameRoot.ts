/**
 * 农场场景装配层：把 Cocos 场景里已经搭好的节点与脚本绑定起来，
 * 并把服务端快照投影到这些节点上。
 */
import {
  _decorator, Button, Component, director, Game, game as cocosGame, Label, Node,
  ResolutionPolicy, Sprite, tween, Vec3, view,
} from 'cc';
import { InventoryModel } from './data/InventoryModel';
import { PlayerModel } from './data/PlayerModel';
import { FarmModel } from './data/FarmModel';
import { BackpackPanel } from './ui/BackpackPanel';
import { ShopPanel } from './ui/ShopPanel';
import { BuyPanel } from './ui/BuyPanel';
import { SellPanel } from './ui/SellPanel';
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
import { applyWorldSnapshot } from './config/WeatherConfig';
import { ApiError } from '../core/network/HttpClient';
import type { GameCommandType, GameSnapshot } from '../core/network/Contracts';
import { gameSync } from '../core/sync/GameSyncService';
import type { GameActionFeedback } from './GameAction';
import type { ShopDef, InventoryStack } from './data/ItemData';

const { ccclass, property } = _decorator;
export const DESIGN_W = 1280;
export const DESIGN_H = 720;
const POLL_INTERVAL_SECONDS = 15;

@ccclass('GameRoot')
export class GameRoot extends Component {
  @property({ type: Node }) public landsNode: Node | null = null;
  @property({ type: Node }) public leftBar: Node | null = null;
  @property({ type: Node }) public backpackButton: Node | null = null;
  @property({ type: Node }) public shopButton: Node | null = null;
  @property({ type: Node }) public backpackPanelNode: Node | null = null;
  @property({ type: Node }) public shopPanelNode: Node | null = null;
  @property({ type: Node }) public buyPanelNode: Node | null = null;
  @property({ type: Node }) public sellPanelNode: Node | null = null;
  @property({ type: Node }) public goldLabelNode: Node | null = null;
  @property({ type: Node }) public toastNode: Node | null = null;
  @property({ type: Node }) public weatherHudNode: Node | null = null;
  @property({ type: Node }) public soilInfoNode: Node | null = null;
  @property({ type: Node }) public waterPromptNode: Node | null = null;
  @property({ type: Node }) public fertilizePanelNode: Node | null = null;
  @property({ type: Node }) public seedPanelNode: Node | null = null;
  @property({ type: Node }) public pesticidePanelNode: Node | null = null;

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
  private buyPanel: BuyPanel | null = null;
  private sellPanel: SellPanel | null = null;
  private weatherHud: WeatherHud | null = null;
  private soilInfo: SoilInfoPanel | null = null;
  private waterPrompt: WaterPrompt | null = null;
  private fertilizePanel: FertilizePanel | null = null;
  private seedPanel: ItemPickerPanel | null = null;
  private pesticidePanel: ItemPickerPanel | null = null;
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

  private poll = () => {
    if (!SessionStore.get()) return;
    void gameSync.refresh().catch(() => {});
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

      // 浇水按钮特殊处理：直接弹出 WaterPrompt
      if (mode === 'water') {
        this.landView.setTool('none');
        this.openWaterPromptFromLeftBar();
        return;
      }

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

  /** LeftBar 浇水按钮直接弹出 WaterPrompt */
  private openWaterPromptFromLeftBar(): void {
    if (!this.waterPrompt) { this.toast?.show('场景缺少 WaterPrompt 面板'); return; }
    this.waterPrompt.onConfirm = (times) => {
      if (this.landView) {
        this.landView.setWaterTimes(times);
        this.toast?.show('请选择要浇水的土地');
      }
    };
    this.waterPrompt.open();
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
    this.goldLabel = labelOf(goldNode);
    this.levelLabel = labelOf(this.findNode(root, 'LevelLabel'));
    this.diamondsLabel = labelOf(this.findNode(root, 'DiamondsLabel'));
    this.energyLabel = labelOf(this.findNode(root, 'EnergyLabel'));

    const toastNode = this.toastNode || this.findNode(root, 'Toast');
    if (toastNode) this.toast = toastNode.getComponent(Toast) || toastNode.addComponent(Toast);

    const action = (type: GameCommandType, payload: Record<string, unknown>) => this.executeAction(type, payload);

    // ---- 土地 ----
    const lands = this.landsNode || this.findNode(root, 'lands');
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

      this.soilInfo = componentOf(this.soilInfoNode || this.findNode(root, 'SoilInfoPanel'), SoilInfoPanel);
      this.waterPrompt = componentOf(this.waterPromptNode || this.findNode(root, 'WaterPrompt'), WaterPrompt);
      this.fertilizePanel = componentOf(
        this.fertilizePanelNode || this.findNode(root, 'FertilizePanel'), FertilizePanel);
      this.seedPanel = componentOf(this.seedPanelNode || this.findNode(root, 'SeedPanel'), ItemPickerPanel);
      // MedicinePanel → PesticidePanel（兼容两种名称）
      this.pesticidePanel = componentOf(
        this.pesticidePanelNode || this.findNode(root, 'PesticidePanel') || this.findNode(root, 'MedicinePanel'),
        ItemPickerPanel);

      this.landView.soilInfoPanel = this.soilInfo;
      this.landView.waterPrompt = this.waterPrompt;
      this.landView.fertilizePanel = this.fertilizePanel;
      this.landView.seedPicker = this.seedPanel;
      this.landView.medicinePicker = this.pesticidePanel;
      this.landView.openShop = () => this.openShop();
      this.landView.isShopOpen = () => !!this.shop?.isOpen;
    }

    const weatherNode = this.weatherHudNode || this.findNode(root, 'WeatherHud');
    this.weatherHud = componentOf(weatherNode, WeatherHud);

    // ---- LeftBar（简化结构） ----
    const leftBar = this.leftBar || this.findNode(root, 'LeftBar') || this.findNode(root, 'LefttBar');
    if (leftBar) {
      // 展开/折叠按钮
      const expandBtn = leftBar.getChildByName('expand') || leftBar.getChildByName('collapse');
      if (expandBtn) {
        this.bindLeftBarToggle(leftBar, expandBtn);
      }

      // 背包按钮
      const backpackBtn = leftBar.getChildByName('BackpackBtn') || this.findNode(leftBar, 'BackpackBtn');
      if (backpackBtn) {
        this.bindOpenButton(backpackBtn, () => {
          if (this.shop?.isOpen) this.shop.close();
          this.backpack?.open();
        });
      }

      // 商店按钮
      const shopBtn = leftBar.getChildByName('ShopBtn') || this.findNode(leftBar, 'ShopBtn');
      if (shopBtn) {
        this.bindOpenButton(shopBtn, () => this.openShop());
      }

      // 工具按钮（与 BackpackBtn 相同结构）
      this.bindToolButton(leftBar, 'ShovelBtn', 'shovel');
      this.bindToolButton(leftBar, 'HarvestBtn', 'harvest');
      this.bindToolButton(leftBar, 'WaterBtn', 'water');
      this.bindToolButton(leftBar, 'FertilizerBtn', 'fert');
      this.bindToolButton(leftBar, 'PesticideBtn', 'fert'); // 暂时复用

      // 兼容旧名称
      this.bindToolButton(leftBar, 'Water', 'water');
      this.bindToolButton(leftBar, 'Fertilizer', 'fert');
      this.bindToolButton(leftBar, 'Harvest', 'harvest');
      this.bindToolButton(leftBar, 'Shovel', 'shovel');
    }

    // ---- 背包 / 商店 ----
    const backpackNode = this.backpackPanelNode || this.findNode(root, 'BackpackPanel');
    if (backpackNode) {
      this.backpack = backpackNode.getComponent(BackpackPanel) || backpackNode.addComponent(BackpackPanel);
      this.backpack.inventory = this.inventory;
      this.backpack.player = this.player;
      this.backpack.onToast = (message, duration) => this.toast?.show(message, duration);
      this.backpack.onAction = action;
      this.backpack.onOpenSell = (stack) => this.openSellPanel(stack);
    }

    const shopNode = this.shopPanelNode || this.findNode(root, 'ShopPanel');
    if (shopNode) {
      this.shop = shopNode.getComponent(ShopPanel) || shopNode.addComponent(ShopPanel);
      this.shop.inventory = this.inventory;
      this.shop.player = this.player;
      this.shop.onToast = (message, duration) => this.toast?.show(message, duration);
      this.shop.onAction = action;
      this.shop.onOpenBuy = (def) => this.openBuyPanel(def);
      this.shop.onClose = () => { this.fertilizePanel?.restoreIfHidden(); };
    }

    // ---- BuyPanel ----
    const buyNode = this.buyPanelNode || this.findNode(root, 'Buy');
    if (buyNode) {
      this.buyPanel = buyNode.getComponent(BuyPanel) || buyNode.addComponent(BuyPanel);
      this.buyPanel.onToast = (message, duration) => this.toast?.show(message, duration);
      this.buyPanel.onAction = action;
      this.buyPanel.getPlayerGold = () => this.player.gold;
      this.buyPanel.onRefresh = () => {
        this.shop?.render();
        this.backpack?.render();
        this.refreshHud();
      };
    }

    // ---- SellPanel ----
    const sellNode = this.sellPanelNode || this.findNode(root, 'Sell');
    if (sellNode) {
      this.sellPanel = sellNode.getComponent(SellPanel) || sellNode.addComponent(SellPanel);
      this.sellPanel.onToast = (message, duration) => this.toast?.show(message, duration);
      this.sellPanel.onAction = action;
      this.sellPanel.onRefresh = () => {
        this.backpack?.render();
        this.refreshHud();
      };
    }

    // 如果没找到背包/商店按钮，用旧的查找方式
    this.bindOpenButton(
      this.backpackButton || this.findNode(root, 'BackpackBtn') || this.findNode(root, 'btn_open_btn'),
      () => { if (this.shop?.isOpen) this.shop.close(); this.backpack?.open(); },
    );
    this.bindOpenButton(
      this.shopButton || this.findNode(root, 'ShopBtn') || this.findNode(root, 'btn_shop_btn'),
      () => this.openShop(),
    );
  }

  /** LeftBar 展开/折叠动画 */
  private bindLeftBarToggle(leftBar: Node, toggleBtn: Node): void {
    let expanded = true;
    const button = toggleBtn.getComponent(Button) || toggleBtn.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.92;
    toggleBtn.off(Button.EventType.CLICK);
    toggleBtn.on(Button.EventType.CLICK, () => {
      expanded = !expanded;
      // 简单的展开/折叠动画：移动工具按钮的 x 位置
      const toolNames = ['BackpackBtn', 'ShopBtn', 'ShovelBtn', 'HarvestBtn', 'WaterBtn', 'FertilizerBtn', 'PesticideBtn',
        'Water', 'Fertilizer', 'Harvest', 'Shovel'];
      for (const name of toolNames) {
        const btn = leftBar.getChildByName(name);
        if (btn) {
          const targetX = expanded ? btn.position.x : -200;
          tween(btn).to(0.2, { position: new Vec3(expanded ? 0 : -200, btn.position.y, btn.position.z) }).start();
        }
      }
    });
  }

  private openShop(): void {
    if (this.backpack?.isOpen) this.backpack.close();
    this.shop?.open();
  }

  private openBuyPanel(def: ShopDef): void {
    if (this.buyPanel) {
      this.buyPanel.open(def);
    } else {
      // 兜底：直接购买
      void this.executeAction('buy_item', { itemId: def.id, quantity: 1 }).then(result => {
        this.toast?.show(result.message);
        this.shop?.render();
      });
    }
  }

  private openSellPanel(stack: InventoryStack): void {
    if (this.sellPanel) {
      this.sellPanel.open(stack);
    } else {
      // 兜底：直接出售
      void this.executeAction('sell_item', { itemId: stack.id, quantity: 1 }).then(result => {
        this.toast?.show(result.message);
        this.backpack?.render();
      });
    }
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
