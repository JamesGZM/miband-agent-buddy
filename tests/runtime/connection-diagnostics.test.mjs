import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeHarness,ack} from '../helpers/runtime.mjs';

test('a reported native Bluetooth close is retained and reconnects instead of remaining in standby',async t=>{
  const h=runtimeHarness();t.after(()=>h.runtime.stop());await h.connect();
  h.children[0].event({event:'error',code:'bluetooth_link_closed',message:'synthetic link closure'});
  h.children[0].handlers.onClose({code:1});
  assert.equal(h.state.diagnostics.lastCode,'bluetooth_link_closed');
  assert.equal(h.state.connection,'retrying');
  await h.clock.advance(3000);
  assert.equal(h.children.length,2);
  assert.equal(h.state.connection,'connecting');
});

test('connection evidence distinguishes open/auth/ACK/link failure and retains fixed close metadata',async t=>{
  let respond=true;
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='launch_buddy')child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot'&&respond)child.later(ack(c.payload));
    if(c.op==='ping')child.later({event:'result',id:c.id,ok:true});
  }});t.after(()=>h.runtime.stop());
  await h.runtime.start();await h.runtime.dispatch({op:'connect',address:'fixture',key:'0'.repeat(32)});
  assert.equal(h.state.diagnostics.phase,'opening');
  const child=h.children[0];child.event({event:'transport'});
  assert.equal(h.state.diagnostics.phase,'authenticating');child.event({event:'authenticated'});
  await h.clock.advance(6000);assert.equal(h.state.diagnostics.phase,'connected');
  respond=false;await h.clock.advance(12000);
  assert.equal(h.state.diagnostics.phase,'buddy_unresponsive');assert.equal(h.state.diagnostics.ackTimeouts,1);
  child.event({event:'error',code:'event_lagged',message:'synthetic'});
  assert.equal(h.state.diagnostics.lastCode,'event_lagged');
  child.handlers.onClose({code:1,signal:'SIGSEGV'});
  assert.equal(h.state.diagnostics.closes,1);assert.equal(h.state.diagnostics.exitCode,1);assert.equal(h.state.diagnostics.signal,'SIGSEGV');
  const count=h.state.diagnostics.closes;
  await h.clock.advance(3000);child.handlers.onClose({code:1});
  assert.equal(h.state.diagnostics.closes,count);
});

test('unknown native error strings never enter diagnostic codes',async t=>{
  const h=runtimeHarness();t.after(()=>h.runtime.stop());await h.connect();
  h.children[0].event({event:'error',code:'synthetic-private-value',message:'synthetic'});
  assert.equal(h.state.diagnostics.lastCode,'operation_failed');
});
