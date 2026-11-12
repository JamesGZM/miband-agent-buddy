import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runtimeHarness, ack} from '../helpers/runtime.mjs';

const {createKeepScreen} = createRequire(import.meta.url)('../../apps/band/src/common/keep-screen.js');

function harness({supported = true, ringSupported = false, activityKeepAwake = true, activityHoldMax, sample} = {}) {
  let display;
  const brightness = [];
  const h = runtimeHarness({sample, onWrite(command, child) {
    if (command.op === 'launch_buddy') child.later({event: 'result', id: command.id, ok: true});
    if (command.op !== 'snapshot') return;
    const p = command.payload;
    if (p.wakeId) display.hold(p.wakeId, p.wakeHoldMs);
    if (p.activityHoldMs != null) display.activity(p.activityHoldMs, p.idleHoldMs);
    child.later(ack(p, {keepScreen: display.snapshot().state, wakeDisplay: display.display(),
      capabilities: {maxWakeHoldMs: 1800000, ...(supported ? {activityHold: true} : {}), ...(activityHoldMax===undefined?{}:{maxActivityHoldMs:activityHoldMax}), ...(ringSupported?{activityRing:true}:{})}}));
  }});
  display = createKeepScreen(options => {brightness.push(options.keepScreenOn); options.success();},
    h.clock.now, h.clock.schedule, h.clock.cancel, () => {});
  return {...h, display, brightness,
    async connect() {
      await h.connect();
      if (activityKeepAwake) await h.runtime.dispatch({op: 'configure', settings: {activityKeepAwake: true}});
    },
    hook(event, session = 'a') {h.runtime.acceptHook({event, session: session.repeat(64), at: h.clock.now()});},
    snapshots: () => h.calls.filter(c => c.op === 'snapshot').map(c => c.payload)};
}

for(const [maximum,expected] of [[120000,120000],[60000,60000],[600000,120000],[undefined,15000],[999,15000]])test(`active lease negotiates ${maximum} without breaking older Buddy`,async t=>{
 const h=harness({activityHoldMax:maximum});t.after(()=>h.runtime.stop());
 await h.connect();await h.clock.advance(7000);h.hook('UserPromptSubmit');await h.clock.advance(4000);
 assert.equal(h.snapshots().at(-1).activityHoldMs,expected);
});

test('failed resource sampling cannot stop task display renewal or terminal events', async t => {
  let failing = false;
  const h = harness({sample: async () => {
    if (failing) throw new Error('synthetic sampling failure');
    return {cpu:42};
  }}); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(7000);
  h.hook('PreToolUse'); await h.clock.advance(4000);
  failing = true;
  await h.clock.advance(60000);
  assert.equal(h.display.display().active, true);
  assert.equal(h.brightness.includes(false), false);
  assert.equal(h.snapshots().at(-1).cpu, -1);
  h.hook('Interrupt'); await h.clock.advance(2000);
  assert.equal(h.display.display().active, false);
});

test('transport reconnect restores opted-in active display exactly once without a new Hook', async t => {
  const h=harness();t.after(()=>h.runtime.stop());
  await h.connect();await h.clock.advance(7000);
  h.hook('PreToolUse');await h.clock.advance(4000);
  const launches=h.calls.filter(c=>c.op==='launch_buddy').length;
  h.children.at(-1).handlers.onClose();await h.clock.advance(2000);
  const child=h.children.at(-1);child.event({event:'authenticated'});
  await h.clock.advance(7000);
  assert.equal(h.calls.filter(c=>c.op==='launch_buddy').length,launches+1);
  assert.equal(h.states.at(-1).wake.reason,'activity_reconnect');
  assert.equal(h.display.display().active,true);
  child.event({event:'authenticated'});await h.clock.advance(60000);
  assert.equal(h.calls.filter(c=>c.op==='launch_buddy').length,launches+1);
});

test('reconnect does not reopen Buddy when idle, paused, disabled, or task ended during retry', async t => {
  for(const mode of ['idle','paused','disabled','ended']) {
    const h=harness({activityKeepAwake:mode!=='disabled'});t.after(()=>h.runtime.stop());
    await h.connect();await h.clock.advance(7000);
    if(mode!=='idle')h.hook('PreToolUse');
    await h.clock.advance(4000);
    if(mode==='paused')await h.runtime.dispatch({op:'pause',value:true});
    const launches=h.calls.filter(c=>c.op==='launch_buddy').length;
    h.children.at(-1).handlers.onClose();
    if(mode==='ended')h.hook('Interrupt');
    await h.clock.advance(2000);h.children.at(-1).event({event:'authenticated'});
    await h.clock.advance(60000);
    assert.equal(h.calls.filter(c=>c.op==='launch_buddy').length,launches,mode);
  }
});

test('cancelling after reconnect authentication discards an unsent recovery wake', async t => {
  const h=harness();t.after(()=>h.runtime.stop());
  await h.connect();await h.clock.advance(7000);
  h.hook('PreToolUse');await h.clock.advance(4000);
  const launches=h.calls.filter(c=>c.op==='launch_buddy').length;
  h.children.at(-1).handlers.onClose();await h.clock.advance(2000);
  h.children.at(-1).event({event:'authenticated'});
  h.hook('Interrupt');await h.clock.advance(60000);
  assert.equal(h.calls.filter(c=>c.op==='launch_buddy').length,launches);
});

test('hung sampling is bounded, never overlaps, and late samples cannot revive stopped work', async t => {
  let hung = false, resolveSample, calls = 0;
  const h = harness({sample: () => {
    calls++;
    return hung ? new Promise(resolve => {resolveSample=resolve;}) : Promise.resolve({cpu:42});
  }}); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(7000);
  h.hook('PreToolUse'); await h.clock.advance(4000);
  hung = true;
  // The sampler remains pending while delivery ticks continue.
  const advancing = h.clock.advance(2000);
  await Promise.resolve(); await Promise.resolve();
  await h.clock.advance(60000);
  const started = calls;
  assert.equal(h.display.display().active, true);
  assert.equal(h.snapshots().at(-1).cpu, -1);
  await h.clock.advance(60000);
  assert.equal(calls, started);
  h.hook('Interrupt'); await h.clock.advance(4000);
  assert.equal(h.display.display().active, false);
  await h.runtime.stop();
  const count=h.snapshots().length;
  resolveSample({cpu:99}); await advancing; await Promise.resolve();
  await h.clock.advance(60000);
  assert.equal(h.snapshots().length,count);
});

test('activity keep-awake defaults off and active tasks still use bounded event wakes', async t => {
  const h = harness({activityKeepAwake: false}); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(7000);
  assert.equal(h.states.at(-1).settings.activityKeepAwake, false);
  await h.runtime.dispatch({op: 'configure', settings: {wakeHoldMs: 5000}});
  h.hook('UserPromptSubmit'); await h.clock.advance(20000);
  assert.equal(h.states.at(-1).agent.activeSessions, 1);
  assert.equal(h.snapshots().at(-1).mode, 'thinking');
  assert.deepEqual(h.snapshots().at(-1).sessionCounts, {thinking: 1, working: 0, attention: 0});
  assert.equal(h.snapshots().at(-1).activityHoldMs, 0);
  assert.equal(h.display.display().active, false);
  assert.equal(h.display.display().remainingMs, 0);
  assert.equal(h.brightness.at(-1), false);
});

test('switching keep-awake on and off applies without ending the active task', async t => {
  const h = harness({activityKeepAwake: false}); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(7000);
  await h.runtime.dispatch({op: 'configure', settings: {wakeHoldMs: 5000}});
  h.hook('UserPromptSubmit'); await h.clock.advance(20000);
  const launches = h.calls.filter(c => c.op === 'launch_buddy').length;
  await h.runtime.dispatch({op: 'configure', settings: {activityKeepAwake: true}});
  await h.clock.advance(2000);
  assert.equal(h.display.display().active, true);
  assert.equal(h.snapshots().at(-1).activityHoldMs, 15000);
  await h.runtime.dispatch({op: 'configure', settings: {activityKeepAwake: false}});
  await h.clock.advance(2000);
  assert.equal(h.states.at(-1).agent.activeSessions, 1);
  assert.equal(h.display.display().active, false);
  assert.ok(h.display.display().remainingMs > 3000 && h.display.display().remainingMs <= 5000);
  await h.clock.advance(6000);
  assert.equal(h.display.display().remainingMs, 0);
  assert.equal(h.brightness.at(-1), false);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, launches + 1);
});

test('enabling task keep-awake wakes a sleeping Buddy immediately and only once', async t => {
  let awake = true;
  const h = runtimeHarness({onWrite(command, child) {
    if (command.op === 'launch_buddy') {
      awake = true;
      child.later({event: 'result', id: command.id, ok: true});
    }
    if (command.op === 'snapshot' && awake) {
      const p = command.payload;
      child.later(ack(p, {keepScreen: 'on', wakeDisplay: {id:p.wakeId, remainingMs:15000},
        capabilities: {activityHold:true,maxWakeHoldMs:1800000}}));
    }
  }}); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(7000);
  awake = false;
  h.hook('PreToolUse'); await h.clock.advance(12000);
  assert.equal(h.state.connection, 'standby');
  const launches = h.calls.filter(c => c.op === 'launch_buddy').length;
  await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:true}});
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, launches + 1);
  await h.clock.advance(4000);
  assert.equal(h.state.operation.kind, 'wake');
  assert.equal(h.state.operation.status, 'done');
  assert.equal(h.calls.filter(c => c.op === 'snapshot').at(-1).payload.activityHoldMs, 15000);
  await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:true}});
  await h.clock.advance(60000);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, launches + 1);
});

test('paused keep-awake changes wait for one resume wake, while idle enabling stays bounded', async t => {
  const h = harness({activityKeepAwake:false}); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(7000);
  await h.runtime.dispatch({op:'pause',value:true});
  h.hook('PreToolUse');
  const launches = h.calls.filter(c => c.op === 'launch_buddy').length;
  await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:true}});
  await h.clock.advance(20000);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, launches);
  await h.runtime.dispatch({op:'pause',value:false}); await h.clock.advance(4000);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, launches + 1);
  assert.equal(h.display.display().active, true);
  await h.runtime.dispatch({op:'pause',value:false}); await h.clock.advance(4000);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, launches + 1);
  await h.runtime.dispatch({op:'reset_activity'});
  await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:false,wakeHoldMs:5000}});
  await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:true}}); await h.clock.advance(10000);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, launches + 2);
  assert.equal(h.display.display().active, false);
  assert.equal(h.display.display().remainingMs, 0);
});

test('restoring disabled sync before startup connection never launches or sends snapshots', async t => {
  const h = harness({activityKeepAwake:false}); t.after(() => h.runtime.stop());
  await h.runtime.start();
  await h.runtime.dispatch({op:'pause',value:true});
  await h.runtime.dispatch({op:'connect',address:'fixture',key:'0'.repeat(32),settings:{activityKeepAwake:true}});
  h.children[0].event({event:'authenticated'});
  h.hook('PreToolUse'); await h.clock.advance(60000);
  assert.equal(h.states.at(-1).paused, true);
  assert.equal(h.calls.filter(c => ['launch_buddy','snapshot'].includes(c.op)).length, 0);
  await h.runtime.dispatch({op:'pause',value:false}); await h.clock.advance(5000);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, 1);
  assert.equal(h.display.display().active, true);
});

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

test('Mac compiles multi-AI status into display colors only after capability discovery',async t=>{
 const h=harness({ringSupported:true});t.after(()=>h.runtime.stop());
 await h.connect();await h.clock.advance(7000);
 assert.equal(h.snapshots()[0].activityRing,undefined);
 h.hook('PreToolUse','a');h.hook('UserPromptSubmit','b');await h.clock.advance(4000);
 let latest=h.snapshots().at(-1);
 assert.equal(latest.mode,'working');assert.deepEqual(latest.activityRing,['#728BFF','#65D9BC']);
 assert.equal(latest.sessionCounts,undefined,'new bands do not receive aggregation inputs');
 h.hook('PermissionRequest','b');await h.clock.advance(4000);
 latest=h.snapshots().at(-1);assert.equal(latest.mode,'attention');assert.deepEqual(latest.activityRing,['#FFBD64','#65D9BC']);
 await h.runtime.dispatch({op:'configure',settings:{buddyTheme:'claude',revision:1}});await h.clock.advance(4000);
 assert.deepEqual(h.snapshots().at(-1).activityRing,['#FFBD64','#79CFC3']);
 h.hook('Stop','a');await h.clock.advance(4000);assert.deepEqual(h.snapshots().at(-1).activityRing,['#FFBD64']);
 await h.runtime.dispatch({op:'reset_activity'});await h.clock.advance(4000);
 assert.equal(h.snapshots().at(-1).activityRing.length,1);
 await h.connect();await h.clock.advance(7000);
 const legacy=harness({ringSupported:false});t.after(()=>legacy.runtime.stop());await legacy.connect();await legacy.clock.advance(7000);
 legacy.hook('PreToolUse');await legacy.clock.advance(4000);
 assert.equal(legacy.snapshots().at(-1).activityRing,undefined);assert.deepEqual(legacy.snapshots().at(-1).sessionCounts,{thinking:0,working:1,attention:0});
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
