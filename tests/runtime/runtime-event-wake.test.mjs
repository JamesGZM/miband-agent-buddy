import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runtimeHarness, ack} from '../helpers/runtime.mjs';
import {sanitizeActivity} from '../../services/runtime/src/adapters/activity-contract.mjs';

const {createKeepScreen}=createRequire(import.meta.url)('../../apps/band/src/common/keep-screen.js');

async function setup({activityKeepAwake=true}={}) {
  let display,visible=true,responding=true,defer=false,hideOnSnapshot=false;
  const h=runtimeHarness({onWrite(command,child){
    if(command.op==='launch_buddy') {
      visible=true;
      if(!defer)child.later({event:'result',id:command.id,ok:true});
    }
    if(command.op==='ping'&&String(command.id).startsWith('link-ping-'))child.later({event:'result',id:command.id,ok:true});
    if(command.op!=='snapshot'||!responding)return;
    if(hideOnSnapshot){hideOnSnapshot=false;visible=false;display.hide();}
    const p=command.payload;
    if(visible&&p.wakeId)display.hold(p.wakeId,p.wakeHoldMs);
    if(visible&&p.activityHoldMs!=null)display.activity(p.activityHoldMs,p.idleHoldMs);
    child.later(ack(p,{keepScreen:display.snapshot().state,wakeDisplay:display.display(),
      pageLifecycle:{visible:visible?1:0,created:1,live:1},capabilities:{activityHold:true,activityRing:true,
        maxWakeHoldMs:1800000,maxActivityHoldMs:120000}}));
  }});
  display=createKeepScreen(options=>options.success(),h.clock.now,h.clock.schedule,h.clock.cancel,()=>{});
  await h.connect();await h.clock.advance(6000);
  if(activityKeepAwake){await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:true}});await h.clock.advance(6000);}
  return {...h,display,
    get state(){return h.states.at(-1);},
    launches:()=>h.calls.filter(c=>c.op==='launch_buddy'),
    snapshots:()=>h.calls.filter(c=>c.op==='snapshot'),
    event(event,session='a'){h.runtime.acceptHook({event,session:session.repeat(64),at:h.clock.now()});},
    hide(){visible=false;display.hide();},silence(){responding=false;},
    hideOnNextSnapshot(){hideOnSnapshot=true;},
    deferLaunch(){defer=true;},
  };
}

test('two simultaneous tasks update an already displayed Buddy without opening it again',async t=>{
  const h=await setup();t.after(()=>h.runtime.stop());
  const before=h.launches().length;
  h.event('UserPromptSubmit');await h.clock.advance(1);h.event('UserPromptSubmit','b');
  await h.clock.advance(16000);
  assert.equal(h.state.agent.activeSessions,2);
  assert.equal(h.snapshots().at(-1).payload.activityRing.length,2);
  assert.equal(h.launches().length,before);
  assert.equal(h.state.wake.status,'confirmed');
  assert.equal(h.state.diagnostics.launches,before);
  assert.ok(h.state.diagnostics.snapshotWakes>=1);
  assert.ok(h.snapshots().some(c=>c.payload.wakeId));
});

test('repeated starts coalesce display work without adding tasks or native opens',async t=>{
  const h=await setup();t.after(()=>h.runtime.stop());
  const before=h.launches().length,snapshots=h.snapshots().length;
  for(let i=0;i<100;i++){h.event('UserPromptSubmit');await h.clock.advance(1);}
  await h.clock.advance(16000);
  for(let i=0;i<4;i++){h.event('UserPromptSubmit');await h.clock.advance(11000);}
  assert.equal(h.state.agent.activeSessions,1);
  assert.equal(h.launches().length,before);
  assert.ok(h.snapshots().length-snapshots<40,'a Hook burst must not become one packet per event');
});

test('attention and one completed task update the visible aggregate without reopening',async t=>{
  const h=await setup();t.after(()=>h.runtime.stop());const before=h.launches().length;
  h.event('UserPromptSubmit');await h.clock.advance(1);h.event('PreToolUse','b');await h.clock.advance(16000);
  h.event('PermissionRequest');await h.clock.advance(12000);
  assert.equal(h.state.agent.state,'attention');
  h.event('Stop');await h.clock.advance(12000);
  assert.equal(h.state.agent.activeSessions,1);assert.equal(h.state.agent.state,'working');
  assert.equal(h.snapshots().at(-1).payload.activityRing.length,1);
  assert.equal(h.launches().length,before);
});

test('a legitimate later turn still opens a sleeping Buddy exactly once',async t=>{
  const h=await setup({activityKeepAwake:false});t.after(()=>h.runtime.stop());
  h.event('UserPromptSubmit');await h.clock.advance(16000);h.event('Stop');await h.clock.advance(40000);
  const before=h.launches().length;
  assert.equal(h.display.snapshot().state,'off');
  h.event('UserPromptSubmit');await h.clock.advance(12000);
  assert.equal(h.state.agent.activeSessions,1);assert.equal(h.launches().length,before+1);
});

test('hooks during a native launch share its flight instead of queueing another launch',async t=>{
  const h=await setup();t.after(()=>h.runtime.stop());h.hide();await h.clock.advance(12000);
  const before=h.launches().length;h.deferLaunch();h.event('UserPromptSubmit');await h.clock.advance(2000);
  const launch=h.launches().at(-1);
  for(let i=0;i<20;i++){h.event('UserPromptSubmit',i%2?'a':'b');await h.clock.advance(1);}
  h.children.at(-1).event({event:'result',id:launch.id,ok:true});
  await h.clock.advance(16000);
  assert.equal(h.launches().length,before+1);assert.equal(h.state.agent.activeSessions,2);
});

test('a foreground-to-hidden race falls back to one native open',async t=>{
  const h=await setup();t.after(()=>h.runtime.stop());const before=h.launches().length;
  h.event('UserPromptSubmit');h.hideOnNextSnapshot();await h.clock.advance(16000);
  assert.equal(h.launches().length,before+1);assert.equal(h.state.wake.status,'confirmed');
});

test('unresponsive foreground receipts cannot permanently suppress a real event wake',async t=>{
  const h=await setup({activityKeepAwake:false});t.after(()=>h.runtime.stop());
  h.silence();await h.clock.advance(12000);const before=h.launches().length;
  h.event('UserPromptSubmit');await h.clock.advance(16000);
  assert.equal(h.launches().length,before+1);
});

test('a generic run starting with working wakes a sleeping Buddy without waiting for completion',async t=>{
  const h=await setup({activityKeepAwake:false});t.after(()=>h.runtime.stop());
  h.hide();await h.clock.advance(40000);
  const before=h.launches().length;
  const send=value=>h.runtime.acceptActivity(sanitizeActivity({source:'fixture-client',session:'fixture-conversation',run:1,seq:1,state:'working',...value}));
  assert.equal(send({}).accepted,true);
  await h.clock.advance(2000);
  assert.equal(h.state.agent.state,'working');
  assert.equal(h.launches().length,before+1);
  assert.equal(h.state.wake.reason,'start');
  await h.clock.advance(4000);
  assert.equal(h.state.wake.status,'confirmed');
  for(let seq=2;seq<=8;seq++){
    h.hide();await h.clock.advance(12000);
    assert.equal(send({seq,state:seq%2?'working':'thinking'}).accepted,true);
    await h.clock.advance(2000);
    assert.equal(h.launches().length,before+1,'ordinary tool/resumption events must not relaunch');
  }
  assert.equal(send({seq:9,state:'cancelled'}).accepted,true);
  await h.clock.advance(12000);
  assert.equal(send({run:2,seq:1}).accepted,true);
  await h.clock.advance(2000);
  assert.equal(h.launches().length,before+2,'a later execution must wake again');
});
