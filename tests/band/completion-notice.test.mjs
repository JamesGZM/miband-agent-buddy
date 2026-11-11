import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fakeClock} from '../helpers/runtime.mjs';
const {createCompletionNotice}=createRequire(import.meta.url)('../../apps/band/src/common/completion-notice.js');
const message=(id='notice-1',count=1)=>({completionVibration:true,completion:{id,count}});
function harness({saved='',delayWrite=false,readFail=false}={}) {
 const clock=fakeClock(),pulses=[],writes=[];let value=saved;
 const notice=createCompletionNotice({get:c=>readFail?c.fail():c.success(value),set:c=>{writes.push(c);if(!delayWrite){value=c.value;c.success();}}},
  {vibrate:options=>pulses.push({at:clock.now(),...options})},clock.now,clock.schedule,clock.cancel);
 notice.load();notice.show(true);
 return {clock,pulses,writes,notice,get saved(){return value;}};
}
test('completion vibration defaults off and counts play separately only after durable deduplication',async()=>{
 const h=harness({delayWrite:true}),msg=message('batch-1',3);
 h.notice.apply(msg,true);assert.equal(h.writes.length,0);assert.equal(h.pulses.length,0);
 h.notice.enable(true);h.notice.apply(msg,false);assert.equal(h.writes.length,0);
 h.notice.apply(msg,true);h.notice.apply(msg,true);assert.equal(h.writes.length,1);assert.equal(h.pulses.length,0);
 assert.equal(h.notice.receipt(msg).status,'pending');h.writes[0].success();
 assert.equal(h.notice.receipt(msg).status,'accepted');assert.equal(h.pulses.length,1);
 await h.clock.advance(1200);assert.equal(h.pulses.length,3);
 assert.deepEqual(h.pulses.map(p=>p.mode),['short','short','short']);
 assert.equal(h.pulses[1].at-h.pulses[0].at,600);
 h.notice.apply(msg,true);await h.clock.advance(2000);assert.equal(h.pulses.length,3);
 h.notice.close();assert.equal(h.clock.size,0);
});
test('persisted completion ID suppresses replay after page/app restart',()=>{
 const h=harness();h.notice.enable(true);h.notice.apply(message(),true);assert.equal(h.saved,'notice-1');h.notice.close();
 const fresh=harness({saved:h.saved});fresh.notice.enable(true);fresh.notice.apply(message(),true);
 assert.equal(fresh.notice.receipt(message()).status,'accepted');assert.equal(fresh.pulses.length,0);assert.equal(fresh.writes.length,0);fresh.notice.close();
});
test('turning off or hiding cancels queued pulses; new completion batches respect spacing',async()=>{
 const h=harness();h.notice.enable(true);h.notice.apply(message('first',2),true);
 h.notice.apply(message('second',1),true);assert.equal(h.pulses.length,1);
 await h.clock.advance(600);assert.equal(h.pulses.length,2);h.notice.enable(false);
 await h.clock.advance(2000);assert.equal(h.pulses.length,2);h.notice.enable(true);
 h.notice.apply(message('second',1),true);assert.equal(h.pulses.length,2);
 h.notice.show(false);h.notice.apply(message('third',2),true);assert.equal(h.pulses.length,2);
 h.notice.show(true);assert.equal(h.pulses.length,3);h.notice.show(false);
 await h.clock.advance(1000);assert.equal(h.pulses.length,3);h.notice.close();
});
test('storage errors/timeouts fail closed and teardown ignores late callbacks',async()=>{
 const failed=harness({readFail:true});failed.notice.enable(true);failed.notice.apply(message(),true);
 assert.equal(failed.notice.receipt(message()).status,'error');assert.equal(failed.pulses.length,0);failed.notice.close();
 const h=harness({delayWrite:true});h.notice.enable(true);h.notice.apply(message(),true);
 await h.clock.advance(5000);assert.equal(h.notice.receipt(message()).status,'error');h.writes[0].success();assert.equal(h.pulses.length,0);
 h.notice.close();assert.equal(h.clock.size,0);
 const late=harness({delayWrite:true});late.notice.enable(true);late.notice.apply(message(),true);late.notice.close();
 late.writes[0].success();late.writes[0].fail();await late.clock.advance(10000);assert.equal(late.pulses.length,0);assert.equal(late.clock.size,0);
});
test('an off request stops pending pulses before settings finish saving',async()=>{
 const h=harness();h.notice.enable(true);h.notice.apply(message('before-off',3),true);
 assert.equal(h.pulses.length,1);h.notice.apply({completionVibration:false},false);
 await h.clock.advance(2000);assert.equal(h.pulses.length,1);
 h.notice.enable(true);h.notice.apply(message('after-on'),true);assert.equal(h.pulses.length,2);h.notice.close();
});
test('long mode reaches the native API and keeps concurrent requests apart',async()=>{
 const h=harness();h.notice.setMode('long');h.notice.enable(true);h.notice.apply(message('long-batch',2),true);
 assert.equal(h.pulses[0].mode,'long');await h.clock.advance(1999);assert.equal(h.pulses.length,1);
 await h.clock.advance(1);assert.equal(h.pulses.length,2);assert.equal(h.pulses[1].mode,'long');
 assert.equal(h.pulses[1].at-h.pulses[0].at,2000);h.notice.close();
});
