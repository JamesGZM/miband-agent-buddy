import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createKeepScreen}=createRequire(import.meta.url)('../../apps/band/src/common/keep-screen.js');
function harness(){let now=1000,id=0;const tasks=new Map(),calls=[],reports=[];const controller=createKeepScreen(o=>calls.push(o),()=>now,(fn,delay)=>{tasks.set(++id,{fn,at:now+delay});return id;},id=>tasks.delete(id),s=>reports.push(s));return {controller,calls,reports,advance(ms){const end=now+ms;while(true){let next=[...tasks].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;tasks.delete(next[0]);next[1].fn();}now=end;}};}
test('visible app refreshes every 30 seconds independent of rendering or incoming data',()=>{const h=harness();h.controller.show();h.calls[0].success();h.advance(29999);assert.equal(h.calls.length,1);h.advance(1);assert.equal(h.calls.length,2);h.calls[1].success();assert.equal(h.controller.snapshot().successes,2);});
test('hiding cancels renewal and ignores old callbacks',()=>{const h=harness();h.controller.show();h.controller.hide();h.calls[0].success();h.calls[1].success();h.advance(90000);assert.equal(h.calls.length,2);assert.equal(h.controller.snapshot().state,'off');assert.equal(h.controller.snapshot().visible,false);});
test('missing callback times out with bounded retry; no per-frame requests',()=>{const h=harness();h.controller.show();h.advance(5000);assert.equal(h.controller.snapshot().failures,1);h.advance(1999);assert.equal(h.calls.length,1);h.advance(1);assert.equal(h.calls.length,2);h.calls[0].success();assert.equal(h.controller.snapshot().successes,0);h.calls[1].success();assert.equal(h.controller.snapshot().state,'on');});
test('show following hide invalidates delayed release callback',()=>{const h=harness();h.controller.show();h.calls[0].success();h.controller.hide();h.controller.show();h.calls[2].success();h.calls[1].success();assert.equal(h.controller.snapshot().state,'on');assert.equal(h.controller.snapshot().shows,2);});
test('wake hold expires on the band without further packets, including missing API callback',()=>{
 for(const callback of [true,false]){
  const h=harness();assert.equal(h.controller.hold('event-1',20000),true);
  if(callback)h.calls[0].success();
  h.advance(19999);assert.equal(h.controller.display().remainingMs,1);
  h.advance(1);assert.equal(h.calls.at(-1).keepScreenOn,false);assert.equal(h.controller.display().remainingMs,0);
  var count=h.calls.length;h.advance(120000);assert.equal(h.calls.length,count);
 }
});
test('duplicate wake and ordinary time cannot extend a lease; exit cancels it',()=>{
 const h=harness();h.controller.hold('event-1',20000);h.calls[0].success();h.advance(10000);
 assert.equal(h.controller.hold('event-1',20000),false);assert.equal(h.controller.display().remainingMs,10000);
 h.controller.hide();h.calls.at(-1).success();h.advance(60000);assert.equal(h.calls.length,2);assert.equal(h.controller.snapshot().state,'off');
});
test('new event replaces the lease, while invalid durations never acquire screen lock',()=>{
 const h=harness();assert.equal(h.controller.hold('bad',1800001),false);assert.equal(h.calls.length,0);
 h.controller.hold('event-1',20000);h.calls[0].success();h.advance(10000);h.controller.hold('event-2',20000);h.calls[1].success();
 h.advance(19999);assert.equal(h.calls.length,2);h.advance(1);assert.equal(h.calls.length,3);assert.equal(h.calls[2].keepScreenOn,false);
});
test('half-hour lease keeps renewing every 30 seconds and still expires on the band',()=>{
 const h=harness();assert.equal(h.controller.hold('long',1800000),true);
 for(let elapsed=0;elapsed<1800000-30000;elapsed+=30000){h.calls.at(-1).success();h.advance(30000);}
 assert.equal(h.calls.every(c=>c.keepScreenOn),true);assert.equal(h.calls.length,60);
 h.calls.at(-1).success();h.advance(30000);
 assert.equal(h.calls.at(-1).keepScreenOn,false);assert.equal(h.controller.display().remainingMs,0);
 h.advance(120000);assert.equal(h.calls.length,61);
});
test('active snapshots renew a watchdog without brightness requests for every sample',()=>{
 const h=harness();h.controller.hold('task',20000);h.calls[0].success();
 h.controller.activity(15000,60000);
 for(let elapsed=0;elapsed<60000;elapsed+=2000){h.advance(2000);h.controller.activity(15000,60000);h.calls.at(-1).success();}
 assert.equal(h.controller.display().active,true);assert.equal(h.controller.display().remainingMs,15000);
 assert.equal(h.calls.length,3);assert.equal(h.calls.every(c=>c.keepScreenOn),true);
 h.advance(15000);assert.equal(h.calls.at(-1).keepScreenOn,false);assert.equal(h.controller.display().active,false);
});
test('last active task starts one idle grace period and idle snapshots never extend it',()=>{
 const h=harness();h.controller.activity(15000,60000);h.calls[0].success();h.advance(10000);
 h.controller.activity(0,60000);assert.equal(h.controller.display().active,false);
 for(let elapsed=0;elapsed<60000;elapsed+=2000){h.advance(2000);h.controller.activity(0,60000);h.calls.at(-1).success();}
 assert.equal(h.controller.display().remainingMs,0);assert.equal(h.calls.at(-1).keepScreenOn,false);
 h.controller.activity(0,60000);assert.equal(h.controller.display().remainingMs,0);
});
test('new work interrupts idle grace, while hide cancels both timers and stale callbacks',()=>{
 const h=harness();h.controller.activity(15000,60000);const stale=h.calls[0];
 h.controller.activity(0,60000);h.advance(2000);h.controller.activity(15000,60000);
 assert.equal(h.controller.display().active,true);assert.equal(h.controller.display().remainingMs,15000);
 h.controller.hide();h.calls.at(-1).success();stale.success();h.advance(120000);
 assert.equal(h.controller.display().remainingMs,0);assert.equal(h.controller.snapshot().state,'off');
 assert.equal(h.calls.at(-1).keepScreenOn,false);
});
test('malformed activity leases cannot acquire or extend the display',()=>{
 const h=harness();
 for(const [hold,idle] of [[-1,20000],[999,20000],[15001,20000],[1.5,20000],[15000,4999],[15000,1800001],[15000,'20000']])assert.equal(h.controller.activity(hold,idle),false);
 assert.equal(h.calls.length,0);assert.equal(h.controller.display().remainingMs,0);
});

test('negative firmware result in success callback is a failure and retries before the watchdog',()=>{
 const h=harness();h.controller.activity(15000,20000);
 h.calls[0].success({value:-1});
 assert.equal(h.controller.snapshot().state,'error');
 assert.equal(h.controller.snapshot().successes,0);
 h.advance(2000);assert.equal(h.calls.length,2);
 h.calls[1].success({value:0});assert.equal(h.controller.snapshot().state,'on');
 h.controller.hide();h.calls.at(-1).success();h.advance(60000);
 assert.equal(h.calls.at(-1).keepScreenOn,false);
});

test('a missing brightness callback retries while active without waiting thirty seconds',()=>{
 const h=harness();h.controller.activity(15000,20000);h.advance(5000);
 assert.equal(h.controller.snapshot().state,'error');
 h.advance(2000);assert.equal(h.calls.length,2);
 h.calls[0].success();assert.equal(h.controller.snapshot().state,'pending');
 h.calls[1].success();assert.equal(h.controller.snapshot().state,'on');
 h.advance(8000);assert.equal(h.calls.at(-1).keepScreenOn,false);
});
