// ============================================================
// 星域传说 · 登录界面（Cocos Creator 3.8 / TypeScript）
// 功能：账号密码登录 + 大区选择 + 注册
// ============================================================

import { _decorator, Button, Color, Component, director, EditBox, Graphics, Label, Layers, Node, ResolutionPolicy, sys, UITransform, view } from 'cc';
import { authApi } from '../core/auth/AuthApi';
import { SessionStore } from '../core/auth/SessionStore';
import { ApiError } from '../core/network/HttpClient';

const { ccclass } = _decorator;

export const DESIGN_W = 1280;
export const DESIGN_H = 720;

const CLR = {
    bg:       new Color(6, 9, 24, 255),
    panel:    new Color(14, 20, 50, 235),
    border:   new Color(74, 96, 170, 255),
    gold:     new Color(255, 215, 106, 255),
    goldBtn:  new Color(255, 226, 140, 255),
    goldDark: new Color(178, 116, 24, 255),
    input:    new Color(10, 15, 41, 255),
    white:    new Color(235, 240, 255, 255),
    muted:    new Color(140, 158, 196, 255),
    red:      new Color(255, 96, 110, 255),
    cyan:     new Color(62, 226, 255, 255),
    textDark: new Color(58, 36, 5, 255),
};

function ui(name: string, parent: Node, x: number, y: number, w: number, h: number): Node {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    const ut = n.addComponent(UITransform);
    ut.setContentSize(w, h);
    parent.addChild(n);
    n.setPosition(x, y);
    return n;
}

function label(parent: Node, text: string, size: number, color: Color,
               x: number, y: number, w: number, h: number, left = false): Label {
    const n = ui('label_' + text.replace(/\s/g, '').slice(0, 8), parent, x, y, w, h);
    const lb = n.addComponent(Label);
    lb.string = text;
    lb.fontSize = size;
    lb.lineHeight = Math.round(size * 1.25);
    lb.color = color;
    lb.horizontalAlign = left ? Label.HorizontalAlign.LEFT : Label.HorizontalAlign.CENTER;
    lb.verticalAlign = Label.VerticalAlign.CENTER;
    return lb;
}

function box(parent: Node, x: number, y: number, w: number, h: number,
             fill: Color, radius = 12, stroke?: Color): Node {
    const n = ui('box', parent, x, y, w, h);
    const g = n.addComponent(Graphics);
    g.fillColor = fill;
    g.roundRect(-w / 2, -h / 2, w, h, Math.min(radius, w / 2, h / 2));
    g.fill();
    if (stroke) {
        g.lineWidth = 2;
        g.strokeColor = stroke;
        g.stroke();
    }
    return n;
}

function button(parent: Node, x: number, y: number, w: number, h: number,
                text: string, cb: () => void, gold = false, fontSize = 22): Node {
    const n = box(parent, x, y, w, h, gold ? CLR.goldBtn : CLR.panel, 12, gold ? CLR.goldDark : CLR.border);
    label(n, text, fontSize, gold ? CLR.textDark : CLR.white, 0, 0, w, h);
    const b = n.addComponent(Button);
    b.transition = Button.Transition.SCALE;
    b.zoomScale = 0.96;
    n.on(Button.EventType.CLICK, cb);
    return n;
}

function edit(parent: Node, x: number, y: number, w: number, h: number,
              placeholder: string, isPwd = false): EditBox {
    const n = ui('edit_container', parent, x, y, w, h);
    // 把背景绘制放在子节点上，避免 EditBox 自动添加 Sprite 时与父节点的 Graphics 组件冲突
    box(n, 0, 0, w, h, CLR.input, 10, CLR.border);

    const e = n.addComponent(EditBox);
    e.placeholder = placeholder;
    e.maxLength = isPwd ? 20 : 16;
    e.inputMode = EditBox.InputMode.SINGLE_LINE;
    e.returnType = EditBox.KeyboardReturnType.DONE;
    if (isPwd) e.inputFlag = EditBox.InputFlag.PASSWORD;

    const tn = ui('TEXT_LABEL', n, 0, 0, w - 30, h);
    const t = tn.addComponent(Label);
    t.fontSize = 24; t.lineHeight = 30; t.color = CLR.white;
    t.horizontalAlign = Label.HorizontalAlign.LEFT;
    t.verticalAlign = Label.VerticalAlign.CENTER;
    e.textLabel = t;

    const pn = ui('PLACEHOLDER_LABEL', n, 0, 0, w - 30, h);
    const p = pn.addComponent(Label);
    p.fontSize = 24; p.lineHeight = 30; p.color = CLR.muted;
    p.horizontalAlign = Label.HorizontalAlign.LEFT;
    p.verticalAlign = Label.VerticalAlign.CENTER;
    e.placeholderLabel = p;
    return e;
}

@ccclass('LoginMain')
export class LoginMain extends Component {
    private static readonly FARM_SCENE = 'farm';

    private regions: string[] = ['大区一 · 电信', '大区二 · 网通', '大区三 · 移动'];
    private region = '大区一 · 电信';

    private visW = DESIGN_W;
    private visH = DESIGN_H;
    private lastW = -1;
    private lastH = -1;

    private pageLogin!: Node;
    private pageReg!: Node;
    private popup!: Node;
    private regionList!: Node;
    private toastBox!: Node;

    private bgG!: Graphics;
    private starLayer!: Node;
    private titleLb!: Label;
    private subLb!: Label;
    private versionLb!: Label;
    private testInfoLb!: Label;
    private portraitMask!: Node;

    private accEdit!: EditBox;
    private pwdEdit!: EditBox;
    private regionLabel!: Label;
    private loginError!: Label;

    private regAccEdit!: EditBox;
    private regPwdEdit!: EditBox;
    private regPwd2Edit!: EditBox;
    private regRegionLabel!: Label;
    private regError!: Label;

    private rememberLabel!: Label;
    private rememberOn = true;
    private authenticating = false;

    private toast!: Label;

    onLoad() {
        if (SessionStore.get()) {
            director.loadScene(LoginMain.FARM_SCENE);
            return;
        }
        view.setDesignResolutionSize(DESIGN_W, DESIGN_H, ResolutionPolicy.FIXED_HEIGHT);

        this.buildBackground();
        this.pageLogin = this.buildLoginPage();
        this.pageReg = this.buildRegPage();
        this.popup = this.buildRegionPopup();
        this.buildPortraitMask();
        this.buildToast();

        this.showPage(this.pageLogin);
        this.loadRemember();

        void authApi.regions().then((regions) => {
            if (regions.length > 0) {
                this.regions = regions;
                if (!regions.includes(this.region)) this.region = regions[0];
                this.refreshRegionLabel();
            }
        }).catch((error) => console.warn('[Login] 获取大区失败', error));

        // 微信小游戏内优先使用 wx.login；账号密码仅保留给本地联调环境。
        const wx = (globalThis as any).wx;
        if (wx && typeof wx.login === 'function') void this.loginWithWechat();
    }

    update() {
        const vs = view.getVisibleSize();
        if (vs.width !== this.lastW || vs.height !== this.lastH) {
            this.lastW = vs.width;
            this.lastH = vs.height;
            this.applyLayout(vs.width, vs.height);
        }
    }

    private applyLayout(w: number, h: number) {
        this.visW = w;
        this.visH = h;

        if (this.bgG) {
            this.bgG.clear();
            this.bgG.fillColor = CLR.bg;
            this.bgG.rect(-w / 2 - 60, -h / 2 - 60, w + 120, h + 120);
            this.bgG.fill();
        }

        this.redrawStars(w, h);

        if (this.titleLb) this.titleLb.node.setPosition(0, h / 2 - 118);
        if (this.subLb) this.subLb.node.setPosition(0, h / 2 - 182);
        if (this.versionLb) this.versionLb.node.setPosition(w / 2 - 130, -h / 2 + 46);
        if (this.testInfoLb) this.testInfoLb.node.setPosition(-w / 2 + 165, -h / 2 + 46);

        if (this.portraitMask) {
            this.portraitMask.active = h > w;
            const ut = this.portraitMask.getComponent(UITransform);
            if (ut) ut.setContentSize(w, h);
        }
    }

    private buildBackground() {
        const root = this.node;
        const bg = ui('bg', root, 0, 0, DESIGN_W, DESIGN_H);
        this.bgG = bg.addComponent(Graphics);
        this.starLayer = ui('stars', root, 0, 0, 10, 10);
    }

    private redrawStars(w: number, h: number) {
        if (!this.starLayer) return;
        this.starLayer.destroyAllChildren();
        const count = 130;
        for (let i = 0; i < count; i++) {
            const s = ui('star', this.starLayer,
                Math.random() * (w + 200) - (w + 200) / 2,
                Math.random() * (h + 200) - (h + 200) / 2,
                4, 4);
            const sg = s.addComponent(Graphics);
            sg.fillColor = new Color(255, 255, 255, 40 + Math.floor(Math.random() * 160));
            sg.circle(0, 0, 0.8 + Math.random() * 1.8);
            sg.fill();
        }
    }

    private buildHeadTexts() {
        this.titleLb = label(this.node, '随心农场', 68, CLR.gold, 0, 0, 700, 90);
        this.subLb = label(this.node, 'STAR REALM LEGENDS · 横屏登录', 18, CLR.muted, 0, 0, 700, 30);
        this.versionLb = label(this.node, 'v1.0.0 · Cocos 版', 14, CLR.muted, 0, 0, 220, 30);
        this.testInfoLb = label(this.node, '对接 Flask + MySQL 后端', 14, CLR.muted, 0, 0, 320, 30, true);
    }

    private buildPortraitMask() {
        this.portraitMask = ui('portrait_mask', this.node, 0, 0, DESIGN_W, DESIGN_H);
        const g = this.portraitMask.addComponent(Graphics);
        g.fillColor = new Color(4, 6, 15, 255);
        g.rect(-DESIGN_W / 2 - 60, -DESIGN_H / 2 - 60, DESIGN_W + 120, DESIGN_H + 120);
        g.fill();
        label(this.portraitMask, '请旋转设备 · 横屏游玩', 40, CLR.gold, 0, 30, 700, 60);
        label(this.portraitMask, 'PLEASE ROTATE YOUR DEVICE', 16, CLR.muted, 0, -30, 700, 30);
        this.portraitMask.active = false;
    }

    private buildLoginPage(): Node {
        this.buildHeadTexts();

        const page = ui('page_login', this.node, 0, 0, DESIGN_W, DESIGN_H);
        const panel = box(page, 0, -60, 500, 470, CLR.panel, 16, CLR.border);
        label(panel, '账 号 登 录', 26, CLR.gold, 0, 196, 400, 40);

        this.accEdit = edit(panel, 0, 108, 440, 58, '请输入游戏账号');
        this.pwdEdit = edit(panel, 0, 32, 440, 58, '请输入密码', true);

        const regionBtn = box(panel, 0, -44, 440, 58, CLR.input, 10, CLR.border);
        this.regionLabel = label(regionBtn, '大区：' + this.region, 22, CLR.white, 0, 0, 440, 58);
        const rb = regionBtn.addComponent(Button);
        rb.transition = Button.Transition.SCALE;
        rb.zoomScale = 0.96;
        regionBtn.on(Button.EventType.CLICK, () => this.openPopup());

        this.loginError = label(panel, '', 18, CLR.red, 0, -96, 440, 30);
        this.loginError.node.active = false;

        const wx = (globalThis as any).wx;
        button(
            panel, 0, -152, 440, 62,
            wx && typeof wx.login === 'function' ? '微 信 登 录' : '登  录',
            () => { void (wx && typeof wx.login === 'function' ? this.loginWithWechat() : this.onLogin()); },
            true, 26,
        );

        this.rememberLabel = label(panel, '☑ 记住账号', 16, CLR.muted, -120, -218, 170, 30);
        this.rememberLabel.node.addComponent(Button).transition = Button.Transition.NONE;
        this.rememberLabel.node.on(Button.EventType.CLICK, () => this.toggleRemember());

        const regLink = label(panel, '注册新账号 →', 16, CLR.cyan, 130, -218, 160, 30);
        regLink.node.addComponent(Button).transition = Button.Transition.NONE;
        regLink.node.on(Button.EventType.CLICK, () => this.showPage(this.pageReg));
        return page;
    }

    private buildRegPage(): Node {
        const page = ui('page_reg', this.node, 0, 0, DESIGN_W, DESIGN_H);
        const panel = box(page, 0, 0, 500, 520, CLR.panel, 16, CLR.border);
        label(panel, '注 册 新 账 号', 26, CLR.gold, 0, 220, 400, 40);

        this.regAccEdit = edit(panel, 0, 136, 440, 56, '账号（3-16位，字母/数字/下划线/中文）');
        this.regPwdEdit = edit(panel, 0, 62, 440, 56, '密码（8-20位）', true);
        this.regPwd2Edit = edit(panel, 0, -12, 440, 56, '确认密码', true);

        const regionBtn = box(panel, 0, -86, 440, 56, CLR.input, 10, CLR.border);
        this.regRegionLabel = label(regionBtn, '大区：' + this.region, 22, CLR.white, 0, 0, 440, 56);
        const rb = regionBtn.addComponent(Button);
        rb.transition = Button.Transition.SCALE;
        rb.zoomScale = 0.96;
        regionBtn.on(Button.EventType.CLICK, () => this.openPopup());

        this.regError = label(panel, '', 18, CLR.red, 0, -140, 440, 28);
        this.regError.node.active = false;

        button(panel, 0, -200, 440, 60, '注  册', () => this.onRegister(), true, 26);

        const back = label(panel, '← 返回登录', 16, CLR.cyan, 0, -258, 200, 28);
        back.node.addComponent(Button).transition = Button.Transition.NONE;
        back.node.on(Button.EventType.CLICK, () => this.showPage(this.pageLogin));
        return page;
    }

    private buildRegionPopup(): Node {
        const overlay = ui('popup', this.node, 0, 0, DESIGN_W, DESIGN_H);
        const g = overlay.addComponent(Graphics);
        g.fillColor = new Color(0, 0, 0, 170);
        g.rect(-DESIGN_W / 2, -DESIGN_H / 2, DESIGN_W, DESIGN_H);
        g.fill();
        overlay.on(Node.EventType.TOUCH_END, () => this.closePopup());

        const boxN = box(overlay, 0, 0, 420, 360, CLR.panel, 16, CLR.border);
        label(boxN, '选 择 大 区', 26, CLR.gold, 0, 140, 320, 40);
        this.regionList = ui('region_list', boxN, 0, -10, 420, 300);
        overlay.active = false;
        return overlay;
    }

    private openPopup() {
        this.regionList.destroyAllChildren();
        this.regions.forEach((r, i) => {
            button(this.regionList, 0, 50 - i * 76, 360, 60, r,
                () => { this.region = r; this.refreshRegionLabel(); this.closePopup(); }, false, 22);
        });
        this.popup.active = true;
    }

    private closePopup() { this.popup.active = false; }

    private refreshRegionLabel() {
        if (this.regionLabel) this.regionLabel.string = '大区：' + this.region;
        if (this.regRegionLabel) this.regRegionLabel.string = '大区：' + this.region;
    }

    private buildToast() {
        const tb = box(this.node, 0, 300, 460, 52, CLR.goldBtn, 26);
        this.toast = label(tb, '', 22, CLR.textDark, 0, 0, 460, 52);
        tb.active = false;
        this.toastBox = tb;
    }

    private showToast(msg: string) {
        this.toast.string = msg;
        this.toastBox.active = true;
        this.unschedule(this.hideToast);
        this.scheduleOnce(this.hideToast, 2.2);
    }

    private hideToast = () => { this.toastBox.active = false; };

    private showPage(p: Node) {
        [this.pageLogin, this.pageReg].forEach(x => { if (x) x.active = x === p; });
    }

    private showError(lb: Label, msg: string) {
        lb.string = '⚠ ' + msg;
        lb.node.active = true;
    }

    private async loginWithWechat() {
        if (this.authenticating) return;
        this.authenticating = true;
        this.showToast('正在使用微信登录…');
        try {
            await authApi.loginWithWechat();
            director.loadScene(LoginMain.FARM_SCENE);
        } catch (error) {
            this.showError(this.loginError, this.errorMessage(error));
        } finally {
            this.authenticating = false;
        }
    }

    private async onLogin() {
        if (this.authenticating) return;
        const acc = this.accEdit.string.trim();
        const pwd = this.pwdEdit.string;
        if (!acc || !pwd) { this.showError(this.loginError, '请输入账号和密码'); return; }
        this.loginError.node.active = false;
        this.authenticating = true;
        try {
            await authApi.loginWithPassword(acc, pwd, this.region);
            if (this.rememberOn) {
                sys.localStorage.setItem('game_remember', JSON.stringify({ acc, region: this.region }));
            }
            director.loadScene(LoginMain.FARM_SCENE);
        } catch (error) {
            this.showError(this.loginError, this.errorMessage(error));
        } finally {
            this.authenticating = false;
        }
    }

    private async onRegister() {
        if (this.authenticating) return;
        const acc = this.regAccEdit.string.trim();
        const pwd = this.regPwdEdit.string;
        const pwd2 = this.regPwd2Edit.string;
        if (!acc || !pwd || !pwd2) { this.showError(this.regError, '请填写完整信息'); return; }
        if (pwd !== pwd2) { this.showError(this.regError, '两次输入的密码不一致'); return; }
        if (acc.length < 3 || acc.length > 16) { this.showError(this.regError, '账号需为 3-16 位字符'); return; }
        if (pwd.length < 8 || pwd.length > 64) { this.showError(this.regError, '密码长度需为 8-64 位'); return; }
        this.regError.node.active = false;
        this.authenticating = true;
        try {
            await authApi.register(acc, pwd, this.region);
            this.accEdit.string = acc;
            this.pwdEdit.string = '';
            this.showPage(this.pageLogin);
            this.showToast('注册成功，请登录！');
        } catch (error) {
            this.showError(this.regError, this.errorMessage(error));
        } finally {
            this.authenticating = false;
        }
    }

    private errorMessage(error: unknown): string {
        if (error instanceof ApiError || error instanceof Error) return error.message;
        return '登录失败，请稍后重试';
    }

    private toggleRemember() {
        this.rememberOn = !this.rememberOn;
        this.rememberLabel.string = (this.rememberOn ? '☑ ' : '☐ ') + '记住账号';
    }

    private loadRemember() {
        try {
            const raw = sys.localStorage.getItem('game_remember');
            if (raw) {
                const o = JSON.parse(raw);
                if (o && o.acc) this.accEdit.string = o.acc;
                if (o && o.region) { this.region = o.region; this.refreshRegionLabel(); }
            }
        } catch (e) { /* ignore */ }
    }
}