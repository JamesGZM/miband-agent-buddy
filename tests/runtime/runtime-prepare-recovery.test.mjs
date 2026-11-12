import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeHarness,ack} from '../helpers/runtime.mjs';

test('initial wake and its first display receipt precede background device queries',async t=>{
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='launch_buddy')child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot')child.later(ack(c.payload,{keepScreen:'on',wakeDisplay:{id:c.payload.wakeId,remainingMs:15000}}));
  }});t.after(()=>h.runtime.stop());await h.connect();
  assert.ok(!h.calls.some(c=>c.op==='device_status'));
  await h.clock.advance(6000);
  assert.equal(h.state.wake.status,'confirmed');
  const ops=h.calls.map(c=>c.op);
  assert.ok(ops.indexOf('device_status')>ops.indexOf('snapshot'));
});

test('an early ACK without its display lease cannot release deferred background queries',async t=>{
  let replies=0;
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='launch_buddy')child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot'){
      const held=++replies>1;
      child.later(ack(c.payload,{keepScreen:held?'on':'off',wakeDisplay:{id:c.payload.wakeId,remainingMs:held?15000:0}}));
    }
  }});t.after(()=>h.runtime.stop());await h.connect();await h.clock.advance(4000);
  assert.equal(replies,1);assert.ok(!h.calls.some(c=>c.op==='device_status'));
  await h.clock.advance(2000);assert.equal(h.state.wake.status,'confirmed');
  assert.equal(h.calls.filter(c=>c.op==='device_status').length,1);
});

async function reconnectFailure({code='app_query_failed',recover=true,probe=true,inventory=true,deferRetry=false}={}) {
  let awake=true,launches=0;
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='launch_buddy') {
      launches++;
      const ok=h.children.length===1 || (recover && launches>2);
      if(ok)awake=true;
      if(!deferRetry||launches<=2)child.later({event:'result',id:c.id,ok,code:ok?null:code});
    }
    if(c.op==='ping' && c.id==='link-ping' && probe!==null)child.later({event:'result',id:c.id,ok:probe});
    if(c.op==='snapshot') {
      // A later inventory request succeeds, but cannot open the page itself.
      if(inventory)child.later({event:'buddy',installed:true,versionCode:32});
      if(awake)child.later(ack(c.payload,{keepScreen:'on',capabilities:{activityHold:true},
        pageLifecycle:{visible:1},wakeDisplay:{id:c.payload.wakeId,remainingMs:15000}}));
    }
  }});
  await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:true}});
  await h.connect();h.hook('UserPromptSubmit');await h.clock.advance(14000);
  assert.equal(h.state.connection,'connected');
  awake=false;h.children[0].event({event:'error',code:'bluetooth_link_closed',message:'fixture link closed'});
  h.children[0].kill();await h.clock.advance(2000);assert.equal(h.children.length,2);
  h.children.at(-1).event({event:'authenticated'});
  await h.clock.advance(4000);
  return {...h,get state(){return h.state;},launches:()=>launches};
}

for(const code of ['app_query_failed','app_sync_failed'])test(`active reconnect recovers ${code} without another Hook or a previous-generation ACK`,async t=>{
  const h=await reconnectFailure({code});t.after(()=>h.runtime.stop());
  await h.clock.advance(50000);
  assert.equal(h.state.connection,'connected');
  assert.equal(h.state.wake.reason,'activity_prepare_retry');
  assert.equal(h.state.wake.status,'confirmed');
});

test('persistent prelaunch failure has two retry attempts and cannot reopen periodically',async t=>{
  const h=await reconnectFailure({recover:false});t.after(()=>h.runtime.stop());
  await h.clock.advance(180000);
  assert.equal(h.launches(),4,'initial + reconnect + at most two preparation retries');
});

test('a missing preparation-retry result cannot authorize another possibly duplicate launch',async t=>{
  const h=await reconnectFailure({deferRetry:true});t.after(()=>h.runtime.stop());
  await h.clock.advance(180000);assert.equal(h.launches(),3);
});

for(const action of ['stop','pause','disable','reset','disconnect','install','manual'])test(`in-flight preparation retry ignores late launch results after ${action}`,async t=>{
  const h=await reconnectFailure({deferRetry:true});t.after(()=>h.runtime.stop());
  await h.clock.advance(18000);assert.equal(h.state.wake.reason,'activity_prepare_retry');
  assert.equal(h.state.wake.status,'sending');
  const child=h.children.at(-1),id=h.calls.filter(c=>c.op==='launch_buddy').at(-1).id;
  if(action==='stop')h.hook('Stop');
  else if(action==='disable')await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:false}});
  else if(action==='pause')await h.runtime.dispatch({op:'pause',value:true});
  else if(action==='reset')await h.runtime.dispatch({op:'reset_activity'});
  else if(action==='manual')await h.runtime.dispatch({op:'wake',request:'fixture-user'});
  else await h.runtime.dispatch({op:action});
  child.event({event:'result',id,ok:true});await h.clock.advance(4000);
  assert.ok(h.calls.filter(c=>c.op==='snapshot').every(c=>c.payload.wakeId!==id));
});

for(const options of [{probe:false},{probe:null},{inventory:false},{code:'app_launch_failed'},{code:'app_missing'}])test(`preparation retry requires a fresh inventory, successful probe and prelaunch failure: ${JSON.stringify(options)}`,async t=>{
  const h=await reconnectFailure({...options,recover:false});t.after(()=>h.runtime.stop());
  await h.clock.advance(options.probe===false||options.probe===null?12000:90000);
  assert.ok(h.states.every(s=>s.wake?.reason!=='activity_prepare_retry'));
});

for(const action of ['stop','pause','disable','reset','disconnect','install'])test(`preparation recovery cancels on ${action}`,async t=>{
  const h=await reconnectFailure({recover:false});t.after(()=>h.runtime.stop());const before=h.launches();
  if(action==='stop')h.hook('Stop');
  else if(action==='disable')await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:false}});
  else if(action==='pause')await h.runtime.dispatch({op:'pause',value:true});
  else if(action==='reset')await h.runtime.dispatch({op:'reset_activity'});
  else await h.runtime.dispatch({op:action});
  await h.clock.advance(90000);
  assert.ok(h.states.every(s=>s.wake?.reason!=='activity_prepare_retry'));
  if(action!=='stop')assert.equal(h.launches(),before);
});
