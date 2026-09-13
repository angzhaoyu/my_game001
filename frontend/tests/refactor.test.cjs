const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Test pure helpers without a Creator installation; typecheck separately checks engine signatures.
function load(relative, cc = {}) {
  const filename = path.resolve(__dirname, '../scripts', relative);
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInThisContext(`(function(exports, require) {${source}\n})`, { filename })(exports, id => {
    assert.equal(id, 'cc');
    return cc;
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
