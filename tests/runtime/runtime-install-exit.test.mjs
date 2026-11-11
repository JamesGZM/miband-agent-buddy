import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeHarness,ack} from '../helpers/runtime.mjs';
async function setup(answer=true){
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='launch_buddy')child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot' && (c.payload.command!=='exit'||answer))child.later(ack(c.payload,{exitReady:true,keepScreen:'on',wakeDisplay:{id:c.payload.wakeId,remainingMs:20000}}));
  }});
  await h.connect();await h.clock.advance(6000);assert.equal(h.state.connection,'connected');return h;
}
test('updating a live Buddy exits the old page before transfer, once per install',async t=>{
  const h=await setup();t.after(()=>h.runtime.stop());await h.runtime.dispatch({op:'install'});
  const exit=h.calls.at(-1);assert.equal(exit.payload.command,'exit');
  assert.equal(exit.payload.completion,undefined);assert.equal(h.state.connection,'installing');
  await h.clock.advance(599);assert.equal(h.calls.filter(c=>c.op==='install').length,0);
  await h.clock.advance(1);assert.equal(h.calls.filter(c=>c.op==='install').length,1);
  h.children[0].event(ack(exit.payload,{exitReady:true}));await h.clock.advance(2000);
  assert.equal(h.calls.filter(c=>c.op==='install').length,1);
});
test('missing exit receipt is bounded and cannot delay installation forever',async t=>{
  const h=await setup(false);t.after(()=>h.runtime.stop());await h.runtime.dispatch({op:'install'});
  await h.clock.advance(1999);assert.equal(h.calls.filter(c=>c.op==='install').length,0);
  await h.clock.advance(1);assert.equal(h.calls.filter(c=>c.op==='install').length,1);
});
for(const cancel of ['disconnect','close'])test(`abandoned pre-install exit is cancelled on ${cancel}`,async t=>{
  const h=await setup(false);t.after(()=>h.runtime.stop());await h.runtime.dispatch({op:'install'});
  const exit=h.calls.at(-1);
  if(cancel==='disconnect')await h.runtime.dispatch({op:'disconnect'});else h.children[0].kill();
  h.children[0].event(ack(exit.payload,{exitReady:true}));await h.clock.advance(3000);
  assert.equal(h.calls.filter(c=>c.op==='install').length,0);
});
