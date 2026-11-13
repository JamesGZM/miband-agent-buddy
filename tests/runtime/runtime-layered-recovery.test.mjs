import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeHarness,ack} from '../helpers/runtime.mjs';
import {channelEvidence} from '../../services/runtime/src/core/buddy-state.mjs';

test('missing app ACK probes without tearing down a healthy transport, retaining first cause',async t=>{
  let reply=true;
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='launch_buddy')child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot'&&reply)child.later(ack(c.payload));
    if(c.op==='ping')child.later({event:'result',id:c.id,ok:true});
  }});t.after(()=>h.runtime.stop());
  await h.connect();await h.clock.advance(4000);reply=false;
  await h.clock.advance(12000);
  assert.equal(h.children[0].killed,0);assert.equal(h.children.length,1);
  assert.ok(h.calls.some(c=>String(c.id).startsWith('link-ping-')));
  const first=structuredClone(h.state.diagnostics.firstAnomaly);
  assert.equal(first.code,'ack_timeout');assert.equal(first.layer,'application');
  reply=true;await h.clock.advance(60000);
  assert.equal(h.state.connection,'connected');assert.deepEqual(h.state.diagnostics.firstAnomaly,first);
});
test('native SPP close keeps first error and original exit evidence across worker reconnect',async t=>{
  const h=runtimeHarness();t.after(()=>h.runtime.stop());await h.connect();
  h.children[0].event({event:'error',code:'bluetooth_link_closed',message:'fixed error'});
  h.children[0].handlers.onClose({code:1,signal:null});
  const first=structuredClone(h.state.diagnostics.firstAnomaly);
  assert.equal(first.code,'bluetooth_link_closed');assert.equal(first.layer,'link');assert.equal(first.exitCode,1);
  await h.clock.advance(2000);h.children[1].event({event:'authenticated'});
  await h.clock.advance(20000);
  assert.deepEqual(h.state.diagnostics.firstAnomaly,first);
  h.children[0].event({event:'error',code:'auth_rejected',message:'stale'});
  assert.deepEqual(h.state.diagnostics.firstAnomaly,first);
  await h.runtime.dispatch({op:'connect',address:'fixture',key:'0'.repeat(32)});
  assert.equal(h.state.diagnostics.firstAnomaly,null);
});
test('channel lifecycle is capability gated and sanitizes first channel error',async t=>{
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='launch_buddy')child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot')child.later(ack(c.payload,{capabilities:{channelLifecycle:true},channelLifecycle:{state:'open',firstReason:'closed',firstCode:1006,firstAt:100,private:'synthetic-private-value'}}));
  }});t.after(()=>h.runtime.stop());await h.connect();await h.clock.advance(4000);
  assert.equal(h.state.diagnostics.firstAnomaly.code,'channel_closed');
  assert.equal(h.state.diagnostics.firstAnomaly.bandCode,1006);
  assert.ok(!JSON.stringify(h.state.diagnostics).includes('synthetic-private-value'));
});

for(const probe of [false,null])test(`two failed device probes rebuild the worker (${probe===null?'timeout':'negative reply'})`,async t=>{
  let reply=true;
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='snapshot'&&reply)child.later(ack(c.payload,{keepScreen:'on',wakeDisplay:{id:c.payload.wakeId,remainingMs:20000}}));
    if(c.op==='ping'&&String(c.id).startsWith('link-ping-')&&probe!==null)child.later({event:'result',id:c.id,ok:probe});
    if(c.op==='launch_buddy')child.later({event:'result',id:c.id,ok:true});
  }});t.after(()=>h.runtime.stop());await h.connect();await h.clock.advance(20000);reply=false;
  await h.clock.advance(11000);assert.equal(h.children[0].killed,0,'one missing receipt/probe must not restart SPP');
  await h.clock.advance(30000);assert.equal(h.children[0].killed,1);
  assert.equal(h.state.diagnostics.firstAnomaly.code,'ack_timeout');
  assert.ok(h.states.some(s=>s.diagnostics.recoveryLayer==='transport'));
});
test('legacy ACKs and malformed channel fields cannot inject diagnostic strings',()=>{
  assert.equal(channelEvidence({channelLifecycle:{firstReason:'closed'}}),null);
  assert.deepEqual(channelEvidence({capabilities:{channelLifecycle:true},channelLifecycle:{firstReason:'private',firstCode:-1,firstAt:Infinity,closes:1,unexpected:'private'}}),{closes:1});
});
test('a timed-out probe result cannot satisfy or fail a later probe in the same worker',async t=>{
  let reply=true;
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='launch_buddy')child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot'&&reply)child.later(ack(c.payload));
  }});t.after(()=>h.runtime.stop());await h.connect();await h.clock.advance(6000);reply=false;
  const probes=()=>h.calls.filter(c=>String(c.id).startsWith('link-ping-'));
  for(let i=0;i<60&&probes().length<2;i++)await h.clock.advance(1000);
  assert.equal(probes().length,2);assert.notEqual(probes()[0].id,probes()[1].id);
  h.children[0].event({event:'result',id:probes()[0].id,ok:false});
  assert.equal(h.children[0].killed,0);
  h.children[0].event({event:'result',id:probes()[1].id,ok:false});
  assert.equal(h.children[0].killed,1);
});
