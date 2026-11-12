import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fakeClock} from '../helpers/runtime.mjs';
const require=createRequire(import.meta.url);
const {createBoundsProbe}=require('../../apps/band/src/common/drawing-support.js');
const {createPageController}=require('../../apps/band/src/controllers/page-controller.js');
const target=(kind='rects',id=kind)=>({kind,id,expected:{left:4,top:241,width:8,height:157}});
const rect={left:4,top:241,width:7,height:157};

test('native bounds are read after layout settles and copied without arbitrary properties',async()=>{
 const clock=fakeClock(),calls=[];
 const probe=createBoundsProbe(id=>({getBoundingClientRect:o=>{calls.push(id);o.success({...rect,private:'synthetic-private'});}}),clock.schedule,clock.cancel);
 probe.show(true);probe.update([target()]);
 await clock.advance(199);assert.equal(calls.length,0);
 await clock.advance(1);assert.deepEqual(calls,['rects']);
 assert.deepEqual(probe.snapshot(),[{kind:'rects',status:'ok',expected:target().expected,actual:rect}]);
 const snapshot=probe.snapshot();snapshot[0].actual.width=99;
 assert.equal(probe.snapshot()[0].actual.width,7);
 assert.equal(clock.size,0);probe.close();probe.close();
});

test('missing, rejected and malformed native measurements are explicit and bounded',async()=>{
 const clock=fakeClock();
 const probe=createBoundsProbe(id=>{
  if(id==='missing')return {};
  if(id==='error')return {getBoundingClientRect:o=>o.fail('synthetic-private')};
  return {getBoundingClientRect:o=>o.success({...rect,width:Infinity})};
 },clock.schedule,clock.cancel);
 probe.show(true);probe.update([target('stage','missing'),target('rects','error'),target('arcs','invalid'),target('capsules','ignored')]);
 await clock.advance(200);
 assert.deepEqual(probe.snapshot().map(x=>x.status),['unavailable','error','invalid']);
 assert.ok(!JSON.stringify(probe.snapshot()).includes('synthetic-private'));
 assert.equal(clock.size,0);probe.close();
});

test('silent native methods time out once and ignore late and duplicate replies',async()=>{
 const clock=fakeClock();let callback;
 const probe=createBoundsProbe(()=>({getBoundingClientRect:o=>{callback=o;}}),clock.schedule,clock.cancel);
 probe.show(true);probe.update([target()]);await clock.advance(200);
 assert.equal(probe.snapshot()[0].status,'pending');
 await clock.advance(1000);assert.equal(probe.snapshot()[0].status,'timeout');
 callback.success(rect);callback.fail();assert.equal(probe.snapshot()[0].status,'timeout');
 assert.equal(clock.size,0);probe.close();
});

test('hide, target replacement and close retire timers and abandoned native callbacks',async()=>{
 const clock=fakeClock(),callbacks=[];
 const probe=createBoundsProbe(()=>({getBoundingClientRect:o=>callbacks.push(o)}),clock.schedule,clock.cancel);
 probe.show(true);probe.update([target()]);await clock.advance(200);
 probe.update([target('arcs')]);callbacks[0].success(rect);
 assert.deepEqual(probe.snapshot(),[]);
 probe.show(false);await clock.advance(2000);assert.equal(callbacks.length,1);assert.equal(clock.size,0);
 probe.show(true);await clock.advance(200);assert.equal(callbacks.length,2);
 probe.close();probe.close();callbacks[1].success(rect);await clock.advance(2000);
 assert.deepEqual(probe.snapshot(),[]);assert.equal(clock.size,0);
 probe.show(true);probe.update([target()]);assert.equal(clock.size,0);
});

test('page measures static primitives once, does not probe animation frames and cancels on hide',async()=>{
 const clock=fakeClock(),calls=[],sent=[],channel={send:o=>sent.push(o.data)};
 const probe=createBoundsProbe(id=>({getBoundingClientRect:o=>{calls.push(id);o.success(rect);}}),clock.schedule,clock.cancel);
 const controller=createPageController({now:clock.now,schedule:clock.schedule,cancel:clock.cancel,boundsProbe:probe,drawingCapabilities:{renderer:'native-geometry'},
  storage:{get:o=>o.fail(),set:o=>o.success()},application:{terminate(){}},brightness:{setKeepScreenOn:o=>o.success()},interconnect:{instance:()=>channel}});
 const page=Object.assign({},controller,controller.private);
 page.onInit();page.onShow();
 const message={v:1,type:'snapshot',session:'bounds-fixture',seq:1,text:'',value:0,cpu:42,mode:'working',activityRing:['#123456','#ABCDEF']};
 channel.onmessage({data:JSON.stringify(message)});await clock.advance(100);await clock.advance(200);
 assert.equal(calls.length,3);assert.ok(calls.some(id=>id.startsWith('buddy-base-capsules-')));
 assert.ok(calls.some(id=>id.startsWith('buddy-base-rects-')));assert.ok(calls.some(id=>id.startsWith('buddy-base-arcs-')));
 await clock.advance(2000);channel.onmessage({data:JSON.stringify({...message,seq:2})});
 assert.equal(calls.length,3);assert.equal(sent.at(-1).drawing.bounds.length,3);
 assert.equal(sent.at(-1).drawing.bounds.find(x=>x.kind==='rects').expected.width,8);
 assert.equal(sent.at(-1).drawing.bounds.find(x=>x.kind==='rects').actual.width,7);
 page.act('monitor');await clock.advance(300);assert.equal(calls.length,3);
 page.act('pet');page.onHide();await clock.advance(2000);assert.equal(calls.length,3);assert.equal(clock.size,0);
 page.onDestroy();page.onDestroy();assert.deepEqual(probe.snapshot(),[]);
});

test('moving primitive expectations are sampled at measurement time',async()=>{
 const clock=fakeClock();let current={...rect};
 const probe=createBoundsProbe(()=>({getBoundingClientRect:o=>o.success(current)}),clock.schedule,clock.cancel);
 probe.show(true);probe.update([{...target(),expected:()=>current}]);
 await clock.advance(100);current={...rect,top:260,height:120};await clock.advance(100);
 assert.deepEqual(probe.snapshot()[0].expected,current);assert.deepEqual(probe.snapshot()[0].actual,current);
 probe.close();
});

test('one-task page measures the loading primitives rather than only the complete capsule',async()=>{
 const clock=fakeClock(),calls=[],sent=[],channel={send:o=>sent.push(o.data)};
 const probe=createBoundsProbe(id=>({getBoundingClientRect:o=>{calls.push(id);o.success(rect);}}),clock.schedule,clock.cancel);
 const controller=createPageController({now:clock.now,schedule:clock.schedule,cancel:clock.cancel,boundsProbe:probe,drawingCapabilities:{renderer:'native-geometry'},
  storage:{get:o=>o.fail(),set:o=>o.success()},application:{terminate(){}},brightness:{setKeepScreenOn:o=>o.success()},interconnect:{instance:()=>channel}});
 const page=Object.assign({},controller,controller.private);page.onInit();page.onShow();
 const message={v:1,type:'snapshot',session:'one-task-bounds',seq:1,text:'',value:0,cpu:42,mode:'working',activityRing:['#123456']};
 channel.onmessage({data:JSON.stringify(message)});await clock.advance(100);await clock.advance(200);
 assert.equal(calls.length,3);assert.ok(calls.some(id=>id.startsWith('buddy-live-rects-')));assert.ok(calls.some(id=>id.startsWith('buddy-live-arcs-')));
 await clock.advance(2000);channel.onmessage({data:JSON.stringify({...message,seq:2})});
 assert.equal(calls.length,3);assert.equal(sent.at(-1).drawing.bounds.find(x=>x.kind==='rects').expected.width,8);
 assert.equal(sent.at(-1).drawing.bounds.find(x=>x.kind==='arcs').expected.width,186);
 page.onDestroy();assert.equal(clock.size,0);
});
