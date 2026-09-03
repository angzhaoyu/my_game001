/**
 * Cocos Creator `cc` 模块的**本地类型声明**，仅供 `npm run typecheck` 做静态检查。
 *
 * 本仓库只保存脚本源码，真实的 Cocos Creator 工程在编辑器里提供 `cc` 的类型。
 * 这里的声明只包含本项目用到的 API，目的是让 UI 代码在提交前也能被类型检查，
 * 不会被打包进小游戏，也不参与 Cocos 构建（构建时请排除 `typings/` 目录）。
 */
declare module 'cc' {
  export type Constructor<T = unknown> = new (...args: any[]) => T;

  export const _decorator: {
    ccclass(name?: string): ClassDecorator;
    property(options?: any): PropertyDecorator;
    property(type?: any): PropertyDecorator;
  };

  export class Vec3 {
    x: number; y: number; z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z?: number): Vec3;
    clone(): Vec3;
  }

  export class Vec2 {
    x: number; y: number;
    constructor(x?: number, y?: number);
    set(x: number, y: number): Vec2;
  }

  export class Size {
    width: number; height: number;
    constructor(width?: number, height?: number);
  }

  export class Color {
    r: number; g: number; b: number; a: number;
    constructor(r?: number, g?: number, b?: number, a?: number);
    static WHITE: Color;
    static BLACK: Color;
    clone(): Color;
  }

  export class Rect {
    x: number; y: number; width: number; height: number;
    constructor(x?: number, y?: number, width?: number, height?: number);
    contains(point: Vec2): boolean;
  }

  export class UITransform extends Component {
    static EventType: { TRANSFORM_CHANGED: string };
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
    setContentSize(width: number | Size, height?: number): void;
    getContentSize(out?: Size): Size;
    setAnchorPoint(x: number, y: number): void;
    setAnchorPoint(point: Vec2): void;
    convertToNodeSpaceAR(worldPoint: Vec3, out?: Vec3): Vec3;
    convertToWorldSpaceAR(nodePoint: Vec3, out?: Vec3): Vec3;
  }

  export class Node {
    name: string;
    active: boolean;
    isValid: boolean;
    parent: Node | null;
    children: Node[];
    layer: number;
    scene: Scene | null;
    position: Vec3;
    worldPosition: Vec3;
    angle: number;
    scale: Vec3;
    static EventType: {
      TOUCH_START: string; TOUCH_MOVE: string; TOUCH_END: string; TOUCH_CANCEL: string;
      MOUSE_DOWN: string; MOUSE_UP: string; MOUSE_MOVE: string;
      TRANSFORM_CHANGED: string; SIZE_CHANGED: string;
    };
    constructor(name?: string);
    addChild(child: Node): void;
    removeChild(child: Node): void;
    removeFromParent(): void;
    destroy(): boolean;
    destroyAllChildren(): void;
    getChildByName(name: string): Node | null;
    getChildByPath(path: string): Node | null;
    getComponent<T extends Component>(ctor: Constructor<T>): T | null;
    getComponent(name: string): Component | null;
    getComponentInChildren<T extends Component>(ctor: Constructor<T>): T | null;
    getComponentsInChildren<T extends Component>(ctor: Constructor<T>): T[];
    addComponent<T extends Component>(ctor: Constructor<T>): T;
    addComponent(name: string): Component;
    setPosition(x: number, y: number, z?: number): void;
    setPosition(position: Vec3): void;
    setWorldPosition(x: number, y: number, z: number): void;
    setWorldPosition(position: Vec3): void;
    setScale(x: number, y: number, z?: number): void;
    setSiblingIndex(index: number): void;
    getSiblingIndex(): number;
    on(type: string, callback: (event?: any) => void, target?: unknown): void;
    off(type: string, callback?: (event?: any) => void, target?: unknown): void;
    once(type: string, callback: (event?: any) => void, target?: unknown): void;
    emit(type: string, ...args: unknown[]): void;
    clone(): Node;
  }

  export class Component {
    name: string;
    node: Node;
    enabled: boolean;
    isValid: boolean;
    protected onLoad(): void;
    protected start(): void;
    protected update(deltaTime: number): void;
    protected onEnable(): void;
    protected onDisable(): void;
    protected onDestroy(): void;
    schedule(callback: () => void, interval?: number, repeat?: number, delay?: number): void;
    scheduleOnce(callback: () => void, delay?: number): void;
    unschedule(callback: () => void): void;
    unscheduleAllCallbacks(): void;
    destroy(): boolean;
    getComponent<T extends Component>(ctor: Constructor<T>): T | null;
    getComponent(name: string): Component | null;
    getComponentInChildren<T extends Component>(ctor: Constructor<T>): T | null;
    getComponentsInChildren<T extends Component>(ctor: Constructor<T>): T[];
    addComponent<T extends Component>(ctor: Constructor<T>): T;
    addComponent(name: string): Component;
  }

  export class SpriteFrame {
    name: string;
  }

  export enum SizeMode { CUSTOM, TRIMMED, RAW }

  export class Sprite extends Component {
    static SizeMode: typeof SizeMode;
    sizeMode: SizeMode;
    spriteFrame: SpriteFrame | null;
    fillRange: number;
    fillStart: number;
    type: number;
    color: Color;
  }

  export class Label extends Component {
    static HorizontalAlign: { LEFT: number; CENTER: number; RIGHT: number };
    static VerticalAlign: { TOP: number; CENTER: number; BOTTOM: number };
    static Overflow: { NONE: number; CLAMP: number; SHRINK: number; RESIZE_HEIGHT: number };
    string: string;
    fontSize: number;
    lineHeight: number;
    color: Color;
    isBold: boolean;
    horizontalAlign: number;
    verticalAlign: number;
    overflow: number;
    enableWrapText: boolean;
  }

  export class Button extends Component {
    static Transition: { NONE: number; COLOR: number; SPRITE: number; SCALE: number };
    static EventType: { CLICK: string };
    transition: number;
    zoomScale: number;
    interactable: boolean;
    target: Node | null;
    clickEvents: any[];
  }

  export class Layout extends Component {
    static Type: { NONE: number; HORIZONTAL: number; VERTICAL: number; GRID: number };
    static ResizeMode: { NONE: number; CONTAINER: number; CHILDREN: number };
    type: number;
    resizeMode: number;
    cellSize: Size;
    spacingX: number;
    spacingY: number;
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    paddingBottom: number;
    updateLayout(): void;
  }

  export class ScrollView extends Component {
    content: Node | null;
    vertical: boolean;
    horizontal: boolean;
    verticalScrollBar: any;
    scrollToTop(time?: number): void;
    scrollToBottom(time?: number): void;
    scrollToOffset(offset: Vec2, time?: number): void;
  }

  export class UIOpacity extends Component {
    opacity: number;
  }

  export class Widget extends Component {
    isAlignTop: boolean;
    isAlignBottom: boolean;
    isAlignLeft: boolean;
    isAlignRight: boolean;
    isAlignHorizontalCenter: boolean;
    isAlignVerticalCenter: boolean;
    top: number; bottom: number; left: number; right: number;
    updateAlignment(): void;
  }

  export class Mask extends Component {
    static Type: { GRAPHICS_RECT: number; GRAPHICS_ELLIPSE: number; SPRITE_STENCIL: number };
    type: number;
  }

  export class Graphics extends Component {
    fillColor: Color;
    strokeColor: Color;
    lineWidth: number;
    rect(x: number, y: number, width: number, height: number): void;
    roundRect(x: number, y: number, width: number, height: number, radius: number): void;
    circle(x: number, y: number, radius: number): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    stroke(): void;
    fill(): void;
    clear(): void;
  }

  export class Animation extends Component {
    defaultClip: AnimationClip | null;
    clips: AnimationClip[];
    play(name?: string): any;
    stop(): void;
  }

  export class AnimationClip {
    name: string;
    duration: number;
  }

  export class EditBox extends Component {
    static InputMode: { ANY: number; SINGLE_LINE: number; NUMERIC: number; PASSWORD: number };
    static InputFlag: { DEFAULT: number; PASSWORD: number; SENSITIVE: number };
    static KeyboardReturnType: { DEFAULT: number; DONE: number; SEND: number; GO: number };
    string: string;
    placeholder: string;
    maxLength: number;
    inputMode: number;
    inputFlag: number;
    returnType: number;
    textLabel: Label | null;
    placeholderLabel: Label | null;
  }

  export const sys: {
    platform: number;
    isMobile: boolean;
    isBrowser: boolean;
    os: string;
    language: string;
    localStorage: any;
  };

  export class Toggle extends Component {
    static EventType: { TOGGLE: string };
    isChecked: boolean;
    checkEvents: any[];
  }

  export class BlockInputEvents extends Component {}

  export class Prefab {}

  export function instantiate<T extends Node>(original: T | Prefab): T;
  export function tween<T extends object>(target: T): Tween<T>;

  export class Tween<T extends object> {
    to(duration: number, props?: any, opts?: any): Tween<T>;
    by(duration: number, props?: any): Tween<T>;
    delay(duration: number): Tween<T>;
    call(callback: () => void): Tween<T>;
    stop(): Tween<T>;
    start(): Tween<T>;
    removeSelf(): Tween<T>;
  }

  export class EventTouch {
    target: Node | null;
    currentTarget: Node | null;
    getUILocation(out?: Vec2): Vec2;
    getLocation(out?: Vec2): Vec2;
    getStartLocation(out?: Vec2): Vec2;
    getDelta(out?: Vec2): Vec2;
    propagationStopped: boolean;
  }

  export class EventMouse {
    getUILocation(out?: Vec2): Vec2;
    getLocation(out?: Vec2): Vec2;
    getButton(): number;
    propagationStopped: boolean;
  }

  export namespace Input {
    const EventType: {
      TOUCH_START: string; TOUCH_MOVE: string; TOUCH_END: string; TOUCH_CANCEL: string;
      MOUSE_DOWN: string; MOUSE_MOVE: string; MOUSE_UP: string; MOUSE_WHEEL: string;
      KEY_DOWN: string; KEY_UP: string;
    };
  }

  export class InputManager {
    on(type: string, callback: (event: any) => void, target?: unknown): void;
    off(type: string, callback?: (event: any) => void, target?: unknown): void;
  }

  export const input: InputManager;

  export const Layers: { Enum: Record<string, number> };

  export class AssetManager {
    load<T = any>(path: string, type: Constructor<T> | null,
                  callback: (error: Error | null, asset: T) => void): void;
    load<T = any>(path: string,
                  callback: (error: Error | null, asset: T) => void): void;
    loadDir<T = any>(path: string, type: Constructor<T> | null,
                     callback: (error: Error | null, assets: T[]) => void): void;
  }

  export const resources: AssetManager;

  /** Cocos Creator 3.x 里 Scene 继承自 Node */
  export class Scene extends Node {
    getChildByName(name: string): Node | null;
  }

  export class Director {
    loadScene(name: string, callback?: (error: Error | null) => void): boolean;
    getScene(): Scene | null;
  }

  export const director: Director;

  export namespace Game {
    const EVENT_SHOW: string;
    const EVENT_HIDE: string;
  }

  export class GameInstance {
    on(type: string, callback: (...args: any[]) => void, target?: unknown): void;
    off(type: string, callback?: (...args: any[]) => void, target?: unknown): void;
  }

  export const game: GameInstance;

  export namespace ResolutionPolicy {
    const FIXED_HEIGHT: number;
    const FIXED_WIDTH: number;
    const SHOW_ALL: number;
    const EXACT_FIT: number;
  }

  export class View {
    setDesignResolutionSize(width: number, height: number, resolutionPolicy: number): void;
    getVisibleSize(out?: Size): Size;
  }

  export const view: View;

  export function warn(...args: unknown[]): void;
  export function error(...args: unknown[]): void;
  export function log(...args: unknown[]): void;
}
