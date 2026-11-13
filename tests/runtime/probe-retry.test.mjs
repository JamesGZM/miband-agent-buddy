import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeHarness,ack} from '../helpers/runtime.mjs';

test('one missed ACK during an opted-in task recovers before the band activity watchdog expires',async t=>{
  let drop=false;
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='launch_buddy')child.later({event:'result',id:c.id,ok:true});
    if(c.op==='ping')child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot'){
      if(drop){drop=false;return;}
      child.later(ack(c.payload,{capabilities:{activityHold:true},keepScreen:'on',wakeDisplay:{id:c.payload.wakeId,remainingMs:20000}}));
    }
  }});t.after(()=>h.runtime.stop());
  await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:true}});
  await h.connect();h.hook('UserPromptSubmit');await h.clock.advance(6000);
  const before=h.state.lastAckAt,launches=h.calls.filter(c=>c.op==='launch_buddy').length;
  drop=true;await h.clock.advance(14000);
  assert.equal(h.state.connection,'connected');
  const resumed=h.states.find(s=>s.lastAckAt>before);
  assert.ok(resumed&&resumed.lastAckAt-before<15000,'do not spend the activity lease in the idle probe backoff');
  assert.equal(h.calls.filter(c=>c.op==='launch_buddy').length,launches,'retry delivery without periodically reopening Buddy');
});
async function setup({transient=false}={}){
  let awake=true,pings=0;
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='launch_buddy')child.later({event:'result',id:c.id,ok:true});
    if(c.op==='ping'&&String(c.id).startsWith('link-ping-')){pings++;if(transient){awake=true;child.later({event:'result',id:c.id,ok:false});}}
    if(c.op==='snapshot'&&awake)child.later(ack(c.payload,{keepScreen:'on',wakeDisplay:{id:c.payload.wakeId,remainingMs:20000}}));
  }});
  await h.connect();await h.clock.advance(6000);awake=false;
  for(let i=0;i<30&&pings===0;i++)await h.clock.advance(2000);
  assert.equal(pings,1);return {...h,get state(){return h.state;},pings:()=>pings};
}
test('one failed status probe does not tear down a transport that resumes Buddy ACKs',async t=>{
  const h=await setup({transient:true});t.after(()=>h.runtime.stop());await h.clock.advance(10000);
  assert.equal(h.children[0].killed,0);assert.equal(h.state.connection,'connected');
});
test('a Buddy ACK cancels an outstanding probe and ignores its late failure',async t=>{
  const h=await setup();t.after(()=>h.runtime.stop());await h.clock.advance(2000);
  const latest=h.calls.filter(c=>c.op==='snapshot').at(-1).payload;
  h.children[0].event(ack(latest));h.children[0].event({event:'result',id:h.calls.filter(c=>String(c.id).startsWith('link-ping-')).at(-1).id,ok:false});
  assert.equal(h.state.connection,'connected');assert.equal(h.children[0].killed,0);
});
for(const timeout of [false,true])test(`consecutive ${timeout?'timed-out':'rejected'} probes still trigger bounded recovery`,async t=>{
  const h=await setup();t.after(()=>h.runtime.stop());
  if(timeout)await h.clock.advance(8000);else h.children[0].event({event:'result',id:h.calls.filter(c=>String(c.id).startsWith('link-ping-')).at(-1).id,ok:false});
  assert.equal(h.children[0].killed,0);
  for(let i=0;i<30&&h.pings()<2;i++)await h.clock.advance(1000);
  assert.equal(h.pings(),2);
  if(timeout)await h.clock.advance(8000);else h.children[0].event({event:'result',id:h.calls.filter(c=>String(c.id).startsWith('link-ping-')).at(-1).id,ok:false});
  assert.equal(h.children[0].killed,1);
});
