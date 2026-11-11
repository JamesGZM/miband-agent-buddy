import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const protocol = require('../../packages/buddy-shared/protocol/snapshot.js');
const ux = fs.readFileSync(new URL('../../apps/band/src/pages/index/index.ux', import.meta.url), 'utf8');
const {createPageController}=require('../../apps/band/src/controllers/page-controller.js');

function harness({keepScreen=true}={}) {
  const requests = [], sent = [], timers = new Set(), exits = [], delays = new Map(), keepTimers = new Set();
  let now = 1000;
  const channel = { getReadyState: ({ success }) => success({ status: 1 }), send: args => sent.push(args) };
  const deps = {
    storage:{get:args=>args.success(JSON.stringify({buddyTheme:'chatgpt',settingsRevision:0,keepScreen})),set:args=>args.success()},
    brightness: { setKeepScreenOn: args => requests.push(args) },
    interconnect: { instance: () => channel },
    keepScreen: {createKeepScreen:(api,clock,_schedule,_cancel,report)=>require('../../apps/band/src/common/keep-screen.js').createKeepScreen(api,clock,(fn)=>{keepTimers.add(fn);return fn;},fn=>keepTimers.delete(fn),report)},
    application: {terminate:()=>exits.push('exit')},
    schedule:(fn,delay)=>{const callback=()=>{if(!timers.delete(callback))return;fn();};timers.add(callback);delays.set(callback,delay);return callback;},
    cancel:fn=>timers.delete(fn),
    now: () => now,
    setInterval: fn => { timers.add(fn); return fn; },
    clearInterval: fn => timers.delete(fn)
  };
  const controller=createPageController(deps);
  const page = Object.assign({}, controller, controller.private);
  page.onInit();
  return { page, requests, sent, channel, timers, keepTimers, exits, delays, setTime: value => { now = value; } };
}

test('hide releases screen lock and stale success cannot turn UI back on', () => {
  const { page, requests, timers, keepTimers } = harness();
  page.onShow();
  assert.equal(requests[0].keepScreenOn, true);
  assert.equal(timers.size, 1);
  page.onHide();
  assert.equal(requests[1].keepScreenOn, false);
  assert.equal(timers.size, 0);
  assert.equal(keepTimers.size,0);
  requests[1].success();
  requests[0].success();
  assert.equal(page.keepResult, 'off');
});

test('received message is ACKed once and becomes stale after 10 seconds', () => {
  const { page, requests, sent, channel, setTime } = harness();
  page.onShow(); requests[0].success(); page.act('monitor');
  const data = JSON.stringify({ v: 1, type: 'snapshot', session: 'test', seq: 1, text: 'Hello', value: 0, cpu: 0 });
  channel.onmessage({ data });
  channel.onmessage({ data });
  assert.equal(page.received, 1);
  assert.equal(page.cpuText, '0%');
  assert.equal(sent[0].data.appVersion, '0.5.4');
  assert.deepEqual(sent[0].data.capabilities, {maxWakeHoldMs: 1800000, themes: ['chatgpt', 'claude', 'deepseek'], page: true, activityHold: true});
  assert.equal(typeof sent[0].data, 'object');
  assert.equal(sent[0].data.keepScreen, 'on');
  sent[0].success();
  assert.equal(page.errorText, '');
  assert.equal(sent.length, 1);
  setTime(11000); page.tick();
  assert.equal(page.cpuText, '—');
  channel.onmessage({ data: 'bad' });
  assert.equal(page.errorText, 'Invalid message');
  page.onDestroy();
  assert.equal(channel.onmessage, null);
});

test('screen API failure is recorded without adding controls to the band', () => {
  const { page, requests } = harness();
  page.onShow(); requests[0].fail('unsupported', 1002);
  assert.equal(page.keepResult, 'error');
  assert.match(page.errorText, /1002/);
  assert.ok(!ux.includes('<input'));
});

test('tap switches pages without resetting on new data',()=>{
 const {page,channel,setTime}=harness();page.onShow();
 page.togglePage();assert.equal(page.pageIndex,1);
 channel.onmessage({data:JSON.stringify({v:1,type:'snapshot',session:'test',seq:1,text:'',value:0,cpu:42,memory:{usedBytes:8,totalBytes:16,percent:50},disk:{usedBytes:60,totalBytes:100,percent:60}})});
 assert.equal(page.pageIndex,1);assert.equal(page.memoryText,'50%');assert.equal(page.diskText,'60%');
 setTime(1300);page.togglePage();assert.equal(page.pageIndex,0);
});
test('Mac page request switches the band page once and invalid pages are rejected',()=>{
 const {page,channel,sent}=harness();page.onShow();
 const base={v:1,type:'snapshot',session:'page',seq:1,text:'',value:0,cpu:42,page:1};
 channel.onmessage({data:JSON.stringify(base)});assert.equal(page.pageIndex,1);assert.equal(sent.at(-1).data.page,1);
 channel.onmessage({data:JSON.stringify({...base,seq:2,page:undefined})});assert.equal(page.pageIndex,1);
 channel.onmessage({data:JSON.stringify({...base,seq:3,page:0})});assert.equal(page.pageIndex,0);
 channel.onmessage({data:JSON.stringify({...base,seq:4,page:2})});assert.equal(page.pageIndex,0);assert.equal(page.errorText,'Invalid message');
});
test('long press exit terminates once, stops timers and releases screen lock',()=>{
 const {page,requests,timers,exits}=harness();page.onShow();page.exitApp();page.exitApp();
 assert.equal(exits.length,1);assert.equal(timers.size,0);assert.equal(requests.at(-1).keepScreenOn,false);
 assert.ok(ux.includes('onlongpress="exitApp"'));assert.ok(!ux.includes('<swiper'));assert.ok(!ux.includes('<image-animator'));
});
test('long press exits and system back is not swallowed',()=>{
 const h=harness();h.page.onShow();h.page.exitApp();assert.equal(h.exits.length,1);
 const h2=harness();h2.page.onShow();assert.equal(h2.page.onBackPress(),false);assert.equal(h2.timers.size,0);
});
test('remote exit ACK callback and fallback both release the app',()=>{
 for(const callback of [true,false]){
  const {page,channel,sent,timers,exits}=harness();page.onShow();
  channel.onmessage({data:JSON.stringify({v:1,type:'snapshot',session:'exit',seq:1,text:'',value:0,cpu:-1,command:'exit'})});
  assert.equal(sent[0].data.exitReady,true);
  if(callback)sent[0].success();else for(const fn of Array.from(timers))fn();
  assert.equal(exits.length,1);assert.equal(timers.size,0);
 }
});

function metric(seq,cpu){return {data:JSON.stringify({v:1,type:'snapshot',session:'smooth',seq,text:'',value:0,cpu})};}
test('resource rings interpolate, settle without polling and invalidate at stale deadline',()=>{
 const {page,channel,setTime,timers,delays}=harness();page.onShow();
 channel.onmessage(metric(1,10));page.act('monitor');assert.match(page.cpuRing,/010.png$/);
 setTime(3000);channel.onmessage(metric(2,90));assert.match(page.cpuRing,/010.png$/);
 setTime(3450);page.tick();assert.match(page.cpuRing,/050.png$/);
 assert.equal(delays.get([...timers][0]),80);assert.equal(timers.size,1);
 setTime(3900);page.tick();assert.match(page.cpuRing,/090.png$/);
 assert.equal(delays.get([...timers][0]),9100);
 setTime(13000);page.tick();assert.equal(page.cpuText,'—');assert.match(page.cpuRing,/000.png$/);assert.equal(timers.size,0);
});
test('hidden pages do not update rings and application hide cancels active transition',()=>{
 const {page,channel,setTime,timers}=harness();page.onShow();
 channel.onmessage(metric(1,20));assert.match(page.cpuRing,/000.png$/);
 page.act('monitor');assert.match(page.cpuRing,/020.png$/);
 setTime(3000);channel.onmessage(metric(2,80));page.onHide();assert.equal(timers.size,0);
 setTime(3400);channel.onmessage(metric(3,40));assert.equal(timers.size,0);assert.match(page.cpuRing,/020.png$/);
 page.onShow();assert.match(page.cpuRing,/040.png$/);assert.equal(timers.size,1);
 page.onDestroy();assert.equal(timers.size,0);
});
test('duplicate values do not restart transitions or produce redundant property writes',()=>{
 const {page,channel,setTime}=harness();page.onShow();channel.onmessage(metric(1,20));page.act('monitor');
 let writes=0,value=page.cpuRing;Object.defineProperty(page,'cpuRing',{get:()=>value,set:v=>{writes++;value=v;}});
 setTime(3000);channel.onmessage(metric(2,80));setTime(3450);page.tick();
 setTime(3500);channel.onmessage(metric(3,80));setTime(3900);page.tick();assert.match(page.cpuRing,/080.png$/);
 const before=writes;setTime(5000);channel.onmessage(metric(4,80));assert.equal(writes,before);
});
test('throttled final frame is scheduled even if a packet arrives at transition completion',()=>{
 const {page,channel,setTime,timers,delays}=harness();page.onShow();channel.onmessage(metric(1,0));page.act('monitor');
 setTime(3000);channel.onmessage(metric(2,100));setTime(3830);page.tick();assert.match(page.cpuRing,/098.png$/);
 setTime(3900);channel.onmessage(metric(3,100));assert.equal(delays.get([...timers][0]),10);
 setTime(3910);page.tick();assert.match(page.cpuRing,/100.png$/);
});

test('single root click handler debounces taps and ignores clicks after long press or hide',()=>{
 const {page,setTime}=harness();page.onShow();page.togglePage();assert.equal(page.pageIndex,1);
 setTime(1100);page.togglePage();assert.equal(page.pageIndex,1);
 setTime(1300);page.togglePage();assert.equal(page.pageIndex,0);
 page.onHide();setTime(1600);page.togglePage();assert.equal(page.pageIndex,0);
 page.onShow();page.exitApp();setTime(1900);page.togglePage();assert.equal(page.pageIndex,0);
 assert.equal((ux.match(/onclick="togglePage"/g)||[]).length,1);
 assert.ok(!ux.includes('onswipe='));assert.ok(!ux.includes('ontouchend='));
});
test('natural-sleep mode acquires a bounded hold only on a new wake event',()=>{
 const {page,channel,requests}=harness({keepScreen:false});page.onShow();assert.equal(requests.length,0);
 const base={v:1,type:'snapshot',session:'wake',seq:1,text:'',value:0,cpu:42,wakeId:'event-1',wakeHoldMs:20000};
 channel.onmessage({data:JSON.stringify(base)});assert.equal(requests.length,1);assert.equal(requests[0].keepScreenOn,true);
 channel.onmessage({data:JSON.stringify({...base,seq:2})});assert.equal(requests.length,1);
 page.onHide();assert.equal(requests.at(-1).keepScreenOn,false);
 channel.onmessage({data:JSON.stringify({...base,seq:3,wakeId:'event-2'})});assert.equal(requests.length,2);
});
test('activity renewal is capability advertised, replay safe and cannot relight a hidden page',()=>{
 const {page,channel,requests,sent,setTime}=harness({keepScreen:false});page.onShow();
 const base={v:1,type:'snapshot',session:'activity',seq:1,text:'',value:0,cpu:42,mode:'working',activityHoldMs:15000,idleHoldMs:60000};
 channel.onmessage({data:JSON.stringify(base)});requests[0].success();
 assert.equal(sent.at(-1).data.capabilities.activityHold,true);
 assert.equal(sent.at(-1).data.wakeDisplay.active,true);
 setTime(3000);channel.onmessage({data:JSON.stringify(base)});assert.equal(sent.length,1);
 channel.onmessage({data:JSON.stringify({...base,seq:2})});assert.equal(sent.at(-1).data.wakeDisplay.remainingMs,15000);
 assert.equal(requests.length,1);
 page.onHide();requests.at(-1).success();
 channel.onmessage({data:JSON.stringify({...base,seq:3})});
 assert.equal(requests.length,2);assert.equal(sent.at(-1).data.wakeDisplay.active,false);
 assert.equal(sent.at(-1).data.wakeDisplay.remainingMs,0);
 page.onShow();assert.equal(requests.length,2);
 page.exitApp();channel.onmessage({data:JSON.stringify({...base,seq:4})});assert.equal(requests.at(-1).keepScreenOn,false);
});
test('pet page shows only bounded aggregate counts and clears them when stale or idle',()=>{
 const {page,channel,setTime}=harness({keepScreen:false});page.onShow();
 const base={v:1,type:'snapshot',session:'counts',seq:1,text:'',value:0,cpu:42,mode:'attention',sessionCounts:{thinking:1,working:1,attention:1}};
 channel.onmessage({data:JSON.stringify(base)});assert.equal(page.activityLabel,'3 ACTIVE · 1 WAIT');
 setTime(11000);page.tick();assert.equal(page.activityLabel,'');
 channel.onmessage({data:JSON.stringify({...base,seq:2,sessionCounts:{thinking:0,working:0,attention:0}})});
 assert.equal(page.activityLabel,'');
 channel.onmessage({data:JSON.stringify({...base,seq:3,sessionCounts:{thinking:128,working:1,attention:0}})});
 assert.equal(page.activityLabel,'');assert.equal(page.errorText,'Invalid message');
 assert.match(ux,/class="activity-count"/);assert.match(ux,/padding-top: 158px/);
});

test('destroyed controller ignores late channel send and error callbacks',()=>{
 const {page,channel,sent}=harness();page.onShow();
 channel.onmessage(metric(1,42));
 const staleError=channel.onerror,staleMessage=channel.onmessage,received=page.received;
 page.onDestroy();
 const before=page.errorText;
 sent[0].success();sent[0].fail('late',999);staleError({code:999});
 staleMessage({data:'bad'});staleMessage(metric(2,84));
 assert.equal(page.received,received);
 assert.equal(page.errorText,before);assert.equal(channel.onmessage,null);
});
