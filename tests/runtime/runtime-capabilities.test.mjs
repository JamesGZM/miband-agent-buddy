import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeHarness, ack} from '../helpers/runtime.mjs';

// An awake band answering every snapshot; `capabilities` mirrors what Buddy advertises.
function band(capabilities) {
  return (command, child) => {
    if (command.op === 'launch_buddy') child.later({event: 'result', id: command.id, ok: true});
    if (command.op !== 'snapshot') return;
    const p = command.payload;
    child.later(ack(p, {keepScreen: p.wakeId ? 'on' : 'off', buddyTheme: p.buddyTheme,
      settingsRevision: p.settingsRevision, settingsApplied: true,
      wakeDisplay: {id: p.wakeId || null, remainingMs: p.wakeId ? p.wakeHoldMs : 0},
      ...(capabilities ? {capabilities} : {})}));
  };
}
const holds = h => h.calls.filter(c => c.op === 'snapshot' && c.payload.wakeId).map(c => c.payload.wakeHoldMs);

test('wake lease uses the saved hold but never exceeds what the band advertises', async t => {
  for (const [capabilities, expected] of [[null, 30000], [{maxWakeHoldMs: 1800000}, 300000], [{maxWakeHoldMs: 60000}, 60000]]) {
    const h = runtimeHarness({onWrite: band(capabilities)}); t.after(() => h.runtime.stop());
    await h.connect();
    await h.clock.advance(5000);
    await h.runtime.dispatch({op: 'configure', settings: {revision: 0, wakeHoldMs: 300000}});
    await h.runtime.dispatch({op: 'wake', request: 'op-1'});
    await h.clock.advance(5000);
    assert.equal(h.state.operation.status, 'done');
    assert.equal(holds(h).at(-1), expected);
  }
});

test('out-of-range hold settings are rejected at the runtime boundary', async t => {
  const h = runtimeHarness({onWrite: band(null)}); t.after(() => h.runtime.stop());
  await h.connect();
  for (const wakeHoldMs of [4999, 1800001, 20000.5]) {
    await h.runtime.dispatch({op: 'configure', settings: {revision: 0, wakeHoldMs}});
  }
  assert.equal(h.state.settings.wakeHoldMs, 20000);
});

test('power saving defaults off and is only sent to a band advertising the capability', async t => {
  for (const supported of [false, true]) {
    const h = runtimeHarness({onWrite: band(supported ? {powerSaving:true} : null)});
    t.after(() => h.runtime.stop());
    await h.connect(); await h.clock.advance(7000);
    const snapshots = () => h.calls.filter(c => c.op === 'snapshot').map(c => c.payload);
    assert.equal(h.state.settings.powerSaving, false);
    assert.equal(Object.hasOwn(snapshots()[0], 'powerSaving'), false);
    assert.equal(snapshots().at(-1).powerSaving, supported ? false : undefined);
    for (const value of ['true', 1, null]) await h.runtime.dispatch({op:'configure',settings:{powerSaving:value}});
    assert.equal(h.state.settings.powerSaving, false);
    await h.runtime.dispatch({op:'configure',settings:{powerSaving:true}}); await h.clock.advance(4000);
    assert.equal(h.state.settings.powerSaving, true);
    assert.equal(snapshots().at(-1).powerSaving, supported ? true : undefined);
    await h.runtime.dispatch({op:'configure',settings:{powerSaving:false}}); await h.clock.advance(4000);
    assert.equal(snapshots().at(-1).powerSaving, supported ? false : undefined);
  }
});

test('device status follows the first Buddy reply, explicit refresh and five-minute interval', async t => {
  const h = runtimeHarness({onWrite: band(null)}); t.after(() => h.runtime.stop());
  await h.connect();
  const requests = () => h.calls.filter(c => c.op === 'device_status').length;
  assert.equal(requests(), 0);
  await h.clock.advance(6000);
  assert.equal(requests(), 1);
  h.children[0].event({event: 'device', battery: 64, charging: true, firmware: '3.0.0', model: 'fixture-model', storageTotal: 1000, storageFree: 250});
  assert.deepEqual(h.state.device, {battery: 64, charging: true, firmware: '3.0.0', model: 'fixture-model', storageTotal: 1000, storageFree: 250, at: h.clock.now()});
  assert.equal(h.state.battery, 64);
  h.children[0].event({event: 'device', battery: 64, storageTotal: 10, storageFree: 20});
  assert.equal(h.state.device.storageFree, 250);
  await h.runtime.dispatch({op: 'refresh_device'});
  assert.equal(requests(), 2);
  await h.clock.advance(300000);
  assert.equal(requests(), 3);
  h.children[0].event({event: 'battery', percent: 63, charging: false});
  assert.deepEqual([h.state.device.battery, h.state.device.charging], [63, false]);
  h.children[0].event({event: 'result', id: 'device-status', ok: false, code: 'operation_failed'});
  assert.equal(h.state.connection, 'connected');
});

test('DeepSeek is refused before reaching a Buddy that does not advertise it', async t => {
  const old = runtimeHarness({onWrite: band(null)}); t.after(() => old.runtime.stop());
  await old.connect();
  await old.clock.advance(5000);
  await old.runtime.dispatch({op: 'configure', settings: {buddyTheme: 'deepseek', revision: 3}, request: 'op-1'});
  assert.deepEqual([old.state.operation.status, old.state.operation.code], ['failed', 'unsupported']);
  assert.equal(old.state.settings.buddyTheme, 'chatgpt');
  await old.clock.advance(5000);
  assert.equal(old.calls.some(c => c.op === 'snapshot' && c.payload.buddyTheme === 'deepseek'), false);

  const current = runtimeHarness({onWrite: band({themes: ['chatgpt', 'claude', 'deepseek']})}); t.after(() => current.runtime.stop());
  await current.connect();
  await current.clock.advance(5000);
  await current.runtime.dispatch({op: 'configure', settings: {buddyTheme: 'deepseek', revision: 3}, request: 'op-1'});
  await current.clock.advance(5000);
  assert.equal(current.state.operation.status, 'done');
});
