import test from 'node:test';
import assert from 'node:assert/strict';
import {startPreview} from '../../apps/desktop/ui/preview.js';

function harness(t, {imagesReady = true} = {}) {
  let time=0, paints=0, present=true, next=1;
  const timers=new Map(), frames=new Map(), listeners=new Map(), images=[], texts=[], layers=[],rectangles=[],arcs=[];
  const state={theme:'chatgpt',online:true,bandPage:0,powerSaving:false,buddyFps:30,runtime:{agent:{state:'thinking',sessionCounts:{thinking:2,working:0,attention:0}}}};
  const context={clearRect(){paints++;layers.length=0;texts.length=0;rectangles.length=0;arcs.length=0;},fillRect(...args){layers.push(this.fillStyle);rectangles.push(args);},beginPath(){},moveTo(){},lineTo(){},arcTo(){},closePath(){},arc(...args){arcs.push(args);},stroke(){layers.push(this.strokeStyle);},fill(){layers.push(this.fillStyle);},fillText(text){texts.push(text);}};
  const canvas={dataset:{},getContext:()=>context};
  const loading={hidden:false}, error={hidden:true};
  const doc={hidden:false,querySelector:selector=>!present?null:selector==='#band'?canvas:selector==='#preview-loading'?loading:selector==='#preview-error'?error:null,
    addEventListener:(event,fn)=>listeners.set(event,fn),removeEventListener:event=>listeners.delete(event)};
  const original={document:Object.getOwnPropertyDescriptor(globalThis,'document'),Image:Object.getOwnPropertyDescriptor(globalThis,'Image')};
  Object.defineProperty(globalThis,'document',{value:doc,configurable:true});
  Object.defineProperty(globalThis,'Image',{value:class{constructor(){this.complete=imagesReady;this.naturalWidth=imagesReady?192:0;images.push(this);}},configurable:true});
  const preview=startPreview(()=>state,{now:()=>time,wallNow:()=>time,
    requestFrame:fn=>{const id=next++;frames.set(id,fn);return id;},cancelFrame:id=>frames.delete(id),
    schedule:(fn,delay)=>{const id=next++;timers.set(id,{fn,at:time+delay,delay});return id;},cancel:id=>timers.delete(id)});
  t.after(()=>{preview.stop();for(const [key,descriptor] of Object.entries(original))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  function frameAt(at){time=at;const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(time);}
  function timersAt(at){time=at;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}}
  const load=image=>{image.complete=true;image.naturalWidth=192;image.onload?.();};
  return {preview,state,doc,listeners,frames,timers,images,texts,layers,rectangles,arcs,frameAt,timersAt,canvas,loading,error,load,
    get paints(){return paints;},setTime(value){time=value;},setPresent(value){present=value;}};
}

test('cold preview paints complete geometry immediately without image decoding',t=>{
 const h=harness(t,{imagesReady:false});assert.equal(h.images.length,0);assert.equal(h.paints,1);
 assert.ok(h.layers.length>10);assert.equal(h.loading.hidden,true);assert.equal(h.canvas.dataset.previewReady,'true');
 const initial=[...h.layers];h.state.theme='claude';h.preview.draw();assert.equal(h.paints,2);assert.notDeepEqual(h.layers,initial);
 assert.ok(h.layers.includes('#EBA270'));assert.equal(h.images.length,0);
 h.state.theme='deepseek';h.preview.draw();assert.ok(h.layers.includes('#7E95FF'));assert.ok(!h.layers.includes('#EBA270'));
});
test('unavailable drawing context reports error without clearing the last frame',t=>{
 const h=harness(t),before=h.paints;h.canvas.getContext=()=>null;h.preview.draw();
 assert.equal(h.paints,before);assert.equal(h.error.hidden,false);assert.equal(h.loading.hidden,true);
});
test('resource page preserves the three capsule tracks and original numbers',t=>{
 const h=harness(t);h.state.bandPage=1;h.state.runtime.lastAckAt=1;
 h.state.runtime.metrics={sampledAt:1,cpu:42,memory:{usedBytes:8*2**30,totalBytes:16*2**30,percent:50},disk:{usedBytes:60e9,totalBytes:100e9,percent:60}};
 h.preview.draw();assert.ok(h.texts.includes('42%'));assert.ok(h.texts.includes('DISK'));assert.ok(h.texts.includes('MEM'));assert.ok(h.texts.includes('TOTAL LOAD'));
 assert.deepEqual(h.arcs.map(a=>a[2]),[87,74,61]);assert.ok(h.layers.lastIndexOf('#192126')<h.layers.indexOf('#647FFF'));assert.ok(h.texts.some(v=>v.endsWith(' GiB')));assert.ok(h.layers.includes('#78EDFF'));assert.ok(h.layers.includes('#192126'));assert.equal(h.images.length,0);
 h.state.online=false;h.preview.draw();assert.ok(h.texts.includes('—'));assert.ok(!h.texts.includes('42%'));
});

test('preview uses bounded smooth frames, reduced cadence on opt-in, and no hidden work',t=>{
  const h=harness(t);
  for(let i=1;i<=60;i++)h.frameAt(i*1000/60);
  assert.ok(h.paints>=30&&h.paints<=32,`expected about30paints, got${h.paints}`);
  assert.equal(h.frames.size,1);assert.equal(h.timers.size,0);
  h.state.powerSaving=true;h.preview.draw();
  assert.equal(h.frames.size,0);assert.equal([...h.timers.values()][0].delay,100);
  const before=h.paints;
  for(let i=1;i<=10;i++){h.timersAt(1000+i*100);h.frameAt(1000+i*100);}
  assert.equal(h.paints-before,10);
  h.doc.hidden=true;h.listeners.get('visibilitychange')();
  assert.equal(h.frames.size+h.timers.size,0);
  const hiddenPaints=h.paints;h.preview.draw();assert.equal(h.paints,hiddenPaints);
  h.doc.hidden=false;h.state.powerSaving=false;h.listeners.get('visibilitychange')();
  assert.equal(h.frames.size,1);
  const callback=[...h.frames.values()][0];h.preview.stop();callback();
  assert.equal(h.frames.size+h.timers.size,0);assert.equal(h.listeners.size,0);
});

test('preview applies task colors on the original ring and never draws task text',t=>{
 const h=harness(t);
 h.state.runtime.agent.state='attention';h.state.runtime.agent.sessionCounts={thinking:1,working:1,attention:1};h.preview.draw();
 const multi=[...h.layers];h.state.runtime.agent.sessionCounts={thinking:1,working:0,attention:0};h.preview.draw();assert.notDeepEqual(h.layers,multi);
 for(const theme of ['chatgpt','claude','deepseek'])for(const mode of ['idle','thinking','working','attention']){
  h.state.theme=theme;h.state.runtime.agent.state=mode;
  for(let i=0;i<100;i++){h.setTime(i*40);h.preview.draw();}
 }
 assert.equal(h.images.length,0);assert.deepEqual(h.texts,[]);
 h.setPresent(false);h.preview.draw();assert.equal(h.frames.size+h.timers.size,0);
 h.setPresent(true);h.preview.draw();assert.equal(h.frames.size,1);h.preview.stop();
});

test('preview follows every selected FPS and power saving restores the saved selection',t=>{
 const h=harness(t);
 for(const buddyFps of [10,15,20,25,30]){
  h.state.buddyFps=buddyFps;h.state.powerSaving=false;h.setTime(0);h.preview.draw();const before=h.paints;
  for(let i=1;i<=120;i++){h.timersAt(i*1000/120);h.frameAt(i*1000/120);}
  assert.ok(Math.abs(h.paints-before-buddyFps)<=1,`${buddyFps}: ${h.paints-before}`);
 }
 h.state.powerSaving=true;h.preview.draw();assert.equal([...h.timers.values()][0].delay,100);
 h.state.powerSaving=false;h.preview.draw();assert.equal(h.state.buddyFps,30);assert.equal(h.frames.size,1);
});
test('preview waits for applied FPS receipt and anchors animation to the band elapsed time',t=>{
 const h=harness(t);h.state.buddyFps=30;
 h.state.runtime.ack={mode:'thinking',settingsApplied:true,drawing:{effectiveFps:10,elapsedMs:1000}};
 h.state.runtime.lastAckAt=1;h.preview.draw();assert.ok(h.rectangles.some(r=>r[0]===122&&r[1]===50),"glyph uses band elapsed pose");assert.equal([...h.timers.values()][0].delay,100);
 h.state.runtime.ack.drawing.effectiveFps=30;h.preview.draw();assert.equal(h.frames.size,1);
 h.state.runtime.ack.drawing.effectiveFps=1000;h.preview.draw();assert.equal(h.frames.size,1);
});
