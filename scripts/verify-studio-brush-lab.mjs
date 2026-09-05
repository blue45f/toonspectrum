import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRUSH_LAB_SLOTS,
  BRUSH_LAB_HISTORY_BYTES,
  composeBrushLabRecipe,
  createBrushLabRevisionGate,
  editBrushLabHistory,
  enumerateBrushLabVariants,
  readBrushLabRecipe,
  redoBrushLabHistory,
  undoBrushLabHistory,
} from '../src/domains/creator/brush/studio-brush-lab-transaction.ts';

const base = Object.freeze({ carrier: 'pinned-carrier', seed: 91, values: {} });
function port(load = async (id) => ({ name: id })) {
  return {
    load,
    merge: (slot, current, source) => ({ ...current, values: { ...current.values, [slot]: source.name } }),
  };
}

test('exactly eight unique, disjoint fine-grained slot identifiers', () => {
  assert.equal(BRUSH_LAB_SLOTS.length, 8);
  assert.equal(new Set(BRUSH_LAB_SLOTS.map((slot) => slot.id)).size, 8);
});
test('rejects primitive, array, null, overlapping bundle and unknown slot recipes', () => {
  for (const value of [null, 1, 'ink', [], { expression: 'a' }, { material: 'b' }, { surprise: 'c' }]) {
    assert.equal(readBrushLabRecipe(value), null);
  }
});
test('rejects invalid source IDs and prototype-looking own fields', () => {
  for (const value of [{ tip: 1 }, { tip: ' a' }, { tip: 'a\n' }, { tip: 'x'.repeat(161) }, JSON.parse('{"__proto__":"a"}')]) {
    assert.equal(readBrushLabRecipe(value), null);
  }
});
test('empty slots preserve current value and do not trigger source loads', async () => {
  let calls = 0;
  const result = await composeBrushLabRecipe(base, { tip: '' }, port(async () => { calls += 1; return null; }));
  assert.equal(calls, 0);
  assert.equal(result.ok, true);
  assert.equal(result.value, base);
});
test('deduplicates shared source loads across different slots', async () => {
  const calls = [];
  const result = await composeBrushLabRecipe(base, { tip: 'ink', surface: 'ink', taper: 'paper' }, port(async (id) => {
    calls.push(id); return { name: id };
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['ink', 'paper']);
  assert.equal(result.value.carrier, base.carrier);
  assert.equal(result.value.seed, base.seed);
  assert.deepEqual(base.values, {});
});
test('canonical slot order ignores input key insertion order', async () => {
  const first = await composeBrushLabRecipe(base, { taper: 'b', tip: 'a' }, port());
  const second = await composeBrushLabRecipe(base, { tip: 'a', taper: 'b' }, port());
  assert.deepEqual(first, second);
  assert.deepEqual(first.applied, ['tip', 'taper']);
});
test('missing source is atomic: no merger runs', async () => {
  let merges = 0;
  const result = await composeBrushLabRecipe(base, { tip: 'good', surface: 'missing' }, {
    load: async (id) => id === 'missing' ? null : { name: id },
    merge: () => { merges += 1; return base; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-source');
  assert.deepEqual(result.sourceIds, ['missing']);
  assert.equal(merges, 0);
});
test('load rejection does not leak unhandled rejection or mutate base', async () => {
  const result = await composeBrushLabRecipe(base, { tip: 'bad' }, port(async () => { throw Error('network'); }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'load-failed');
  assert.deepEqual(base.values, {});
});
test('invalid recipe never calls port', async () => {
  let calls = 0;
  const result = await composeBrushLabRecipe(base, { expression: 'a' }, port(async () => { calls += 1; return null; }));
  assert.equal(result.reason, 'invalid-recipe');
  assert.equal(calls, 0);
});
test('late async completion cannot overwrite a synchronous edit', async () => {
  const gate = createBrushLabRevisionGate();
  const ticket = gate.begin();
  let finish;
  const pending = composeBrushLabRecipe(base, { tip: 'slow' }, port(() => new Promise((resolve) => { finish = resolve; })), () => gate.isCurrent(ticket));
  gate.invalidate();
  finish({ name: 'slow' });
  assert.equal((await pending).reason, 'cancelled');
});
test('newer requests supersede older requests', () => {
  const gate = createBrushLabRevisionGate();
  const older = gate.begin(), newer = gate.begin();
  assert.equal(gate.isCurrent(older), false);
  assert.equal(gate.isCurrent(newer), true);
});
test('already cancelled work does not load anything', async () => {
  let calls = 0;
  const result = await composeBrushLabRecipe(base, { tip: 'x' }, port(async () => { calls += 1; return null; }), () => false);
  assert.equal(result.reason, 'cancelled');
  assert.equal(calls, 0);
});
test('undo/redo order and branch editing are reversible', () => {
  let history = { past: [], present: { n: 0 }, future: [] };
  history = editBrushLabHistory(history, { n: 1 });
  history = editBrushLabHistory(history, { n: 2 });
  history = undoBrushLabHistory(history);
  assert.equal(history.present.n, 1);
  history = undoBrushLabHistory(history);
  assert.equal(history.present.n, 0);
  history = redoBrushLabHistory(history);
  assert.equal(history.present.n, 1);
  history = editBrushLabHistory(history, { n: 3 });
  assert.equal(history.future.length, 0);
  assert.equal(redoBrushLabHistory(history).present.n, 3);
});
test('no-op edit neither adds history nor removes redo', () => {
  const history = { past: [], present: { n: 1 }, future: [{ n: 2 }] };
  assert.equal(editBrushLabHistory(history, { n: 1 }), history);
});
test('history count is bounded during a long editing sequence', () => {
  let history = { past: [], present: { n: 0 }, future: [] };
  for (let n = 1; n <= 10000; n += 1) history = editBrushLabHistory(history, { n });
  assert.equal(history.past.length, 20);
  assert.equal(history.present.n, 10000);
});
test('history byte budget limits imported large alpha tips', () => {
  let history = { past: [], present: { n: 0, alpha: 'x'.repeat(200000) }, future: [] };
  for (let n = 1; n <= 30; n += 1) history = editBrushLabHistory(history, { n, alpha: history.present.alpha });
  assert.ok(history.past.length <= 5);
  assert.ok(history.past.reduce((sum, item) => sum + JSON.stringify(item).length * 2, 0) <= BRUSH_LAB_HISTORY_BYTES);
});
test('variants have a fixed cap, deduplicate source IDs, exclude unchanged source', () => {
  const variants = enumerateBrushLabVariants({ tip: 'same', surface: 'paper' }, 'tip', ['same', 'a', 'a', ...Array.from({ length: 100 }, (_, i) => `source-${i}`)]);
  assert.equal(variants.length, 12);
  assert.equal(new Set(variants.map((value) => value.tip)).size, 12);
  assert.ok(variants.every((value) => value.tip !== 'same' && value.surface === 'paper'));
});
test('variant generation rejects invalid identifiers', () => {
  assert.equal(enumerateBrushLabVariants({}, 'tip', [' a', '\n', 'x'.repeat(161)]).length, 0);
});
test('stale advanced-dialog callback cannot replace a newer history value', () => {
  const old = { n: 0 };
  const history = { past: [old], present: { n: 1 }, future: [] };
  assert.equal(editBrushLabHistory(history, { n: 2 }, old), history);
  assert.equal(editBrushLabHistory(history, { n: 2 }, history.present).present.n, 2);
});
test('invalid early variant candidates do not hide later valid candidates', () => {
  const variants = enumerateBrushLabVariants({}, 'tip', [...Array.from({ length: 20 }, (_, index) => ` invalid-${index}`), 'valid']);
  assert.deepEqual(variants, [{ tip: 'valid' }]);
});
