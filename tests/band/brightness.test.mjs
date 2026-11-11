import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createBrightness}=createRequire(import.meta.url)('../../apps/band/src/common/brightness.js');
function setup(initialMode=0){
  const reads=[],writes=[],remembered=[],modeWrites=[],timers=new Set();let mode=initialMode;
  const controller=createBrightness({getMode:c=>c.success({mode}),setMode:c=>{modeWrites.push(c.mode);mode=c.mode;c.success();},getValue:c=>reads.push(c),setValue:c=>writes.push(c)},v=>remembered.push(v),fn=>{timers.add(fn);return fn;},fn=>timers.delete(fn));
  return {controller,reads,writes,remembered,timers,modeWrites,externalMode:value=>{mode=value;},read:v=>reads.at(-1).success({value:v}),finish:v=>{writes.at(-1).success();reads.at(-1).success({value:v});}};
}
test('zero baseline remains unknown and does not get saved or force a brightness write',()=>{
  const h=setup();h.controller.show(true);assert.equal(h.reads.length,0);
  h.controller.configure(null,false);h.read(0);
  assert.deepEqual(h.remembered,[]);assert.equal(h.writes.length,0);
  assert.equal(h.controller.snapshot().status,'unchanged');assert.equal(h.controller.snapshot().value,null);
});
test('forces manual mode before saving brightness, verifies readback and restores selection',()=>{
  const h=setup(1);h.controller.configure(200,false,false);h.controller.show(true);h.read(0);
  assert.deepEqual(h.modeWrites,[0]);assert.equal(h.writes[0].value,200);
  h.writes[0].success();assert.equal(h.controller.snapshot().status,'pending');h.read(200);
  assert.equal(h.controller.snapshot().value,200);
  h.controller.configure(200,true,false);assert.equal(h.writes.at(-1).value,25);h.finish(25);
  for(let i=0;i<100;i++)h.controller.configure(200,true,false);assert.equal(h.writes.length,2);
  h.controller.configure(200,false,false);assert.equal(h.writes.at(-1).value,200);h.finish(200);
  assert.equal(h.controller.snapshot().value,200);assert.equal(h.controller.snapshot().status,'applied');
});
test('success callbacks with mismatched native readback must fail',()=>{
  const h=setup();h.controller.configure(128,false);h.controller.show(true);h.read(0);h.finish(0);
  assert.equal(h.controller.snapshot().status,'error');assert.equal(h.controller.snapshot().reason,'readback_mismatch');
  assert.equal(h.controller.snapshot().value,null);assert.equal(h.controller.snapshot().observed,0);
});
test('late reads and writes cannot affect a hidden/destroyed page, and queued changes coalesce',()=>{
  const h=setup();h.controller.configure(null,false);h.controller.show(true);
  h.controller.configure(255,false);h.read(80);assert.deepEqual(h.remembered,[]);
  h.controller.configure(200,false,false);h.finish(255);assert.equal(h.writes.at(-1).value,200);
  h.controller.show(false);h.writes.at(-1).success();assert.equal(h.controller.snapshot().value,null);
  assert.equal(h.timers.size,0);h.controller.close();
});
test('mode failure and bounded native timeouts are explicit',()=>{
  const h=setup();h.controller.configure(128,false);h.controller.show(true);h.read(0);
  [...h.timers][0]();assert.equal(h.controller.snapshot().reason,'setValue_timeout');
  h.writes[0].success();assert.equal(h.controller.snapshot().status,'error');
});

test('an always-zero getter cannot falsely confirm zero, while a working getter can',()=>{
  const broken=setup();broken.controller.configure(0,false);broken.controller.show(true);broken.read(0);broken.finish(0);
  assert.equal(broken.controller.snapshot().reason,'unverified_zero');
  const working=setup();working.controller.configure(0,false);working.controller.show(true);working.read(90);working.finish(0);
  assert.equal(working.controller.snapshot().value,0);assert.equal(working.controller.snapshot().status,'applied');
});

test('auto mode skips manual values; disabling reads the native manual value; power restores auto',()=>{
  const h=setup(1);h.controller.configure(null,false);h.controller.show(true);h.read(0);
  assert.equal(h.controller.snapshot().mode,1);assert.equal(h.writes.length,0);
  h.controller.configure(null,false,false);h.read(100);
  assert.deepEqual(h.remembered,[100]);assert.equal(h.controller.snapshot().mode,0);
  h.controller.configure(100,false,true);assert.equal(h.controller.snapshot().mode,1);assert.equal(h.writes.length,0);
  h.controller.configure(100,true,true);assert.equal(h.controller.snapshot().mode,0);assert.equal(h.writes.at(-1).value,25);h.finish(25);
  const before=h.writes.length;h.controller.configure(100,false,true);assert.equal(h.controller.snapshot().mode,1);assert.equal(h.writes.length,before);
  h.controller.configure(100,false,false);assert.equal(h.writes.at(-1).value,100);h.finish(100);
});

test('power saving first discovers the hidden manual value before overriding auto mode',()=>{
  const h=setup(1);h.controller.configure(null,false);h.controller.show(true);h.read(0);
  h.controller.configure(null,true,true);assert.equal(h.writes.length,0);
  h.read(100);assert.deepEqual(h.remembered,[100]);assert.equal(h.writes.at(-1).value,25);h.finish(25);
  h.controller.configure(100,false,true);assert.equal(h.controller.snapshot().mode,1);
  h.controller.configure(100,false,false);assert.equal(h.writes.at(-1).value,100);
});

test('returning to Buddy rereads mode and reapplies the saved auto choice after an external change',()=>{
  const h=setup(1);h.controller.configure(100,false,true);h.controller.show(true);h.read(0);
  h.controller.show(false);h.externalMode(0);h.controller.show(true);
  assert.deepEqual(h.modeWrites,[1]);assert.equal(h.controller.snapshot().mode,1);
  assert.equal(h.writes.length,0);
});
