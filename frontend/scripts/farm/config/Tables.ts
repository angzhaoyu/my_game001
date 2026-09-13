/**
 * config/Tables.ts —— CSV 配置表引擎（`resources/datas/*.csv`）
 *
 * 目的：**把静态数值从代码里搬进表格**，UI 只引用表格，不再抄一遍数字。
 *  - 启动时由 `ui/Assets.ts` 的 `loadResourceTables()` 用 `resources.loadDir('datas', TextAsset)` 一次读完整目录；
 *  - `/game/bootstrap` 的 catalog 到达后调用同一套 `apply(rows)` 覆盖 —— 服务端永远是权威，
 *    表格里写了过期数值也不会算错钱（价格、奖励、成长都仍以服务端命令结果为准）；
 *  - 每张表只声明「字段 → 列别名 + 解析器」，同一份声明既能读中文表头 CSV，也能读服务端 JSON。
 *
 * 本文件不依赖 `cc`（`scripts/farm/config` 属于可在 node 侧单测的纯逻辑层），
 * 表结构见 `resources/datas/README.md`；改数值只改 CSV（或服务端改完后跑 `python tools/gen_client_tables.py`）。
 */
/** 一行原始数据：CSV 的单元格是字符串，服务端 JSON 可能是数字/数组/布尔 */
export type RawRow = Record<string, unknown>;

export type Parser<T> = (raw: unknown, row: RawRow) => T | undefined | null;

export interface Field<T> {
  readonly aliases: string[];
  readonly parse: Parser<T>;
  readonly fallback: T | undefined;
  /** true = 即使 aliases 都没命中也要调用解析器（用于从其它列派生） */
  readonly wholeRow?: boolean;
}

export type Spec<Def> = { [Key in keyof Def]: Field<Def[Key]> };

/** 单列字段：CSV 表头与服务端字段名都写进 aliases，取第一个存在的 */
export function field<T>(aliases: string[], parse: Parser<T>, fallback?: T): Field<T> {
  return { aliases, parse, fallback };
}

/** 需要看整行的字段（派生 id、多列合成一个三元组等）；解析器拿得到整行 */
export function derive<T>(aliases: string[], read: Parser<T>, fallback?: T): Field<T> {
  return { aliases, parse: read, fallback, wholeRow: true };
}

// ---------------------------------------------------------------- 解析器

const toNumber = (value: unknown): number =>
  Number(typeof value === 'string' ? value.replace(/[，,\s]/g, '') : value);

export const asText: Parser<string> = raw =>
  raw === undefined || raw === null ? undefined : (Array.isArray(raw) ? raw.join('|') : String(raw));

export const asNumber: Parser<number> = raw => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = toNumber(raw);
  return Number.isFinite(value) ? value : undefined;
};

export const asBoolean: Parser<boolean> = raw => {
  if (typeof raw === 'boolean') return raw;
  const text = String(raw ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', '是'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', '否', ''].includes(text)) return false;
  return undefined;
};

/** `(25,32)` / `25-32` / `[25,32]` → [25,32] */
export const asPair: Parser<[number, number]> = raw => {
  if (Array.isArray(raw) && raw.length >= 2) return [toNumber(raw[0]), toNumber(raw[1])];
  const parts = String(raw ?? '').match(/-?\d+(?:\.\d+)?/g);
  return parts && parts.length >= 2 ? [Number(parts[0]), Number(parts[1])] : undefined;
};

/** `compost|npk_15|硫酸钾` 或字符串数组 → 去空白的字符串数组 */
export const asList: Parser<string[]> = raw => {
  if (Array.isArray(raw)) return raw.map(item => String(item).trim()).filter(Boolean);
  return String(raw ?? '').split(/[|/、,，;；]/).map(item => item.trim()).filter(Boolean);
};

/** 在行里按别名找原始值（大小写无关，兼容 CSV 表头差异）；派生字段也能复用 */
export function valueOf(row: RawRow, ...aliases: string[]): unknown {
  return pick(row, aliases);
}

function pick(row: RawRow, aliases: string[]): unknown {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== '') return row[alias];
  }
  const lower = Object.keys(row).reduce<Record<string, unknown>>((acc, key) => {
    acc[key.trim().toLowerCase()] = row[key];
    return acc;
  }, {});
  for (const alias of aliases) {
    const value = lower[alias.trim().toLowerCase()];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
}

export function buildRow<Def>(row: RawRow, spec: Spec<Def>): Def {
  const out: Record<string, unknown> = {};
  (Object.keys(spec) as string[]).forEach(key => {
    const definition = spec[key as keyof Def] as Field<unknown>;
    const raw = pick(row, definition.aliases);
    const value = definition.wholeRow || raw !== undefined ? definition.parse(raw, row) : undefined;
    out[key] = value === undefined || value === null ? definition.fallback : value;
  });
  return out as Def;
}

export function buildRows<Def>(rows: readonly RawRow[], spec: Spec<Def>, key: keyof Def): Map<string, Def> {
  const index = new Map<string, Def>();
  rows.forEach(row => {
    const built = buildRow<Def>(row, spec);
    const id = String((built as Record<string, unknown>)[key as string] ?? '');
    if (id) index.set(id, built);
  });
  return index;
}

// ---------------------------------------------------------------- 表注册

export interface Table<Def> {
  readonly name: string;
  /** 全部行（保持表内顺序） */
  all(): Def[];
  /** 按主键取行；未加载时返回 undefined，UI 必须能容忍缺配置 */
  get(id: string | null | undefined): Def | undefined;
  /** 覆盖式写入：CSV 或服务端 catalog 都走这里 */
  apply(rows: readonly unknown[] | null | undefined): void;
  /** 表内容变化后通知视图重绑 */
  subscribe(listener: () => void): void;
  readonly loaded: boolean;
}

const registry = new Map<string, Table<unknown>>();

export function defineTable<Def>(name: string, spec: Spec<Def>, key: keyof Def): Table<Def> {
  let rows: Def[] = [];
  let index = new Map<string, Def>();
  let loaded = false;
  const listeners: Array<() => void> = [];

  const table: Table<Def> = {
    name,
    all: () => rows,
    get: id => (id ? index.get(String(id)) : undefined),
    apply: raw => {
      if (!Array.isArray(raw)) return;
      index = buildRows<Def>(raw as RawRow[], spec, key);
      rows = Array.from(index.values());
      loaded = rows.length > 0;
      listeners.splice(0).forEach(listener => listener());
    },
    subscribe: listener => listeners.push(listener),
    get loaded() { return loaded; },
  };
  registry.set(name, table as Table<unknown>);
  return table;
}

export function getTable<Def>(name: string): Table<Def> | null {
  return (registry.get(name) as Table<Def>) ?? null;
}

// ---------------------------------------------------------------- CSV

/** 支持引号包裹、双引号转义、CRLF、UTF-8 BOM、`#` 注释行 */
export function parseCsv(text: string): RawRow[] {
  const rows = splitRows(String(text ?? '').replace(/^\uFEFF/, ''));
  if (rows.length === 0) return [];
  const header = rows[0].map(cell => cell.trim());
  const out: RawRow[] = [];
  for (let line = 1; line < rows.length; line++) {
    const cells = rows[line];
    if (cells.length === 0 || cells.every(cell => cell.trim() === '')) continue;
    if (cells[0].trim().startsWith('#')) continue;
    const row: RawRow = {};
    header.forEach((key, index) => { if (key) row[key] = (cells[index] ?? '').trim(); });
    out.push(row);
  }
  return out;
}

function splitRows(text: string): string[][] {
  const rows: string[][] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { cells.push(cell); cell = ''; continue; }
    if (char === '\n') { cells.push(cell); rows.push(cells); cells = []; cell = ''; continue; }
    if (char === '\r') continue;
    cell += char;
  }
  if (cell !== '' || cells.length > 0) { cells.push(cell); rows.push(cells); }
  return rows;
}

// ---------------------------------------------------------------- 表装载入口

/** 按表名喂一段 CSV 文本（`ui/Assets.ts` 读完 TextAsset 后调用；也方便单测直接塞文本） */
export function applyCsvText(name: string, text: string): boolean {
  const table = registry.get(name);
  if (!table) return false;
  table.apply(parseCsv(text));
  return true;
}

export function tableNames(): string[] {
  return Array.from(registry.keys());
}
