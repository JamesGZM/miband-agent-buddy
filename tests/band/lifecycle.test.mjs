import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const protocol = require('../../packages/buddy-shared/protocol/snapshot.js');
const ux = fs.readFileSync(new URL('../../apps/band/src/pages/index/index.ux', import.meta.url), 'utf8');
const {createPageController}=require('../../apps/band/src/controllers/page-controller.js');

function harness({keepScreen=true,render,drawingCapabilities,animatePet}={}) {
  const requests = [], sent = [], timers = new Set(), exits = [], delays = new Map(), keepTimers = new Set();
  let now = 1000;
  const channel = { getReadyState: ({ success }) => success({ status: 1 }), send: args => sent.push(args) };
  const deps = {
    render,drawingCapabilities,animatePet,
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
  assert.equal(page.diagnostics().keepResult, 'off');
});

test('received message is ACKed once and becomes stale after 10 seconds', () => {
  const { page, requests, sent, channel, setTime } = harness();
  page.onShow(); requests[0].success(); page.act('monitor');
  const data = JSON.stringify({ v: 1, type: 'snapshot', session: 'test', seq: 1, text: 'Hello', value: 0, cpu: 0 });
  channel.onmessage({ data });
  channel.onmessage({ data });
  assert.equal(page.diagnostics().received, 1);
  assert.equal(page.cpuText, '0%');
  assert.equal(sent[0].data.appVersion, '0.5.5');
  assert.deepEqual(sent[0].data.capabilities, {maxWakeHoldMs: 1800000, maxActivityHoldMs: 120000, themes: ['chatgpt', 'claude', 'deepseek'], page: true, activityHold: true, activityRing: true, powerSaving: true, buddyFps: true});
  assert.equal(typeof sent[0].data, 'object');
  assert.equal(sent[0].data.keepScreen, 'on');
  sent[0].success();
  assert.equal(page.diagnostics().errorText, '');
  assert.equal(sent.length, 1);
  setTime(11000); page.tick();
  assert.equal(page.cpuText, '—');
  channel.onmessage({ data: 'bad' });
  assert.equal(page.diagnostics().errorText, 'Invalid message');
  page.onDestroy();
  assert.equal(channel.onmessage, null);
});

test('screen API failure is recorded without adding controls to the band', () => {
  const { page, requests } = harness();
  page.onShow(); requests[0].fail('unsupported', 1002);
  assert.equal(page.diagnostics().keepResult, 'error');
  assert.match(page.diagnostics().errorText, /1002/);
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
 channel.onmessage({data:JSON.stringify({...base,seq:4,page:2})});assert.equal(page.pageIndex,0);assert.equal(page.diagnostics().errorText,'Invalid message');
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
 channel.onmessage(metric(1,10));page.act('monitor');assert.equal(page.diagnostics().cpuProgress,10);
 setTime(3000);channel.onmessage(metric(2,90));assert.equal(page.diagnostics().cpuProgress,10);
 setTime(3450);page.tick();assert.equal(page.diagnostics().cpuProgress,50);
 assert.equal(delays.get([...timers][0]),100);assert.equal(timers.size,1);
 setTime(3900);page.tick();assert.equal(page.diagnostics().cpuProgress,90);
 assert.equal(delays.get([...timers][0]),9100);
 setTime(13000);page.tick();assert.equal(page.cpuText,'—');assert.equal(page.diagnostics().cpuProgress,0);assert.equal(timers.size,0);
});
test('hidden pages do not update rings and application hide cancels active transition',()=>{
 const {page,channel,setTime,timers}=harness();page.onShow();
 channel.onmessage(metric(1,20));assert.equal(page.diagnostics().cpuProgress,0);
 page.act('monitor');assert.equal(page.diagnostics().cpuProgress,20);
 setTime(3000);channel.onmessage(metric(2,80));page.onHide();assert.equal(timers.size,0);
 setTime(3400);channel.onmessage(metric(3,40));assert.equal(timers.size,0);assert.equal(page.diagnostics().cpuProgress,20);
 page.onShow();assert.equal(page.diagnostics().cpuProgress,40);assert.equal(timers.size,1);
 page.onDestroy();assert.equal(timers.size,0);
});
test('duplicate values do not restart transitions or produce redundant property writes',()=>{
 const {page,channel,setTime}=harness();page.onShow();channel.onmessage(metric(1,20));page.act('monitor');

 setTime(3000);channel.onmessage(metric(2,80));setTime(3450);page.tick();
 setTime(3500);channel.onmessage(metric(3,80));setTime(3900);page.tick();assert.equal(page.diagnostics().cpuProgress,80);
 const before=page.diagnostics().frames;setTime(5000);channel.onmessage(metric(4,80));assert.equal(page.diagnostics().frames,before);
});
test('throttled final frame is scheduled even if a packet arrives at transition completion',()=>{
 const {page,channel,setTime,timers,delays}=harness();page.onShow();channel.onmessage(metric(1,0));page.act('monitor');
 setTime(3000);channel.onmessage(metric(2,100));setTime(3860);page.tick();assert.equal(page.diagnostics().cpuProgress,99);
 setTime(3900);channel.onmessage(metric(3,100));assert.equal(delays.get([...timers][0]),60);
 setTime(3960);page.tick();assert.equal(page.diagnostics().cpuProgress,100);
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
test('native dynamic update cost stays constant from one through six task colors',t=>{
 const colors=['#647FFF','#78EDFF','#A192FF','#EBA270','#FFBD64','#76CDB8'],budgets=[];
 for(let count=1;count<=6;count++){
  const {page,channel,setTime}=harness({keepScreen:false});page.onShow();
  const msg={v:1,type:'snapshot',session:'render-budget',seq:1,text:'',value:0,cpu:42,mode:'working',activityRing:colors.slice(0,count)};
  channel.onmessage({data:JSON.stringify(msg)});page.tick();
  let staticWrites=0,dynamicWrites=0,churn=0;
  for(const name of ['drawRects','drawArcs','drawCapsules','tipRects','tipArcs','baseRects','baseArcs','baseCapsules']){
   const list=page[name];
   for(let i=0;i<list.length;i++)list[i]=new Proxy(list[i],{set(target,key,value){
    if(name.startsWith('base'))staticWrites++;else dynamicWrites++;
    target[key]=value;return true;
   }});
   const splice=list.splice;
   list.splice=function(...args){churn++;return splice.apply(this,args);};
  }
  for(let n=1;n<=80;n++){setTime(1000+n*100);page.tick();}
  assert.equal(staticWrites,0,'no base-ring binding writes at '+count+' colors');
  assert.equal(churn,0,'no native component replacement during animation');
  assert.ok(dynamicWrites>0,'keep the existing loading animation');budgets.push(dynamicWrites);
  page.onDestroy();
 }
 assert.ok(budgets.every(n=>n===budgets[0]),'adding a color must not add per-frame UI mutations: '+budgets);
 t.diagnostic('UI writes over 80 frames at 1–6 colors: '+budgets.join(', ')+'; static writes and component churn: 0');
});

test('page observers never receive the globally cached glyph objects',()=>{
 const geometry=require('../../packages/buddy-shared/presentation/geometry.js');
 const shared=geometry.portrait(geometry.frame({native:true,theme:'chatgpt',mode:'idle'})).glyphs;
 const {page}=harness({keepScreen:false});page.onShow();
 assert.notEqual(page.glyphRects,shared);assert.notEqual(page.glyphRects[0],shared[0]);
 const before=shared[0].left;page.glyphRects[0].left++;
 assert.equal(shared[0].left,before);page.onDestroy();
});

test('pet geometry responds to counts, stale snapshots and idle without extra UI',()=>{
 const {page,channel,setTime}=harness({keepScreen:false});page.onShow();
 const base={v:1,type:'snapshot',session:'counts',seq:1,text:'',value:0,cpu:42,mode:'attention',sessionCounts:{thinking:1,working:1,attention:1}};
 channel.onmessage({data:JSON.stringify(base)});page.tick();const multi=JSON.stringify([page.baseArcs,page.baseCapsules,page.drawArcs,page.drawCapsules]);
 setTime(1900);page.tick();assert.equal(JSON.stringify([page.baseArcs,page.baseCapsules,page.drawArcs,page.drawCapsules]),multi,'base colors update only with state');
 const breathing=JSON.stringify([page.baseArcs,page.baseCapsules,page.drawArcs,page.drawCapsules]);
 channel.onmessage({data:JSON.stringify({...base,seq:2,sessionCounts:{thinking:0,working:0,attention:1}})});page.tick();
 assert.notEqual(JSON.stringify([page.baseArcs,page.baseCapsules,page.drawArcs,page.drawCapsules]),breathing);
 channel.onmessage({data:JSON.stringify({...base,seq:3,mode:'working'})});page.tick();const working=JSON.stringify([page.baseArcs,page.baseCapsules,page.drawArcs,page.drawCapsules]);
 setTime(11900);page.tick();assert.notEqual(JSON.stringify([page.baseArcs,page.baseCapsules,page.drawArcs,page.drawCapsules]),working);
 channel.onmessage({data:JSON.stringify({...base,seq:4,mode:'idle',sessionCounts:{thinking:0,working:0,attention:0}})});page.tick();
 const idle=JSON.stringify([page.baseArcs,page.baseCapsules,page.drawArcs,page.drawCapsules]);
 channel.onmessage({data:JSON.stringify({...base,seq:5,sessionCounts:{thinking:128,working:1,attention:0}})});
 assert.equal(JSON.stringify([page.baseArcs,page.baseCapsules,page.drawArcs,page.drawCapsules]),idle);assert.equal(page.diagnostics().errorText,'Invalid message');
 assert.doesNotMatch(ux,/<image|activity-count|activity-label|activitySource/);
});

test('power saving applies live, is acknowledged, and hidden animation has no timer',()=>{
 const {page,channel,sent,timers,delays,setTime}=harness({keepScreen:false});page.onShow();
 assert.equal(delays.get([...timers][0]),100);
 const base={v:1,type:'snapshot',session:'power',seq:1,text:'',value:0,cpu:42,mode:'thinking',powerSaving:true};
 channel.onmessage({data:JSON.stringify(base)});
 assert.equal(sent.at(-1).data.powerSaving,true);assert.equal(delays.get([...timers][0]),100);
 const symbol=page.glyphStyle;setTime(1400);page.tick();assert.notEqual(page.glyphStyle,symbol);
 channel.onmessage({data:JSON.stringify({...base,seq:2,powerSaving:false})});
 assert.equal(sent.at(-1).data.powerSaving,false);assert.equal(delays.get([...timers][0]),100);
 const oldTick=[...timers][0];page.onHide();assert.equal(timers.size,0);oldTick();assert.equal(timers.size,0);
 page.onShow();assert.equal(timers.size,1);page.onDestroy();assert.equal(timers.size,0);
});

test('destroyed controller ignores late channel send and error callbacks',()=>{
 const {page,channel,sent}=harness();page.onShow();
 channel.onmessage(metric(1,42));
 const staleError=channel.onerror,staleMessage=channel.onmessage,received=page.diagnostics().received;
 page.onDestroy();
 const before=page.diagnostics().errorText;
 sent[0].success();sent[0].fail('late',999);staleError({code:999});
 staleMessage({data:'bad'});staleMessage(metric(2,84));
 assert.equal(page.diagnostics().received,received);
 assert.equal(page.diagnostics().errorText,before);assert.equal(channel.onmessage,null);
});

test('fifteen minutes of native animation keep observed arrays and glyph geometry alive',()=>{
 const {page,channel,setTime,timers}=harness({keepScreen:false});page.onShow();
 const base={v:1,type:'snapshot',session:'endurance',seq:1,text:'',value:0,cpu:42,mode:'working'};
 channel.onmessage({data:JSON.stringify(base)});
 const glyphs=page.glyphRects;
 for(const name of ['drawRects','drawArcs','drawCapsules','tipRects','tipArcs']){
  const value=page[name];Object.defineProperty(page,name,{get:()=>value,set:()=>assert.fail(name+' replaced')});
 }
 for(let tick=1;tick<=9000;tick++){
  setTime(1000+tick*100);
  if(tick%20===0)channel.onmessage({data:JSON.stringify({...base,seq:tick})});else page.tick();
  assert.equal(page.glyphRects,glyphs);assert.ok(page.drawArcs.length<=4);assert.equal(timers.size,1);
  for(const list of [page.drawRects,page.drawArcs,page.drawCapsules,page.tipRects,page.tipArcs])assert.equal(new Set(list.map(x=>x.id)).size,list.length);
 }
 page.onHide();assert.equal(timers.size,0);
});
test('switching resource and pet pages reuses observed lists with bounded arc components',()=>{
 const {page,channel,setTime}=harness({keepScreen:false});page.onShow();
 const lists=[page.drawRects,page.drawArcs,page.drawCapsules,page.tipRects,page.tipArcs];
 for(let i=1;i<=100;i++){
  setTime(1000+i*2000);channel.onmessage(metric(i,42));page.act(i%2?'monitor':'pet');
  for(const [index,name] of ["drawRects","drawArcs","drawCapsules","tipRects","tipArcs"].entries())assert.equal(page[name],lists[index]);
  assert.ok(page.drawArcs.length<=6);
 }
});

test('unchanged resource snapshots update receipts without recomputing geometry',()=>{
 let renders=0;const geometry=require('../../packages/buddy-shared/presentation/geometry.js');
 const {page,channel,setTime,sent}=harness({keepScreen:false,render:state=>{renders++;return geometry.frame(state);}});
 page.onShow();channel.onmessage(metric(1,42));page.act('monitor');renders=0;
 for(let i=2;i<=4;i++){setTime(1000+i*2000);channel.onmessage(metric(i,42));}
 assert.equal(renders,0);assert.equal(sent.at(-1).data.seq,4);assert.equal(page.cpuText,'42%');
 setTime(10000);channel.onmessage(metric(5,80));setTime(10450);page.tick();assert.equal(renders,1);
 page.act('pet');assert.equal(renders,2);page.act('monitor');assert.equal(renders,3);
});
test('selected frame rate changes live, power saving forces10 and turning it off restores selection',()=>{
 const {page,channel,sent,timers,delays}=harness({keepScreen:false,drawingCapabilities:{renderer:'native-geometry'}});page.onShow();
 const base={v:1,type:'snapshot',session:'fps',seq:1,text:'',value:0,cpu:0,mode:'working',buddyFps:30,powerSaving:false};
 for(const [seq,buddyFps,powerSaving,fps] of [[1,30,false,30],[2,30,true,10],[3,30,false,30],[4,17,false,17]]){
  channel.onmessage({data:JSON.stringify({...base,seq,buddyFps,powerSaving})});
  assert.equal(delays.get([...timers][0]),1000/fps);assert.equal(sent.at(-1).data.buddyFps,buddyFps);
  assert.equal(sent.at(-1).data.drawing.effectiveFps,fps);
 }
 page.onHide();assert.equal(timers.size,0);
});

test('multi-session animation reuses every bound shape without observer list mutations',()=>{
 const {page,channel,setTime}=harness({keepScreen:false});page.onShow();
 const base={v:1,type:'snapshot',session:'multi-animation',seq:1,text:'',value:0,cpu:0,mode:'working',sessionCounts:{thinking:0,working:6,attention:0}};
 channel.onmessage({data:JSON.stringify(base)});page.tick();
 const lists=[page.drawRects,page.drawArcs,page.drawCapsules,page.tipRects,page.tipArcs],items=lists.map(list=>[...list]);
 for(const list of lists)list.splice=()=>assert.fail('animation changed an observed shape list');
 for(let tick=1;tick<=480;tick++){
  setTime(1000+tick*100);
  if(tick%20===0)channel.onmessage({data:JSON.stringify({...base,seq:tick})});else page.tick();
  for(let list=0;list<lists.length;list++){
   assert.equal(lists[list].length,items[list].length);
   for(let item=0;item<items[list].length;item++)assert.equal(lists[list][item],items[list][item]);
  }
 }
 page.onDestroy();
});

test('animation scheduling includes render time in the selected frame budget',()=>{
 const geometry=require('../../packages/buddy-shared/presentation/geometry.js');
 let time=1000,h;
 h=harness({keepScreen:false,render:state=>{time+=40;h.setTime(time);return geometry.frame(state);}});
 h.page.onShow();
 const base={v:1,type:'snapshot',session:'frame-budget',seq:1,text:'',value:0,cpu:0,mode:'working',sessionCounts:{thinking:0,working:6,attention:0}};
 h.channel.onmessage({data:JSON.stringify(base)});
 for(let tick=0;tick<20;tick++){
  const scheduled=[...h.timers][0],delay=h.delays.get(scheduled);
  assert.equal(delay,60,'40ms rendering must leave60ms of a100ms frame');
  const previous=time;time+=delay;h.setTime(time);scheduled();assert.equal(time-previous,100);
  assert.equal(h.timers.size,1);
 }
 h.channel.onmessage({data:JSON.stringify({...base,seq:2,buddyFps:30})});
 assert.equal(h.delays.get([...h.timers][0]),1,'an over-budget frame yields instead of adding a full interval');
 h.page.onHide();assert.equal(h.timers.size,0);
});

test('band applies host-prepared colors and never passes AI counts into animation ticks',()=>{
 const geometry=require('../../packages/buddy-shared/presentation/geometry.js');let rendered;
 const {page,channel,setTime,sent}=harness({keepScreen:false,render:state=>{rendered=state;assert.ok(!Object.hasOwn(state,'counts'));return geometry.frame(state);}});
 page.onShow();
 const activityRing=['#123456','#ABCDEF'];
 const base={v:1,type:'snapshot',session:'prepared-ring',seq:1,text:'',value:0,cpu:0,mode:'working',activityRing};
 channel.onmessage({data:JSON.stringify(base)});page.tick();
 assert.deepEqual(rendered.colors,activityRing);assert.equal(sent.at(-1).data.capabilities.activityRing,true);
 const colors=rendered.colors;setTime(1500);page.tick();assert.equal(rendered.colors,colors);
 setTime(11000);page.tick();assert.equal(rendered.mode,'offline');assert.equal(rendered.colors,null);
 channel.onmessage({data:JSON.stringify({...base,seq:2,activityRing:['#77EDBD'],mode:'complete'})});
 setTime(15000);page.tick();assert.equal(rendered.mode,'idle');assert.equal(rendered.colors,null);
});


test('static native ring bindings are recreated only for palette or page changes',()=>{
 const {page,channel,setTime}=harness({keepScreen:false});page.onShow();
 const base={v:1,type:'snapshot',session:'static-native',seq:1,text:'',value:0,cpu:42,mode:'working',activityRing:['#123456','#ABCDEF']};
 channel.onmessage({data:JSON.stringify(base)});page.tick();
 const names=['baseRects','baseArcs','baseCapsules'],lists=names.map(name=>page[name]),items=lists.map(list=>[...list]);
 const original=JSON.stringify(items);
 for(let i=1;i<=80;i++){
  setTime(1000+i*100);page.tick();
  for(let n=0;n<names.length;n++)assert.deepEqual([...lists[n]],items[n]);
 }
 channel.onmessage({data:JSON.stringify({...base,seq:2})});
 assert.equal(JSON.stringify(lists),original,'identical fresh snapshots retain static bindings');
 channel.onmessage({data:JSON.stringify({...base,seq:3,activityRing:['#123456','#76CDB8']})});page.tick();
 assert.notEqual(JSON.stringify(lists),original);
 for(let n=0;n<lists.length;n++)for(const item of lists[n]){const old=items[n].find(old=>old.id===item.id);if(old)assert.equal(item.style,old.style,'a reused tid cannot change static style');}
 assert.equal(JSON.stringify(items),original,'do not mutate detached static items');
 const palette=JSON.stringify(lists);page.act('monitor');
 assert.ok(lists.every(list=>list.length===0),'no stale pet base over resource rings');
 page.act('pet');assert.notEqual(JSON.stringify(lists),palette,'returning page recreates static nodes');
 assert.ok(lists.some(list=>list.length));page.onDestroy();
});

test('native animation submits one complete style per widget, with no geometry-field bindings',()=>{
 const geometry=require('../../packages/buddy-shared/presentation/geometry.js');
 const {page,channel,setTime}=harness({keepScreen:false});page.onShow();
 const base={v:1,type:'snapshot',session:'style-transaction',seq:1,text:'',value:0,cpu:42,mode:'working',activityRing:['#123456','#ABCDEF']};
 channel.onmessage({data:JSON.stringify(base)});
 for(let tick=0;tick<80;tick++){
  setTime(1000+tick*100);page.tick();
  const frame=geometry.portrait(geometry.frame({native:true,mode:'working',seconds:tick/10,colors:base.activityRing}));
  for(const kind of ['rects','arcs','capsules']){
   const suffix=kind[0].toUpperCase()+kind.slice(1),bound=page['base'+suffix].concat(page['draw'+suffix],kind==='capsules'?[]:page['tip'+suffix]);
   assert.equal(bound.length,frame[kind].length);
   for(const shape of frame[kind]){
    const actual=bound.find(item=>item.id===shape.id||item.id.endsWith(':'+shape.id));
    assert.ok(actual,'missing '+shape.id);
    const styles=Object.fromEntries(actual.style.split(';').filter(Boolean).map(field=>field.split(':')));
    const expected={left:shape.left+'px',top:shape.top+'px',width:(kind==='arcs'?shape.size:shape.width)+'px',height:(kind==='arcs'?shape.size:shape.height)+'px'};
    if(kind==='arcs')Object.assign(expected,{'center-x':shape.center+'px','center-y':shape.center+'px',radius:shape.radius+'px','start-angle':shape.start+'deg','total-angle':shape.total+'deg','stroke-width':shape.width+'px',color:shape.color,'layer-color':shape.layerColor||shape.color});
    else Object.assign(expected,{'border-radius':shape.radius+'px'},kind==='capsules'?{'border-width':shape.stroke+'px','border-color':shape.color}:{'background-color':shape.color});
    assert.deepEqual(styles,expected,'every submitted style must preserve the original native paint');
    for(const key of ['left','top','width','height','start','total','color'])assert.equal(Object.hasOwn(actual,key),false);
   }
  }
 }
 page.onDestroy();
});


test('moving glyph bounds exclude the outer ring without changing any pixel positions',()=>{
 const geometry=require('../../packages/buddy-shared/presentation/geometry.js');
 const {page,channel,setTime}=harness({keepScreen:false});page.onShow();
 let seq=0;
 for(const theme of ['chatgpt','claude','deepseek']){
  channel.onmessage({data:JSON.stringify({v:1,type:'snapshot',session:'glyph-bounds',seq:++seq,text:'',value:0,cpu:42,mode:'working',buddyTheme:theme,settingsRevision:seq,keepScreen:false})});
  for(let tick=0;tick<=10;tick++){
   setTime(1000+tick*100);page.tick();
   const frame=geometry.portrait(geometry.frame({native:true,theme,mode:'working',seconds:tick/10}));
   const style=Object.fromEntries(page.glyphStyle.split(';').filter(Boolean).map(s=>s.split(':').map((v,i)=>i?parseFloat(v):v)));
   assert.ok(style.width*style.height<192*490*.3,'the moving group must be much smaller than the screen');
   assert.ok(style.left>15&&style.left+style.width<177,'moving damage cannot touch the capsule sides');
   assert.ok(style.top>15&&style.top+style.height<475);
   for(let i=0;i<frame.glyphs.length;i++){
    const expected=frame.glyphs[i],actual=page.glyphRects[i];
    assert.equal(actual.left+style.left,expected.left);
    assert.equal(actual.top+style.top,expected.top+frame.glyphLeft);
    assert.equal(actual.width,expected.width);assert.equal(actual.height,expected.height);
    assert.ok(actual.left>=0&&actual.top>=0&&actual.left+actual.width<=style.width&&actual.top+actual.height<=style.height);
   }
  }
  setTime(1000);
 }
 page.onDestroy();
});


test('static pet control has no animation timer but retains snapshot and stale-state handling',()=>{
 const {page,channel,setTime,sent,timers,delays}=harness({keepScreen:false,animatePet:false,drawingCapabilities:{renderer:'native-border-probe'}});
 page.onShow();assert.equal(timers.size,0);
 const message={v:1,type:'snapshot',session:'static-pet-control',seq:1,text:'',value:0,cpu:42,mode:'working',activityRing:['#123456','#ABCDEF'],activityHoldMs:120000,idleHoldMs:60000};
 channel.onmessage({data:JSON.stringify(message)});
 assert.equal(sent.at(-1).data.drawing.animationEnabled,false);assert.equal(sent.at(-1).data.wakeDisplay.active,true);
 assert.equal(delays.get([...timers][0]),10000);assert.equal(Object.hasOwn(page,'glyphLeft'),false);
 const shapes=JSON.stringify([page.baseRects,page.baseArcs,page.drawRects,page.drawArcs,page.tipRects,page.tipArcs,page.glyphStyle]);
 setTime(5000);channel.onmessage({data:JSON.stringify({...message,seq:2})});
 assert.equal(JSON.stringify([page.baseRects,page.baseArcs,page.drawRects,page.drawArcs,page.tipRects,page.tipArcs,page.glyphStyle]),shapes);
 assert.equal(delays.get([...timers][0]),10000);
 setTime(15000);[...timers][0]();assert.equal(timers.size,0);assert.equal(page.glyphColor,'#8298B4');
 page.onDestroy();assert.equal(timers.size,0);
});

test('static pet control preserves the completion-to-idle deadline',()=>{
 const {page,channel,setTime,timers,delays}=harness({keepScreen:false,animatePet:false});page.onShow();
 channel.onmessage({data:JSON.stringify({v:1,type:'snapshot',session:'static-complete',seq:1,text:'',value:0,cpu:42,mode:'complete'})});
 assert.equal(delays.get([...timers][0]),4000);
 assert.ok(page.baseCapsules.some(s=>s.style.toLowerCase().includes('#77edbd')));
 setTime(5000);[...timers][0]();assert.ok(page.baseCapsules.some(s=>s.style.toLowerCase().includes('#728bff')));
 assert.equal(delays.get([...timers][0]),6000);page.onDestroy();assert.equal(timers.size,0);
});

test('whole-border loading updates have constant cost at one through six colors and cancel on hide',t=>{
 const geometry=require('../../packages/buddy-shared/presentation/geometry.js');
 const colors=['#647FFF','#78EDFF','#A192FF','#EBA270','#FFBD64','#76CDB8'],budgets=[];
 for(let count=1;count<=6;count++){
  const {page,channel,setTime,timers,sent}=harness({keepScreen:false,render:geometry.createBorderRenderer(),drawingCapabilities:{renderer:'native-border'}});
  page.onShow();channel.onmessage({data:JSON.stringify({v:1,type:'snapshot',session:'border-animation',seq:1,text:'',value:0,cpu:42,mode:'working',activityRing:colors.slice(0,count)})});
  page.tick();assert.equal(sent.at(-1).data.drawing.animationEnabled,true);
  let staticWrites=0,dynamicWrites=0,churn=0;
  for(const name of ['borderBase','borderBodies','borderTips']){
   const list=page[name];
   for(let i=0;i<list.length;i++)list[i]=new Proxy(list[i],{set(item,key,value){if(name==='borderBase')staticWrites++;else dynamicWrites++;item[key]=value;return true;}});
   const splice=list.splice;list.splice=function(...args){churn++;return splice.apply(this,args);};
  }
  const initial=page.breathColor,pose=page.glyphStyle;
  for(let n=1;n<=80;n++){setTime(1000+n*100);page.tick();}
  assert.equal(staticWrites,0);assert.equal(churn,0);assert.ok(dynamicWrites>0);assert.notEqual(page.breathColor,initial);assert.notEqual(page.glyphStyle,pose);
  assert.equal(page.drawArcs.length+page.tipArcs.length+page.baseArcs.length,0);
  budgets.push(dynamicWrites);page.onHide();assert.equal(timers.size,0);page.onDestroy();
 }
 assert.ok(budgets.every(n=>n===budgets[0]),String(budgets));t.diagnostic('Border animation writes across 1–6 colors: '+budgets.join(', '));
});
