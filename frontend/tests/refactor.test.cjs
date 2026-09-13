const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Test pure helpers without a Creator installation; typecheck separately checks engine signatures.
function load(relative, cc = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '../scripts', relative);
  if (cache.has(filename)) return cache.get(filename);
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
  }).outputText;
  const exports = {};
  cache.set(filename, exports);
  vm.runInThisContext(`(function(exports, require) {${source}\n})`, { filename })(exports, id => {
    if (id === 'cc') return cc;
    assert.ok(id.startsWith('.'));
    return load(path.relative(path.resolve(__dirname, '../scripts'), path.resolve(path.dirname(filename), id + '.ts')), cc, cache);
  });
  return exports;
}

const node = (name, ...children) => ({ name, children });

test('node lookup preserves DFS/BFS ordering, root inclusion and missing results', () => {
  const { findNode, findNamedChild } = load('farm/ui/Ui.ts');
  const deep = node('match'), shallow = node('match');
  const root = node('root', node('branch', deep), shallow);
  assert.equal(findNode(root, 'match'), deep);
  assert.equal(findNode(root, 'root'), root);
  assert.equal(findNode(null, 'match'), null);
  assert.equal(findNode(root, 'missing'), null);
  assert.equal(findNamedChild(root, ['match', 'root']), shallow);
  assert.equal(findNamedChild(root, ['root']), null);
  assert.equal(findNamedChild(root, ['match', 'branch']), root.children[0]);
});

test('consumable catalogs preserve coercion, defaults, duplicate IDs and reference identity', () => {
  const c = load('farm/config/ItemConfig.ts');
  const reference = c.FERTILIZERS;
  c.applyFertilizerCatalog([null, { id: 3 }, { id: 'urea', name: 'old' }, {
    id: 'urea', name: '', type: 'organic', amount: '12', perMinute: '2',
    duration: '5', soilHealth: -3, price: 'bad',
  }]);
  assert.deepEqual(c.getFertilizerDef('urea'), {
    id: 'urea', name: 'urea', itemId: 'fert_urea', type: 'organic',
    amount: 12, perMinute: 2, duration: 5, soilHealth: -3, price: 0,
  });
  assert.equal(c.fertilizerName('missing'), 'missing');
  assert.equal(c.fertilizerItemId('missing'), 'fert_missing');
  c.applyFertilizerCatalog([{ id: 'new', itemId: 'custom' }]);
  assert.equal(c.FERTILIZERS, reference);
  assert.equal(c.getFertilizerDef('urea'), undefined);
  assert.equal(c.getFertilizerDef('new').type, 'inorganic');
  assert.equal(c.fertilizerItemId('new'), 'custom');
  c.applyFertilizerCatalog(null);
  assert.deepEqual(c.FERTILIZERS, {});
  c.applyMedicineCatalog([{ id: 'a', target: 'disease', power: '4', perMinute: 1 }, { id: 'b' }]);
  assert.deepEqual(c.getMedicineDef('a'), {
    id: 'a', name: 'a', itemId: 'med_a', target: 'disease',
    power: 4, perMinute: true, duration: 0, price: 0,
  });
  assert.equal(c.getMedicineDef('b').target, 'pest');
  assert.equal(c.medicineName('unknown'), 'unknown');
  const medicines = c.MEDICINES;
  c.applyMedicineCatalog({});
  assert.equal(c.MEDICINES, medicines);
  assert.deepEqual(c.MEDICINES, {});
});

test('item icons retain ordered fallbacks, cell-only placeholder and failure retries', () => {
  const calls = [];
  const frame = {};
  let success = '';
  const { loadItemIcon } = load('farm/ui/Ui.ts', {
    resources: { load: (p, type, callback) => {
      calls.push(p);
      callback(p === success ? null : Error('missing'), p === success ? frame : null);
    } },
  });
  const sprite = {};
  const expected = ['textures/items/apple/spriteFrame', 'textures/items/apple',
    'textures/items/apple/spriteFrame', 'textures/items/apple',
    'textures/items/fruit_apple/spriteFrame', 'textures/items/seed_apple/spriteFrame',
    'textures/items/fert_apple/spriteFrame'];
  loadItemIcon(sprite, 'apple');
  assert.deepEqual(calls, expected);
  calls.length = 0;
  loadItemIcon(sprite, 'apple', true);
  assert.deepEqual(calls, [...expected, 'textures/ui/cell/spriteFrame', 'textures/ui/cell']);
  calls.length = 0;
  success = 'textures/custom/spriteFrame';
  loadItemIcon(sprite, 'textures/custom');
  assert.deepEqual(calls, [success]);
  assert.equal(sprite.spriteFrame, frame);
  success = expected[0];
  calls.length = 0;
  loadItemIcon(sprite, 'apple');
  assert.deepEqual(calls, [success]); // previous misses are not cached for item cells
});

test('sprite helpers retain request coalescing, cache, validity guard and path substitution', () => {
  const requests = [];
  const ui = load('farm/ui/Ui.ts', {
    resources: { load: (p, type, callback) => requests.push({ p, callback }) },
  });
  const a = { isValid: true }, b = { isValid: true }, frame = {};
  ui.applySprite(a, ['missing', 'ok']);
  ui.applySprite(b, ['missing', 'ok']);
  assert.equal(requests.length, 1);
  requests[0].callback(Error('missing'), null);
  assert.equal(requests.length, 2);
  requests[1].callback(null, frame);
  assert.equal(a.spriteFrame, frame);
  assert.equal(b.spriteFrame, frame);
  const invalid = { isValid: false };
  ui.applySprite(invalid, ['ok']);
  assert.equal(invalid.spriteFrame, undefined);
  assert.equal(requests.length, 2);
  assert.equal(ui.fillPath('{col}/{state}/{unknown}', { col: 0, state: 'a' }), '0/a/{unknown}');
});

function farmFixture() {
  class Sprite { constructor(node) { this.node = node; this.isValid = true; } }
  class Label { string = ''; }
  class Animation {}
  class Vec3 { set() {} }
  class Node {
    static EventType = { TOUCH_END: 'touch-end' };
    constructor(name, ...children) {
      this.name = name; this.children = children; this.isValid = true; this.active = true;
      this.components = new Map(); this.events = new Map();
      for (const child of children) child.parent = this;
    }
    getChildByName(name) { return this.children.find(child => child.name === name) || null; }
    getComponent(type) { return this.components.get(type) || null; }
    getComponentInChildren(type) {
      for (const child of this.children) {
        const found = child.getComponent(type) || child.getComponentInChildren(type);
        if (found) return found;
      }
      return null;
    }
    addComponent() { throw Error('lands and plot prefabs must not receive components'); }
    on(type, cb) { this.events.set(type, [...this.events.get(type) || [], cb]); }
    off(type, cb) { this.events.set(type, (this.events.get(type) || []).filter(fn => fn !== cb)); }
  }
  const listeners = new Set();
  const cc = { Node, Sprite, Label, Animation, Vec3, Component: class {},
    _decorator: { ccclass: () => cls => cls, property: () => () => {} },
    Input: { EventType: { MOUSE_MOVE: 'mouse', TOUCH_START: 'start', TOUCH_MOVE: 'move' } },
    input: { on: (type) => listeners.add(type), off: (type) => listeners.delete(type) },
    resources: { load: (p, type, callback) => callback(null, { path: p }) },
  };
  const cache = new Map();
  const get = name => load(name, cc, cache);
  get('farm/config/CropConfig.ts').applyCropCatalog([{ id: 'shallot', name: '小葱', humidity: [55, 75], targetFertility: 70 }]);
  const { FarmModel } = get('farm/data/FarmModel.ts');
  const { LandView } = get('farm/ui/LandView.ts');
  const sprite = name => { const n = new Node(name); n.components.set(Sprite, new Sprite(n)); return n; };
  const label = name => { const n = new Node(name); n.components.set(Label, new Label()); return n; };
  const plotNode = col => new Node(String(col), sprite('soil'),
    new Node('crop', sprite('stage'), new Node('growth', sprite('bg'), sprite('fill'), label('lb_growth'))),
    new Node('ToolEffect', ...['watering', 'shovel', 'fertilize', 'harvest', 'unlock'].map(name => new Node(`fx_${name}`, sprite('Sprite')))),
    new Node('pest', new Node('fx_pest'), new Node('fx_disease')), new Node('mature'));
  const lands = new Node('lands', ...Array.from({ length: 4 }, (_, i) =>
    new Node(`lands_${i + 1}`, ...Array.from({ length: 6 }, (_, col) => plotNode(col + 1)))));
  const view = new LandView(lands);
  view.farm = new FarmModel(); view.player = { gold: 100, level: 1 };
  view.inventory = { query: () => [] };
  return { view, get, listeners, lands, Sprite, Label };
}

test('unmounted land controller binds 24 plots, one stage sprite and strict 15-point soil thresholds', () => {
  const { view, listeners } = farmFixture();
  assert.equal(view.plots.length, 24);
  assert.equal(listeners.size, 3);
  const plot = view.farm.getPlot(1), tile = view.plots[0];
  Object.assign(plot, { unlocked: true, crop: 'shallot', stage: 1, stageGrowth: 30, moisture: 40, fertility: 55 });
  view.render();
  assert.match(tile.soil.spriteFrame.path, /locked_1a/); // exactly 15 below: normal
  assert.match(tile.stage.spriteFrame.path, /shallot-01/);
  assert.equal(tile.fill.fillRange, .3);
  plot.moisture = 39.99; view.render();
  assert.match(tile.soil.spriteFrame.path, /locked_1d/);
  plot.moisture = 70; plot.fertility = 54.99; plot.stage = 2; view.render();
  assert.match(tile.soil.spriteFrame.path, /locked_1c/);
  assert.match(tile.stage.spriteFrame.path, /shallot-02/);
  plot.stage = 3; plot.mature = true; view.render();
  assert.equal(tile.nodes.crop.active, false);
  assert.equal(tile.nodes.growth.active, false);
  assert.equal(tile.nodes.mature.active, true);
  assert.equal(tile.growthLabel.string, '可采摘');
  plot.pest.status = 'ACTIVE'; view.render();
  assert.equal(tile.nodes.pest.active, true);
  assert.equal(tile.nodes.fx_pest.active, true);
  plot.crop = null; plot.mature = false; view.render();
  assert.match(tile.soil.spriteFrame.path, /locked_1a/); // empty plot never shows deficiency
  plot.unlocked = false; view.render();
  assert.match(tile.soil.spriteFrame.path, /locked_1b/);
  assert.equal(tile.nodes.pest.active, false);
  view.destroy();
  assert.equal(listeners.size, 0);
  assert.equal(tile.node.events.get('touch-end').length, 0);
});

test('water command remains single-flight; effects activate nested fx and expire; cleanup is safe', async () => {
  const { view } = farmFixture();
  let calls = 0, complete;
  view.onAction = async () => { calls++; return new Promise(resolve => { complete = resolve; }); };
  const first = view.doWater(1, 2);
  await view.doWater(1, 2);
  assert.equal(calls, 1);
  complete({ ok: true, message: 'ok' });
  await first;
  const effect = view.plots[0].nodes.fx_watering;
  assert.equal(effect.active, true);
  assert.equal(view.currentTool, 'none');
  const now = Date.now(); view.now = () => now + 5000; view.update();
  assert.equal(effect.active, false);
  view.destroy();
});

test('soil information supplies all requested labels and clears stale values for locked/empty land', () => {
  const { view, get } = farmFixture();
  const { soilInfoValues } = get('farm/ui/SoilInfoPanel.ts');
  const plot = view.farm.getPlot(1);
  Object.assign(plot, { unlocked: true, crop: 'shallot', stage: 1, stageGrowth: 50, growthPerMinute: 50 });
  let values = soilInfoValues(plot, 'normal');
  assert.equal(values.cropName, '小葱');
  assert.equal(values.remainingTime, '预计 9 分钟（按当前环境）');
  assert.equal(values.harvestYield, '--');
  assert.equal(values.fertilizerName, '无');
  Object.assign(plot, { mature: true, harvestQuantity: 8 });
  values = soilInfoValues(plot, 'normal');
  assert.equal(values.matureState, '已成熟');
  assert.equal(values.harvestYield, '8');
  plot.unlocked = false;
  values = soilInfoValues(plot, 'locked');
  for (const name of ['moisture', 'fertility', 'cropName', 'cropStage', 'growth', 'growthSpeed',
    'remainingTime', 'harvestCount', 'pest', 'disease', 'matureState', 'harvestYield', 'quality', 'plantLimit']) {
    assert.equal(values[name], '--', name);
  }
  plot.unlocked = true; plot.crop = null; plot.mature = false;
  assert.equal(soilInfoValues(plot, 'normal').cropName, '空地');
  view.destroy();
});

test('late sprite responses cannot replace a newer crop stage or soil state', () => {
  const requests = [];
  const ui = load('farm/ui/Ui.ts', { resources: { load: (p, type, callback) => requests.push(callback) } });
  const sprite = { isValid: true }, stage1 = {}, stage2 = {};
  ui.applySprite(sprite, ['stage1']);
  ui.applySprite(sprite, ['stage2']);
  requests[1](null, stage2);
  requests[0](null, stage1);
  assert.equal(sprite.spriteFrame, stage2);
});
