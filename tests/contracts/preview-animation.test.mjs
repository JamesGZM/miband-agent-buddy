import test from 'node:test';
import assert from 'node:assert/strict';
import {startPreview} from '../../apps/desktop/ui/preview.js';

function harness(t, {imagesReady = true} = {}) {
  let time=0, paints=0, present=true, next=1;
  const timers=new Map(), frames=new Map(), listeners=new Map(), images=[], texts=[], layers=[];
  const state={theme:'chatgpt',online:true,bandPage:0,powerSaving:false,runtime:{agent:{state:'thinking',sessionCounts:{thinking:2,working:0,attention:0}}}};
  const context={clearRect(){paints++;layers.length=0;},fillRect(){},save(){},translate(){},rotate(){},drawImage(image){layers.push(image.src);},restore(){},fillText(text){texts.push(text);}};
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
  return {preview,state,doc,listeners,frames,timers,images,texts,layers,frameAt,timersAt,canvas,loading,error,load,
    get paints(){return paints;},setTime(value){time=value;},setPresent(value){present=value;}};
}

test('cold preview commits only complete frames and keeps the last frame while new assets load',t=>{
  const h=harness(t,{imagesReady:false});
  assert.equal(h.images.length,4);
  assert.equal(h.paints,0,'do not clear the visible canvas before its first complete frame');
  h.frameAt(200);
  assert.equal(h.images.length,4,'finish the pending frame instead of chasing new animation assets');
  for(const image of h.images.slice(0,3))h.load(image);
  h.frameAt(240);
  assert.equal(h.paints,0,'partial image completions must not expose a partial frame');
  h.load(h.images[3]);h.frameAt(280);
  assert.equal(h.paints,1);assert.equal(h.layers.length,4);assert.equal(h.loading.hidden,true);
  const firstFrame=[...h.layers];
  h.frameAt(320);
  assert.equal(h.paints,1);assert.deepEqual(h.layers,firstFrame);
  for(const image of h.images.filter(image=>!image.complete))h.load(image);
  h.frameAt(360);
  assert.equal(h.paints,2);assert.equal(h.layers.length,4);
  const previousFrame=[...h.layers];
  h.state.theme='claude';h.preview.draw();
  assert.equal(h.paints,2,'keep the previous full theme until the replacement is ready');
  assert.deepEqual(h.layers,previousFrame);
  const pending=h.images.filter(image=>!image.complete);
  for(const image of pending.slice(1))h.load(image);
  h.frameAt(400);assert.equal(h.paints,2);
  h.load(pending[0]);h.frameAt(440);
  assert.equal(h.paints,3);assert.equal(h.layers.length,4);assert.match(h.layers[1],/claude/);
});

test('late assets cannot paint an abandoned theme and failed assets never clear the preview',t=>{
  const h=harness(t,{imagesReady:false});
  const initial=[...h.images];
  h.state.theme='deepseek';h.preview.draw();
  for(const image of initial)h.load(image);
  h.frameAt(40);
  assert.equal(h.paints,0,'the first theme must not flash after a newer theme is selected');
  const waiting=h.images.filter(image=>!image.complete);
  waiting[0].onerror();h.frameAt(80);
  assert.equal(h.paints,0);assert.equal(h.loading.hidden,true);assert.equal(h.error.hidden,false);
  h.preview.stop();
  assert.ok(h.images.every(image=>image.onload===null&&image.onerror===null));
});

test('resource page changes keep the character frame until all resource rings are ready',t=>{
  const h=harness(t,{imagesReady:false});
  for(const image of h.images)h.load(image);
  h.frameAt(40);
  const character=[...h.layers];
  h.state.bandPage=1;
  h.state.runtime.lastAckAt=40;
  h.state.runtime.metrics={sampledAt:40,cpu:42,memory:{usedBytes:8*2**30,totalBytes:16*2**30,percent:50},disk:{usedBytes:60e9,totalBytes:100e9,percent:60}};
  h.preview.draw();
  assert.equal(h.paints,1);assert.deepEqual(h.layers,character);assert.deepEqual(h.texts,[]);
  const pending=h.images.filter(image=>!image.complete);
  for(const image of pending.slice(0,-1))h.load(image);
  h.frameAt(80);assert.equal(h.paints,1);
  h.load(pending.at(-1));h.frameAt(120);
  assert.equal(h.paints,2);assert.equal(h.layers.length,4);
  assert.match(h.layers[0],/resource-tracks\.png$/);assert.ok(h.texts.includes('42%'));
});

test('preview uses bounded smooth frames, reduced cadence on opt-in, and no hidden work',t=>{
  const h=harness(t);
  for(let i=1;i<=60;i++)h.frameAt(i*1000/60);
  assert.ok(h.paints>=30&&h.paints<=32,`expected about30paints, got${h.paints}`);
  assert.equal(h.frames.size,1);assert.equal(h.timers.size,0);
  h.state.powerSaving=true;h.preview.draw();
  assert.equal(h.frames.size,0);assert.equal([...h.timers.values()][0].delay,200);
  const before=h.paints;
  for(let i=1;i<=5;i++){h.timersAt(1000+i*200);h.frameAt(1000+i*200);}
  assert.equal(h.paints-before,5);
  h.doc.hidden=true;h.listeners.get('visibilitychange')();
  assert.equal(h.frames.size+h.timers.size,0);
  const hiddenPaints=h.paints;h.preview.draw();assert.equal(h.paints,hiddenPaints);
  h.doc.hidden=false;h.state.powerSaving=false;h.listeners.get('visibilitychange')();
  assert.equal(h.frames.size,1);
  const callback=[...h.frames.values()][0];h.preview.stop();callback();
  assert.equal(h.frames.size+h.timers.size,0);assert.equal(h.listeners.size,0);
});

test('preview uses one main ring for both single and multiple tasks, with the loading layer unchanged',t=>{
  const h=harness(t);
  for(const theme of ['chatgpt','claude','deepseek']){
    h.state.theme=theme;h.state.runtime.agent.state='thinking';
    h.state.runtime.agent.sessionCounts={thinking:2,working:1,attention:0};h.preview.draw();
    assert.equal(h.layers.length,4);
    assert.match(h.layers[1],new RegExp('activity-'+theme+'-active-3-b0\\.png$'));
    assert.match(h.layers[2],/thinking-00\.png$/);
    assert.equal(h.layers.filter(path=>/activity-|-ring-|\/ring-/.test(path)).length,1);
    h.state.runtime.agent.sessionCounts={thinking:1,working:0,attention:0};h.preview.draw();
    assert.equal(h.layers.length,4);assert.match(h.layers[1],/ring-idle-b0\.png$/);
    h.state.runtime.agent.state='attention';h.state.runtime.agent.sessionCounts={thinking:1,working:1,attention:1};h.preview.draw();
    assert.match(h.layers[1],new RegExp('activity-'+theme+'-attention-3-b0\\.png$'));
    h.state.online=false;h.preview.draw();assert.match(h.layers[1],/ring-idle-b0\.png$/);
    h.state.online=true;
  }
});

test('preview stops when canvas is absent, bounds decoded images, and draws no task text',t=>{
  const h=harness(t);
  for(const theme of ['chatgpt','claude','deepseek'])for(const mode of ['idle','thinking','working','attention']){
    h.state.theme=theme;h.state.runtime.agent.state=mode;
    for(let i=0;i<160;i++){h.setTime(i*40);h.preview.draw();}
  }
  assert.ok(h.images.length>192,'exercise cache eviction across themes and states');
  assert.ok(h.images.filter(image=>image.onload!==null).length<=192);
  assert.deepEqual(h.texts,[],'activity is represented by ring colors rather than text');
  h.setPresent(false);h.preview.draw();assert.equal(h.frames.size+h.timers.size,0);
  h.setPresent(true);h.preview.draw();assert.equal(h.frames.size,1);
  h.preview.stop();assert.ok(h.images.every(image=>image.onload===null));
});
