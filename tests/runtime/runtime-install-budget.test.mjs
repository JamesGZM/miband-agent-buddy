import test from 'node:test';
import assert from 'node:assert/strict';
import {installationTimeout} from '../../services/runtime/src/core/runtime.mjs';
import {runtimeHarness} from '../helpers/runtime.mjs';

test('installation budgets preserve the small fallback and bound larger verified packages', () => {
  for (const size of [undefined, null, NaN, -1, 1.5, '5391521', 16 * 1024 * 1024]) {
    assert.equal(installationTimeout(size), 310000);
  }
  for (const [size, budget] of [
    [0,310000], [180*12288,310000], [180*12288+1,311000],
    [3000000,375000], [5391521,569000], [780*12288,910000], [16*1024*1024-1,910000],
  ]) assert.equal(installationTimeout(size), budget);
});

test('a larger install survives the old deadline but a stalled transfer still expires', async t => {
  const h = runtimeHarness({bandPackage:{versionName:'0.5.5',versionCode:17,sizeBytes:5391521}});
  t.after(() => h.runtime.stop());
  await h.connect();
  await h.runtime.dispatch({op:'install'});
  await h.clock.advance(310000);
  assert.equal(h.children[0].killed, 0);
  assert.equal(h.state.connection, 'installing');
  await h.clock.advance(258999);
  h.children[0].event({event:'progress',progress:1});
  assert.equal(h.children[0].killed, 0, '100% transfer is not an installation result');
  await h.clock.advance(1);
  assert.equal(h.children[0].killed, 1);
  assert.ok(h.states.some(s => s.installation?.code === 'timeout'));
});

test('explicit injected install timing still overrides a large package budget', async t => {
  const h = runtimeHarness({bandPackage:{sizeBytes:5391521},timings:{install:100}});
  t.after(() => h.runtime.stop());
  await h.connect();
  await h.runtime.dispatch({op:'install'});
  await h.clock.advance(99);
  assert.equal(h.children[0].killed, 0);
  await h.clock.advance(1);
  assert.equal(h.children[0].killed, 1);
});
