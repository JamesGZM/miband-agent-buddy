import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runtimeHarness, ack} from '../helpers/runtime.mjs';

const {createKeepScreen} = createRequire(import.meta.url)('../../apps/band/src/common/keep-screen.js');

function harness({supported = true} = {}) {
  let display;
  const brightness = [];
  const h = runtimeHarness({onWrite(command, child) {
    if (command.op === 'launch_buddy') child.later({event: 'result', id: command.id, ok: true});
    if (command.op !== 'snapshot') return;
    const p = command.payload;
    if (p.wakeId) display.hold(p.wakeId, p.wakeHoldMs);
    if (p.activityHoldMs != null) display.activity(p.activityHoldMs, p.idleHoldMs);
    child.later(ack(p, {keepScreen: display.snapshot().state, wakeDisplay: display.display(),
      capabilities: {maxWakeHoldMs: 1800000, ...(supported ? {activityHold: true} : {})}}));
  }});
  display = createKeepScreen(options => {brightness.push(options.keepScreenOn); options.success();},
    h.clock.now, h.clock.schedule, h.clock.cancel, () => {});
  return {...h, display, brightness,
    hook(event, session = 'a') {h.runtime.acceptHook({event, session: session.repeat(64), at: h.clock.now()});},
    snapshots: () => h.calls.filter(c => c.op === 'snapshot').map(c => c.payload)};
}

test('active work stays held beyond the saved idle time with one brightness request per refresh', async t => {
  const h = harness(); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(5000);
  await h.runtime.dispatch({op: 'configure', settings: {wakeHoldMs: 5000}});
  h.hook('UserPromptSubmit'); await h.clock.advance(65000);
  assert.equal(h.display.display().active, true);
  assert.ok(h.display.display().remainingMs > 0);
  assert.equal(h.brightness.includes(false), false);
  assert.ok(h.brightness.length < 8);
  assert.equal(h.snapshots().at(-1).activityHoldMs, 15000);
  assert.equal(h.snapshots().at(-1).idleHoldMs, 5000);
});

test('one completed session cannot release the other active task or replace its mode', async t => {
  const h = harness(); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(5000);
  h.hook('UserPromptSubmit', 'a'); h.hook('PreToolUse', 'b'); await h.clock.advance(20000);
  h.hook('Stop', 'a'); await h.clock.advance(12000);
  const later = h.snapshots().slice(-4);
  assert.ok(later.every(p => p.mode === 'working' && p.activityHoldMs === 15000));
  assert.deepEqual(later.at(-1).sessionCounts, {thinking: 0, working: 1, attention: 0});
  assert.equal(h.display.display().active, true);
});

test('the last task ending starts saved idle grace once, despite continuing metrics', async t => {
  const h = harness(); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(5000);
  await h.runtime.dispatch({op: 'configure', settings: {wakeHoldMs: 60000}});
  h.hook('UserPromptSubmit'); await h.clock.advance(20000);
  h.hook('Interrupt'); await h.clock.advance(2000);
  assert.equal(h.display.display().active, false);
  const remaining = h.display.display().remainingMs;
  assert.ok(remaining > 58000 && remaining <= 60000);
  await h.clock.advance(remaining);
  assert.equal(h.display.display().remainingMs, 0);
  assert.equal(h.brightness.at(-1), false);
  await h.clock.advance(10000);
  assert.equal(h.display.display().remainingMs, 0);
});

test('pause and disconnect stop renewing the active display within its local watchdog', async t => {
  for (const command of [{op: 'pause', value: true}, {op: 'disconnect'}]) {
    const h = harness(); t.after(() => h.runtime.stop());
    await h.connect(); await h.clock.advance(5000);
    h.hook('UserPromptSubmit'); await h.clock.advance(10000);
    assert.equal(h.display.display().active, true);
    await h.runtime.dispatch(command); await h.clock.advance(15000);
    assert.equal(h.display.display().remainingMs, 0);
    assert.equal(h.brightness.at(-1), false);
  }
});

test('legacy bands receive no activity fields and each new connection renegotiates support', async t => {
  const legacy = harness({supported: false}); t.after(() => legacy.runtime.stop());
  await legacy.connect(); await legacy.clock.advance(5000);
  legacy.hook('UserPromptSubmit'); await legacy.clock.advance(30000);
  assert.ok(legacy.snapshots().every(p => !Object.hasOwn(p, 'activityHoldMs') && !Object.hasOwn(p, 'idleHoldMs')));
  assert.equal(legacy.display.display().active, false);

  const current = harness(); t.after(() => current.runtime.stop());
  await current.connect(); await current.clock.advance(7000);
  assert.equal(current.snapshots()[0].activityHoldMs, undefined);
  assert.equal(current.snapshots().at(-1).activityHoldMs, 0);
  const count = current.snapshots().length;
  await current.connect(); await current.clock.advance(7000);
  assert.equal(current.snapshots()[count].activityHoldMs, undefined);
});

test('eight-hour task without new Hooks stays held without periodic launches until explicit reset', async t => {
  const h = harness(); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(7000);
  await h.runtime.dispatch({op: 'configure', settings: {wakeHoldMs: 60000}});
  h.hook('UserPromptSubmit'); await h.clock.advance(20000);
  const launches = h.calls.filter(c => c.op === 'launch_buddy').length;
  await h.clock.advance(8 * 60 * 60 * 1000);
  const snapshot = h.snapshots().at(-1), activity = h.states.at(-1).agent;
  assert.equal(activity.activeSessions, 1); assert.equal(activity.freshActiveSessions, 0);
  assert.equal(activity.staleSessions, 1); assert.equal(activity.stale, true);
  assert.equal(activity.state, 'thinking');
  assert.equal(snapshot.activityHoldMs, 15000); assert.equal(snapshot.idleHoldMs, 60000);
  assert.equal(h.display.display().active, true); assert.ok(h.display.display().remainingMs > 0);
  assert.equal(h.brightness.includes(false), false);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, launches);
  await h.runtime.dispatch({op: 'reset_activity'}); await h.clock.advance(2000);
  assert.equal(h.states.at(-1).agent.activeSessions, 0);
  assert.equal(h.display.display().active, false);
  assert.ok(h.display.display().remainingMs > 58000);
  await h.clock.advance(60000);
  assert.equal(h.display.display().remainingMs, 0); assert.equal(h.brightness.at(-1), false);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, launches);
});

test('ending fresh work leaves another stale active task held until that task ends', async t => {
  const h = harness(); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(7000);
  h.hook('PermissionRequest', 'a'); await h.clock.advance(15 * 60 * 1000 + 16000);
  h.hook('UserPromptSubmit', 'b'); await h.clock.advance(6000);
  assert.equal(h.states.at(-1).agent.staleSessions, 1);
  assert.equal(h.states.at(-1).agent.freshActiveSessions, 1);
  assert.equal(h.snapshots().at(-1).activityHoldMs, 15000);
  assert.equal(h.display.display().active, true);
  h.hook('Interrupt', 'b'); await h.clock.advance(18000);
  assert.equal(h.snapshots().at(-1).activityHoldMs, 15000);
  assert.equal(h.display.display().active, true);
  h.hook('Interrupt', 'a'); await h.clock.advance(2000);
  assert.equal(h.snapshots().at(-1).activityHoldMs, 0);
  assert.equal(h.display.display().active, false);
  await h.clock.advance(20000); assert.equal(h.display.display().remainingMs, 0);
});

test('reset clears activities and queued event wakes without launching or erasing event evidence', async t => {
  const h = harness(); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(7000);
  await h.runtime.dispatch({op: 'configure', settings: {wakeHoldMs: 60000}});
  h.hook('UserPromptSubmit'); await h.clock.advance(2000);
  assert.equal(h.display.display().active, true);
  const launches = h.calls.filter(c => c.op === 'launch_buddy').length;
  const before = h.states.at(-1).agent;
  await h.runtime.dispatch({op: 'reset_activity'}); await h.clock.advance(2000);
  const after = h.states.at(-1).agent;
  assert.equal(after.activeSessions, 0); assert.equal(after.state, 'idle');
  assert.equal(after.eventCount, before.eventCount); assert.equal(after.lastEventAt, before.lastEventAt);
  assert.equal(h.snapshots().at(-1).activityHoldMs, 0);
  assert.equal(h.display.display().active, false);
  assert.ok(h.display.display().remainingMs > 58000);
  await h.clock.advance(70000);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, launches);
  assert.equal(h.display.display().remainingMs, 0);
});

test('reset cancels an in-flight event wake but preserves an explicit user wake', async t => {
  const h = harness(); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(20000);
  h.hook('UserPromptSubmit'); await h.clock.advance(2000);
  const launches = h.calls.filter(c => c.op === 'launch_buddy').length;
  await h.runtime.dispatch({op: 'reset_activity'}); await h.clock.advance(5000);
  assert.equal(h.states.at(-1).wake.status, 'cancelled');
  assert.equal(h.snapshots().at(-1).wakeId, undefined);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, launches);
  await h.runtime.dispatch({op: 'wake', request: 'user-after-reset'});
  await h.runtime.dispatch({op: 'reset_activity'}); await h.clock.advance(5000);
  assert.equal(h.states.at(-1).operation.status, 'done');
  assert.equal(h.states.at(-1).operation.id, 'user-after-reset');
});
