import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runtimeHarness} from '../helpers/runtime.mjs';
const {createPageController}=createRequire(import.meta.url)('../../apps/band/src/controllers/page-controller.js');

test('brightness operation requires durable settings plus native success; power saving restores saved value after reload',async t=>{
  const saved=new Map(),writes=[];let page,child,native=170;
  const channel={send:c=>child.later({event:'ack',ack:c.data})};
  const h=runtimeHarness({onWrite(c,target){
    child=target;
    if(c.op==='launch_buddy'){page.onShow();child.later({event:'result',id:c.id,ok:true});}
    if(c.op==='snapshot')channel.onmessage({data:JSON.stringify(c.payload)});
  }});
  function mount(){
    const c=createPageController({now:h.clock.now,schedule:h.clock.schedule,cancel:h.clock.cancel,
      brightness:{setKeepScreenOn:c=>c.success(),getValue:c=>c.success({value:native}),setValue:c=>writes.push(c)},
      storage:{get:c=>c.success(saved.get(c.key)||''),set:c=>{saved.set(c.key,c.value);c.success();}},
      interconnect:{instance:()=>channel},application:{terminate(){}}});
    page=Object.assign({},c,c.private);page.onInit();page.onShow();
  }
  mount();t.after(async()=>{page.onDestroy();await h.runtime.stop();});
  await h.connect();await h.clock.advance(6000);
  assert.equal(h.state.ack.bandBrightness,170);assert.equal(writes.length,0);
  await h.runtime.dispatch({op:'configure',settings:{bandBrightness:200},request:'set-brightness'});
  await h.clock.advance(2000);assert.equal(h.state.operation.status,'applying');
  native=200;writes.at(-1).success();await h.clock.advance(2000);
  assert.equal(h.state.operation.status,'done');assert.equal(h.state.ack.brightness.value,200);
  await h.runtime.dispatch({op:'configure',settings:{powerSaving:true},request:'power-on'});
  await h.clock.advance(2000);assert.equal(writes.at(-1).value,25);native=25;writes.at(-1).success();
  await h.clock.advance(2000);assert.equal(h.state.operation.status,'done');
  page.onDestroy();mount();assert.equal(writes.at(-1).value,25);writes.at(-1).success();
  await h.runtime.dispatch({op:'configure',settings:{powerSaving:false},request:'power-off'});
  await h.clock.advance(2000);assert.equal(writes.at(-1).value,200);native=200;writes.at(-1).success();
  await h.clock.advance(2000);assert.equal(h.state.operation.status,'done');
  await h.runtime.dispatch({op:'configure',settings:{bandBrightness:80},request:'native-error'});
  await h.clock.advance(2000);writes.at(-1).fail();await h.clock.advance(2000);
  assert.equal(h.state.operation.code,'brightness_failed');
  const beforeRetry=writes.length;
  await h.runtime.dispatch({op:'configure',settings:{bandBrightness:80},request:'native-retry'});
  await h.clock.advance(2000);assert.equal(writes.length,beforeRetry+1);
  writes.at(-1).success();await h.clock.advance(2000);assert.equal(h.state.operation.status,'done');
});
