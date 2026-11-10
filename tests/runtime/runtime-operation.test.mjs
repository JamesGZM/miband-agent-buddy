import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeHarness, ack} from '../helpers/runtime.mjs';

// A band that sleeps until launched, then answers like Buddy 0.5.2.
function sleepingBand({launchOk = true, page = true, answer = true} = {}) {
  const band = {awake: false, page: 0, theme: 'chatgpt', revision: 0, launches: []};
  band.onWrite = (command, child) => {
    if (command.op === 'launch_buddy') {
      band.launches.push(command.id);
      band.awake = launchOk;
      child.later({event: 'result', id: command.id, ok: launchOk, code: launchOk ? null : 'app_missing'});
    }
    if (command.op === 'ping') child.later({event: 'result', id: command.id, ok: true});
    if (command.op !== 'snapshot' || !band.awake || !answer) return;
    const p = command.payload;
    if (page && p.page != null) band.page = p.page;
    band.theme = p.buddyTheme; band.revision = p.settingsRevision;
    child.later(ack(p, {
      keepScreen: p.wakeId ? 'on' : 'off', page: band.page,
      buddyTheme: band.theme, settingsRevision: band.revision, settingsApplied: true,
      wakeDisplay: {id: p.wakeId || null, remainingMs: p.wakeId ? 20000 : 0},
    }));
  };
  return band;
}
async function asleep(band) {
  const h = runtimeHarness({onWrite: (c, child) => band.onWrite(c, child)});
  await h.connect();
  await h.clock.advance(5000);
  band.awake = false;
  band.launches.length = 0;
  await h.clock.advance(45000);
  assert.equal(h.state.connection, 'standby');
  return h;
}
const ops = h => h.states.map(s => s.operation).filter(Boolean);

test('theme change on a sleeping band launches Buddy at once and settles after the matching ACK', async t => {
  const band = sleepingBand();
  const h = await asleep(band);
  t.after(() => h.runtime.stop());
  // Codex just woke the band; a user action must not wait for the global cooldown.
  h.hook('UserPromptSubmit');
  await h.clock.advance(2000);
  band.launches.length = 0;
  await h.runtime.dispatch({op: 'configure', settings: {buddyTheme: 'claude', revision: 3}, request: 'op-1'});
  assert.equal(band.launches.length, 1);
  assert.equal(h.state.operation.status, 'waking');
  await h.clock.advance(6000);
  assert.ok(ops(h).some(o => o.id === 'op-1' && o.status === 'applying'));
  assert.equal(h.state.operation.status, 'done');
  assert.equal(band.theme, 'claude');
  const launch = h.calls.filter(c => c.op === 'launch_buddy').at(-1).id;
  const snapshot = h.calls.find(c => c.op === 'snapshot' && c.payload.wakeId === launch).payload;
  assert.deepEqual([snapshot.wakeHoldMs, snapshot.keepScreen, snapshot.buddyTheme], [20000, false, 'claude']);
});

test('page switch is carried by the snapshot after launch and confirmed by ACK page', async t => {
  const band = sleepingBand();
  const h = await asleep(band);
  t.after(() => h.runtime.stop());
  await h.runtime.dispatch({op: 'show_page', page: 1, request: 'op-2'});
  await h.clock.advance(6000);
  assert.equal(h.state.operation.status, 'done');
  assert.equal(band.page, 1);
  const sent = h.calls.filter(c => c.op === 'snapshot').map(c => c.payload);
  assert.ok(sent.every(p => p.page == null || p.wakeId));
  await h.clock.advance(6000);
  assert.equal(h.calls.filter(c => c.op === 'snapshot').at(-1).payload.page, undefined);
});

test('older Buddy that ignores the page field fails as unsupported', async t => {
  const band = sleepingBand({page: false});
  const h = await asleep(band);
  t.after(() => h.runtime.stop());
  await h.runtime.dispatch({op: 'show_page', page: 1, request: 'op-3'});
  await h.clock.advance(6000);
  assert.deepEqual([h.state.operation.status, h.state.operation.code], ['failed', 'unsupported']);
});

test('missing Buddy, silent band and pause each settle the operation exactly once', async t => {
  const missing = await asleep(sleepingBand({launchOk: false}));
  t.after(() => missing.runtime.stop());
  await missing.runtime.dispatch({op: 'wake', request: 'op-4'});
  await missing.clock.advance(1000);
  assert.deepEqual([missing.state.operation.status, missing.state.operation.code], ['failed', 'app_missing']);

  const silent = await asleep(sleepingBand({answer: false}));
  t.after(() => silent.runtime.stop());
  await silent.runtime.dispatch({op: 'configure', settings: {buddyTheme: 'claude', revision: 4}, request: 'op-5'});
  await silent.clock.advance(30000);
  assert.equal(silent.state.operation.status, 'failed');
  assert.ok(['no_response', 'timeout'].includes(silent.state.operation.code));
  assert.equal(ops(silent).filter(o => o.status === 'failed').map(o => o.settledAt).filter((v, i, a) => a.indexOf(v) === i).length, 1);

  const paused = await asleep(sleepingBand({answer: false}));
  t.after(() => paused.runtime.stop());
  await paused.runtime.dispatch({op: 'wake', request: 'op-6'});
  await paused.runtime.dispatch({op: 'pause', value: true});
  assert.deepEqual([paused.state.operation.status, paused.state.operation.code], ['cancelled', 'paused']);
  await paused.runtime.dispatch({op: 'wake', request: 'op-7'});
  assert.deepEqual([paused.state.operation.status, paused.state.operation.code], ['failed', 'paused']);
});

test('wake operation is done only when the band holds the display lease', async t => {
  const band = sleepingBand();
  const h = await asleep(band);
  t.after(() => h.runtime.stop());
  await h.runtime.dispatch({op: 'wake', request: 'op-8'});
  await h.clock.advance(6000);
  assert.equal(h.state.operation.status, 'done');
  assert.equal(h.state.wake.status, 'confirmed');
  assert.equal(h.state.wake.reason, 'user');
});
