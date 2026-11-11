import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runtimeHarness, ack} from '../helpers/runtime.mjs';
const {createPageController}=createRequire(import.meta.url)('../../apps/band/src/controllers/page-controller.js');

// A band that sleeps until launched, then answers like Buddy 0.5.2.
function sleepingBand({launchOk = true, page = true, answer = true, capabilities = null, displayOn = true} = {}) {
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
      keepScreen: p.wakeId && displayOn ? 'on' : 'off', page: band.page,
      buddyTheme: band.theme, settingsRevision: band.revision, settingsApplied: true,
      wakeDisplay: {id: p.wakeId || null, remainingMs: p.wakeId && displayOn ? 20000 : 0, active: p.activityHoldMs > 0},
      ...(capabilities ? {capabilities} : {}),
      ...(p.powerSaving !== undefined ? {powerSaving: p.powerSaving} : {}),
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

test('missing Buddy and silent band settle once; background pause preserves an explicit operation', async t => {
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
  assert.equal(paused.state.operation.status, 'waking');
  await paused.runtime.dispatch({op: 'wake', request: 'op-7'});
  assert.equal(paused.state.operation.status, 'waking');
  await paused.clock.advance(30000);
  assert.equal(paused.state.operation.status, 'failed');
  assert.ok(['no_response', 'timeout'].includes(paused.state.operation.code));
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

const modernCapabilities = {maxWakeHoldMs:1800000, activityHold:true, powerSaving:true};
for (const paused of [false, true]) test(`all explicit Buddy settings wake from sleep while sync is ${paused ? 'off' : 'on'}`, async t => {
  const band = sleepingBand({capabilities: modernCapabilities});
  const h = await asleep(band); t.after(() => h.runtime.stop());
  if (paused) await h.runtime.dispatch({op:'pause',value:true});
  for (const [kind, settings] of [
    ['activity_keep_awake',{activityKeepAwake:true}], ['activity_keep_awake',{activityKeepAwake:false}],
    ['power_saving',{powerSaving:true}], ['power_saving',{powerSaving:false}], ['wake_hold',{wakeHoldMs:60000}],
  ]) {
    band.awake = false;
    const launches = band.launches.length;
    await h.runtime.dispatch({op:'configure',settings,request:'op-'+(launches+20)});
    assert.equal(band.launches.length,launches+1);
    assert.deepEqual([h.state.operation.kind,h.state.operation.status],[kind,'waking']);
    await h.clock.advance(6000);
    assert.equal(h.state.operation.status,'done');
    assert.equal(h.state.paused,paused);
    if (paused) {
      const sent = h.calls.filter(c=>c.op==='snapshot').length;
      await h.clock.advance(60000);
      assert.equal(h.calls.filter(c=>c.op==='snapshot').length,sent,'manual completion must not restart background samples');
      assert.equal(band.launches.length,launches+1);
    }
  }
});

test('configuration does not report success for a matching settings ACK without a display lease', async t => {
  const band = sleepingBand({displayOn:false});
  const h = await asleep(band); t.after(() => h.runtime.stop());
  await h.runtime.dispatch({op:'configure',settings:{buddyTheme:'claude',revision:4},request:'op-display'});
  await h.clock.advance(15000);
  assert.deepEqual([h.state.operation.status,h.state.operation.code],['failed','display_unconfirmed']);
});

for (const pausedAtStart of [true,false]) test(`an early ACK before page show retries the same wake within its original deadline, initially paused=${pausedAtStart}`, async t => {
  let page, channel, child;
  const wakeIds=[], requests=[];
  const h=runtimeHarness({onWrite(c,transport) {
    child=transport;
    if(c.op==='launch_buddy') child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot') {
      wakeIds.push(c.payload.wakeId);
      channel.onmessage({data:JSON.stringify(c.payload)});
    }
  }});
  channel={send({data}){child.later({event:'ack',ack:data});}};
  const controller=createPageController({
    storage:{get:args=>args.success(JSON.stringify({buddyTheme:'chatgpt',settingsRevision:0,keepScreen:false,powerSaving:false})),set:args=>args.success()},
    brightness:{setKeepScreenOn:args=>{requests.push(args.keepScreenOn);args.success();}},
    interconnect:{instance:()=>channel},application:{terminate(){}},
    now:h.clock.now,schedule:h.clock.schedule,cancel:h.clock.cancel,
  });
  page=Object.assign({},controller,controller.private);page.onInit();
  t.after(async()=>{page.onDestroy();await h.runtime.stop();});
  await h.runtime.dispatch({op:'pause',value:pausedAtStart});
  await h.connect();
  await h.runtime.dispatch({op:'wake',request:'op-foreground'});
  await h.clock.advance(2000);
  assert.equal(h.state.operation.status,'applying','a pre-show receipt is not a terminal display failure');
  assert.equal(h.state.ack.wakeDisplay.remainingMs,0);
  assert.deepEqual(requests,[],'the invisible page did not consume the wake ID');
  if(!pausedAtStart) await h.runtime.dispatch({op:'pause',value:true});
  page.onShow();
  await h.clock.advance(2000);
  assert.equal(h.state.operation.status,'done');
  assert.equal(h.state.wake.status,'confirmed');
  assert.deepEqual(wakeIds,[wakeIds[0],wakeIds[0]]);
  assert.deepEqual(requests,[true]);
  assert.equal(h.calls.filter(c=>c.op==='launch_buddy').length,1);
  assert.equal(h.state.paused,true);
});

test('unconfirmed display receipts expire at the original wake deadline and late ACKs cannot revive them', async t => {
  let lastPayload;
  const h=runtimeHarness({onWrite(c,child) {
    if(c.op==='launch_buddy') child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot') {lastPayload=c.payload;child.later(ack(c.payload,{keepScreen:'off',wakeDisplay:{id:null,remainingMs:0}}));}
  }});t.after(()=>h.runtime.stop());
  await h.runtime.dispatch({op:'pause',value:true});await h.connect();
  const started=h.clock.now();
  await h.runtime.dispatch({op:'wake',request:'op-expiry'});
  await h.clock.advance(14999);
  assert.equal(h.state.operation.status,'applying');
  await h.clock.advance(1);
  assert.deepEqual([h.state.operation.status,h.state.operation.code,h.state.operation.settledAt],['failed','display_unconfirmed',started+15000]);
  const failed=structuredClone(h.state.operation);
  h.children[0].event(ack(lastPayload,{keepScreen:'on',wakeDisplay:{id:lastPayload.wakeId,remainingMs:20000}}));
  await h.clock.advance(20000);
  assert.deepEqual(h.state.operation,failed);
  assert.equal(h.calls.filter(c=>c.op==='launch_buddy').length,1);
});

test('disconnect cancels an operation waiting for foreground and ignores its late display receipt', async t => {
  let lastPayload;
  const h=runtimeHarness({onWrite(c,child) {
    if(c.op==='launch_buddy') child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot') {lastPayload=c.payload;child.later(ack(c.payload,{keepScreen:'off',wakeDisplay:{id:null,remainingMs:0}}));}
  }});t.after(()=>h.runtime.stop());
  await h.runtime.dispatch({op:'pause',value:true});await h.connect();
  await h.runtime.dispatch({op:'wake',request:'op-cancel'});await h.clock.advance(2000);
  assert.equal(h.state.operation.status,'applying');
  const child=h.children[0];
  await h.runtime.dispatch({op:'disconnect'});
  const cancelled=structuredClone(h.state.operation);
  assert.deepEqual([cancelled.status,cancelled.code],['cancelled','disconnected']);
  child.event(ack(lastPayload,{keepScreen:'on',wakeDisplay:{id:lastPayload.wakeId,remainingMs:20000}}));
  await h.clock.advance(20000);
  assert.deepEqual(h.state.operation,cancelled);
  assert.equal(h.calls.filter(c=>c.op==='launch_buddy').length,1);
});

test('an explicit brightness error fails immediately without retrying the wake', async t => {
  const h=runtimeHarness({onWrite(c,child) {
    if(c.op==='launch_buddy') child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot') child.later(ack(c.payload,{keepScreen:'error',wakeDisplay:{id:c.payload.wakeId,remainingMs:20000}}));
  }});t.after(()=>h.runtime.stop());
  await h.runtime.dispatch({op:'pause',value:true});await h.connect();
  await h.runtime.dispatch({op:'wake',request:'op-brightness-error'});await h.clock.advance(2000);
  assert.deepEqual([h.state.operation.status,h.state.operation.code],['failed','display_unconfirmed']);
  await h.clock.advance(20000);
  assert.equal(h.calls.filter(c=>c.op==='snapshot').length,1);
  assert.equal(h.calls.filter(c=>c.op==='launch_buddy').length,1);
});

test('a manual setting waits for an outstanding link probe before sending its snapshot', async t => {
  const band = sleepingBand();
  const h = runtimeHarness({onWrite(c,child) { if (c.op !== 'ping') band.onWrite(c,child); }});
  t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(5000); band.awake=false;
  for (let i=0;i<60&&!h.calls.some(c=>c.op==='ping');i++) await h.clock.advance(1000);
  assert.ok(h.calls.some(c=>c.op==='ping'));
  const launches=band.launches.length;
  const old=h.calls.filter(c=>c.op==='snapshot').at(-1).payload;
  await h.runtime.dispatch({op:'configure',settings:{wakeHoldMs:60000},request:'op-probe'});
  assert.equal(band.launches.length,launches);
  h.children[0].event(ack(old));
  const snapshots=h.calls.filter(c=>c.op==='snapshot').length;
  await h.clock.advance(2000);
  assert.equal(h.calls.filter(c=>c.op==='snapshot').length,snapshots,'settings must not precede launch acceptance');
  h.children[0].event({event:'result',id:'link-ping',ok:true});
  await h.clock.advance(6000);
  assert.equal(band.launches.length,launches+1);
  assert.equal(h.state.operation.status,'done');
});

test('unsupported band settings remain saved but report an unsupported operation after wake', async t => {
  const band = sleepingBand(); const h = await asleep(band); t.after(() => h.runtime.stop());
  for (const settings of [{powerSaving:true},{activityKeepAwake:true}]) {
    await h.runtime.dispatch({op:'configure',settings,request:'op-legacy'});
    await h.clock.advance(6000);
    assert.deepEqual([h.state.operation.status,h.state.operation.code],['failed','unsupported']);
    for (const [key,value] of Object.entries(settings)) assert.equal(h.state.settings[key],value);
  }
});

test('resetting activities while paused wakes once, clears tasks and remains paused', async t => {
  const band = sleepingBand({capabilities:modernCapabilities}); const h = await asleep(band); t.after(() => h.runtime.stop());
  h.hook('UserPromptSubmit');
  await h.runtime.dispatch({op:'pause',value:true});
  const launches = band.launches.length;
  await h.runtime.dispatch({op:'reset_activity',request:'op-reset'});
  await h.clock.advance(6000);
  assert.equal(h.state.agent.activeSessions,0);
  assert.deepEqual([h.state.operation.kind,h.state.operation.status],['reset_activity','done']);
  assert.equal(band.launches.length,launches+1);
  assert.equal(h.state.paused,true);
  assert.ok(h.calls.filter(c=>c.op==='snapshot').at(-1).payload.activityHoldMs===0);
});

for (const kind of ['wake', 'install']) test(`paused first ${kind} waits for discovered power-saving support and durable application`, async t => {
  const snapshots=[];
  let savedPower=false, pendingReceipt=null;
  const h=runtimeHarness({onWrite(c,child) {
    if (c.op==='launch_buddy') child.later({event:'result',id:c.id,ok:true});
    if (c.op!=='snapshot') return;
    const p=c.payload; snapshots.push(p);
    const response={keepScreen:'on',wakeDisplay:{id:p.wakeId,remainingMs:20000},
      capabilities:{powerSaving:true},powerSaving:savedPower,settingsApplied:true};
    if (p.powerSaving===undefined) child.later(ack(p,response));
    else pendingReceipt=()=>{
      savedPower=p.powerSaving;
      child.event(ack(p,{...response,powerSaving:savedPower}));
    };
  }});
  t.after(()=>h.runtime.stop());
  await h.runtime.dispatch({op:'pause',value:true});
  await h.runtime.dispatch({op:'configure',settings:{powerSaving:true}});
  await h.connect();
  if (kind==='install') {
    await h.runtime.dispatch({op:'install'});
    h.children[0].event({event:'result',id:'install',ok:true});
  } else await h.runtime.dispatch({op:'wake',request:'op-first-wake'});
  await h.clock.advance(2000);
  assert.equal(snapshots.length,1);
  assert.equal(snapshots[0].powerSaving,undefined);
  assert.equal(h.state.operation.wakeConfirmed,true);
  assert.equal(h.state.operation.status,'applying','capability discovery must not finish a paused transaction');
  await h.clock.advance(2000);
  assert.equal(snapshots.length,2);
  assert.equal(snapshots[1].powerSaving,true);
  assert.equal(savedPower,false);
  assert.equal(h.state.operation.status,'applying','sending a setting does not establish durable application');
  pendingReceipt();
  assert.equal(savedPower,true);
  assert.equal(h.state.operation.status,'done');
  assert.equal(h.state.paused,true);
  await h.clock.advance(60000);
  assert.equal(snapshots.length,2,'completed manual operation must not restart background synchronization');
  assert.equal(h.calls.filter(c=>c.op==='launch_buddy').length,1);
});
