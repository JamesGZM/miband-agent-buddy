import test from 'node:test';
import assert from 'node:assert/strict';
import {createBatteryAlert} from '../../services/runtime/src/core/battery-alert.mjs';
import {runtimeHarness} from '../helpers/runtime.mjs';

test('strict low threshold, deduplication, recovery and malformed samples',()=>{
  const a=createBatteryAlert();
  for(const n of [null,undefined,NaN,-1,101,19.5,20,80])a.observe(n);
  assert.deepEqual(a.snapshot(),{active:false,sequence:0});
  for(const n of [19,19,10,0])a.observe(n);
  assert.deepEqual(a.snapshot(),{active:true,sequence:1});
  a.observe(null);assert.equal(a.snapshot().active,true);
  a.observe(20);assert.equal(a.snapshot().active,false);
  a.observe(19);assert.equal(a.snapshot().sequence,2);
  a.reset();a.observe(10);assert.equal(a.snapshot().sequence,3);
});
test('battery events update charging before device info, poll while paused and retain low cycle on reconnect',async t=>{
  const h=runtimeHarness();t.after(()=>h.runtime.stop());await h.connect();
  let child=h.children.at(-1);
  child.event({event:'battery',percent:19,charging:true});
  assert.equal(h.state.device.charging,true);assert.equal(h.state.lowBattery.sequence,1);
  await h.runtime.dispatch({op:'pause',value:true});
  await h.clock.advance(62000);
  assert.ok(h.calls.some(c=>c.op==='ping'&&c.id==='battery-poll'));
  child.event({event:'battery',percent:18,charging:false});
  assert.equal(h.state.device.charging,false);assert.equal(h.state.lowBattery.sequence,1);
  await h.runtime.dispatch({op:'connect',address:'fixture',key:'0'.repeat(32)});
  child=h.children.at(-1);child.event({event:'authenticated'});child.event({event:'device',battery:18,charging:false});
  assert.equal(h.state.lowBattery.sequence,1);
});

test('charging fallback is queried within a few seconds while activity synchronization is paused',async t=>{
  const h=runtimeHarness();t.after(()=>h.runtime.stop());await h.connect();await h.runtime.dispatch({op:'pause',value:true});
  await h.clock.advance(6000);assert.equal(h.calls.filter(c=>c.id==='battery-poll').length,1);
});
