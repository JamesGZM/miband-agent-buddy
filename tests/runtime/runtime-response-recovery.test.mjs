import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeHarness,ack} from '../helpers/runtime.mjs';

async function setup({keep=true,active=true,visible=1,probe=true,recover=true,deferLaunch=false,timings}={}){
  let responding=true,launches=0;
  const h=runtimeHarness({timings,onWrite(c,child){
    if(c.op==='launch_buddy'){
      launches++;if(recover&&launches>1)responding=true;
      if(!deferLaunch||launches===1)child.later({event:'result',id:c.id,ok:true});
    }
    if(c.op==='ping'&&c.id==='link-ping'&&probe!==null)child.later({event:'result',id:c.id,ok:probe});
    if(c.op==='snapshot'&&responding)child.later(ack(c.payload,{
      keepScreen:'on',wakeDisplay:{id:c.payload.wakeId,remainingMs:20000},
      capabilities:{activityHold:true},pageLifecycle:{visible},
    }));
  }});
  await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:keep}});
  await h.connect();if(active)h.hook('UserPromptSubmit');await h.clock.advance(20000);
  return {...h,get state(){return h.state;},silence(){responding=false;},resume(){responding=true;},launches:()=>launches};
}

test('a healthy link but unresponsive foreground Buddy gets one confirmed task recovery wake',async t=>{
  const h=await setup();t.after(()=>h.runtime.stop());const before=h.launches();h.silence();
  await h.clock.advance(20000);
  assert.equal(h.launches(),before+1);
  assert.equal(h.state.wake.reason,'activity_unresponsive');
  assert.equal(h.state.wake.status,'confirmed');
  assert.equal(h.state.connection,'connected');
});

test('continued missing ACKs do not periodically relaunch, and a healthy receipt rearms a later outage',async t=>{
  const h=await setup({recover:false});t.after(()=>h.runtime.stop());const before=h.launches();h.silence();
  await h.clock.advance(120000);assert.equal(h.launches(),before+1);
  h.resume();await h.clock.advance(14000);assert.equal(h.state.connection,'connected');
  h.silence();await h.clock.advance(20000);assert.equal(h.launches(),before+2);
});

for(const variant of ['disabled','idle','hidden','failed_probe','missing_probe','paused'])test(`response recovery stays quiet for ${variant}`,async t=>{
  const h=await setup({keep:variant!=='disabled',active:variant!=='idle',visible:variant==='hidden'?0:1,
    probe:variant==='failed_probe'?false:variant==='missing_probe'?null:true});
  t.after(()=>h.runtime.stop());const before=h.launches();h.silence();
  if(variant==='paused')await h.runtime.dispatch({op:'pause',value:true});
  await h.clock.advance(90000);
  assert.equal(h.launches(),before);
  assert.ok(h.states.every(s=>s.wake?.reason!=='activity_unresponsive'));
});

test('a normal ACK cancels recovery queued behind the launch cooldown',async t=>{
  const h=await setup({timings:{cooldown:60000},recover:false});t.after(()=>h.runtime.stop());
  const before=h.launches();h.silence();await h.clock.advance(18000);assert.equal(h.launches(),before);
  h.resume();await h.clock.advance(14000);assert.equal(h.state.connection,'connected');
  await h.clock.advance(90000);assert.equal(h.launches(),before);
});

for(const action of ['stop','disable','disconnect','manual','reset','install'])test(`queued response recovery yields to ${action}`,async t=>{
  const h=await setup({timings:{cooldown:60000}});t.after(()=>h.runtime.stop());h.silence();await h.clock.advance(18000);
  if(action==='stop')h.hook('Stop');
  if(action==='disable')await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:false}});
  if(action==='disconnect')await h.runtime.dispatch({op:'disconnect'});
  if(action==='manual')await h.runtime.dispatch({op:'wake',request:'fixture-manual'});
  if(action==='reset')await h.runtime.dispatch({op:'reset_activity'});
  if(action==='install')await h.runtime.dispatch({op:'install'});
  await h.clock.advance(90000);
  assert.ok(h.states.every(s=>s.wake?.reason!=='activity_unresponsive'));
  if(action==='manual')assert.equal(h.state.operation.status,'done');
});

test('disconnect cancels the settling timer and ignores a late probe from the old transport',async t=>{
  const h=await setup({probe:null});t.after(()=>h.runtime.stop());h.silence();await h.clock.advance(12000);
  const child=h.children[0],before=h.launches();
  child.event({event:'result',id:'link-ping',ok:true});
  await h.runtime.dispatch({op:'disconnect'});
  child.event({event:'result',id:'link-ping',ok:true});
  await h.clock.advance(10000);assert.equal(h.launches(),before);
  assert.ok(h.states.every(s=>s.wake?.reason!=='activity_unresponsive'));
});

for(const action of ['stop','disable','pause','reset'])test(`an in-flight recovery ignores a late launch result after ${action}`,async t=>{
  const h=await setup({deferLaunch:true});t.after(()=>h.runtime.stop());h.silence();await h.clock.advance(18000);
  assert.equal(h.state.wake.reason,'activity_unresponsive');assert.equal(h.state.wake.status,'sending');
  const id=h.calls.filter(c=>c.op==='launch_buddy').at(-1).id;
  if(action==='stop')h.hook('Stop');
  if(action==='disable')await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:false}});
  if(action==='pause')await h.runtime.dispatch({op:'pause',value:true});
  if(action==='reset')await h.runtime.dispatch({op:'reset_activity'});
  h.children[0].event({event:'result',id,ok:true});await h.clock.advance(4000);
  assert.ok(h.calls.filter(c=>c.op==='snapshot').every(c=>c.payload.wakeId!==id),'abandoned recovery must not create a lease');
});
