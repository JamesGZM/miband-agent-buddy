import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createBrightness}=createRequire(import.meta.url)('../../apps/band/src/common/brightness.js');
function setup(){
  const reads=[],writes=[],remembered=[],timers=new Set();
  const controller=createBrightness({getValue:a=>reads.push(a),setValue:a=>writes.push(a)},v=>remembered.push(v),fn=>{timers.add(fn);return fn;},fn=>timers.delete(fn));
  return {controller,reads,writes,remembered,timers};
}
test('reads existing brightness, uses exactly 25 in saving mode and restores zero',()=>{
  const h=setup();h.controller.configure(null,false);h.controller.show(true);
  h.reads[0].success({value:0});assert.deepEqual(h.remembered,[0]);assert.equal(h.writes.length,0);
  h.controller.configure(0,true);assert.equal(h.writes[0].value,25);h.writes[0].success();
  for(let i=0;i<100;i++)h.controller.configure(0,true);
  assert.equal(h.writes.length,1);
  h.controller.configure(0,false);assert.equal(h.writes[1].value,0);h.writes[1].success();
  assert.deepEqual(h.controller.snapshot(),{value:0,target:0,status:'applied'});
});
test('coalesces settings and ignores abandoned native callbacks',()=>{
  const h=setup();h.controller.configure(100,false);h.controller.show(true);
  h.controller.configure(200,false);h.controller.configure(255,false);
  assert.equal(h.writes.length,1);h.writes[0].success();
  assert.equal(h.writes[1].value,255);h.controller.show(false);h.writes[1].success();
  assert.equal(h.controller.snapshot().value,null);assert.equal(h.timers.size,0);
  h.controller.show(true);h.controller.close();h.writes.at(-1).success();assert.equal(h.timers.size,0);
});
test('native error or timeout is reported and retried on next configuration',()=>{
  const h=setup();h.controller.configure(128,false);h.controller.show(true);h.writes[0].fail();
  assert.equal(h.controller.snapshot().status,'error');h.controller.configure(128,false);
  [...h.timers][0]();h.writes[1].success();assert.equal(h.controller.snapshot().status,'error');
  h.controller.configure(128,false);h.writes[2].success();assert.equal(h.controller.snapshot().status,'applied');
});

test('waits for saved settings and an in-flight read cannot overwrite a newer selection',()=>{
  const h=setup();h.controller.show(true);assert.equal(h.reads.length,0);
  h.controller.configure(null,false);assert.equal(h.reads.length,1);
  h.controller.configure(200,false);h.reads[0].success({value:80});
  assert.deepEqual(h.remembered,[]);assert.equal(h.writes[0].value,200);
  h.writes[0].success();assert.equal(h.controller.snapshot().value,200);
});
