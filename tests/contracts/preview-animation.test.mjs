import test from 'node:test';
import assert from 'node:assert/strict';
import {startPreview} from '../../apps/desktop/ui/preview.js';

function roundedContains(box,x,y) {
 const [left,top,width,height,radius]=box,r=Math.min(radius,width/2,height/2);
 if(x<left||x>left+width||y<top||y>top+height)return false;
 const cx=Math.max(left+r,Math.min(x,left+width-r)),cy=Math.max(top+r,Math.min(y,top+height-r));
 return (x-cx)**2+(y-cy)**2<=r*r;
}
// Sample opaque interiors of recorded canvas commands; no image files or GPU.
function rasterPixel(operations,x,y) {
 let color;
 for(const op of operations){
  if(op.clip&&(x<op.clip[0]||y<op.clip[1]||x>=op.clip[0]+op.clip[2]||y>=op.clip[1]+op.clip[3]))continue;
  let hit=false;
  if(op.kind==='fill')hit=roundedContains(op.box,x,y);
  else if(op.kind==='border'){
   const [left,top,width,height,r]=op.box,w=op.width/2;
   hit=roundedContains([left-w,top-w,width+2*w,height+2*w,r+w],x,y)&&!roundedContains([left+w,top+w,width-2*w,height-2*w,r-w],x,y);
  }else{
   const [cx,cy,r,start,end]=op.arc,w=op.width/2,tau=2*Math.PI;
   const theta=(Math.atan2(y-cy,x-cx)-start+2*tau)%tau;
   hit=theta<=end-start&&Math.abs(Math.hypot(x-cx,y-cy)-r)<=w;
   for(const angle of [start,end])hit||=(x-cx-r*Math.cos(angle))**2+(y-cy-r*Math.sin(angle))**2<=w*w;
  }
  if(hit){
   const alpha=/^rgba\(0,0,0,([\d.]+)\)$/.exec(op.color);
   if(alpha&&color){let next='#';for(let i=1;i<7;i+=2)next+=Math.round(parseInt(color.slice(i,i+2),16)*(1-Number(alpha[1]))).toString(16).padStart(2,'0');color=next;}
   else color=op.color;
  }
 }
 return color;
}
function harness(t, {imagesReady = true} = {}) {
  let time=0, paints=0, present=true, next=1;
  const timers=new Map(), frames=new Map(), listeners=new Map(), images=[], texts=[], layers=[],rectangles=[],arcs=[];
  const state={theme:'chatgpt',online:true,bandPage:0,powerSaving:false,buddyFps:30,runtime:{agent:{state:'thinking',sessionCounts:{thinking:2,working:0,attention:0}}}};
  const operations=[];let path=[],pathArc=null,radius=0,clip=null,clipPath=null;const saves=[];
  function box(){const xs=path.map(p=>p[0]),ys=path.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),radius];}
  const context={clearRect(){paints++;layers.length=0;texts.length=0;rectangles.length=0;arcs.length=0;operations.length=0;},
   fillRect(...args){layers.push(this.fillStyle);rectangles.push(args);operations.push({kind:'fill',box:[...args,0],color:this.fillStyle});},
   save(){saves.push(clip);},restore(){clip=saves.pop();},rect(...args){clipPath=args;},clip(){clip=clipPath;},
   beginPath(){path=[];pathArc=null;radius=0;clipPath=null;},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},
   arcTo(x1,y1,x2,y2,r){path.push([x1,y1],[x2,y2]);radius=r;},closePath(){},
   arc(...args){arcs.push(args);pathArc=args;},
   stroke(){layers.push(this.strokeStyle);operations.push({kind:pathArc?'arc':'border',arc:pathArc,box:pathArc?null:box(),width:this.lineWidth,color:this.strokeStyle,clip});},
   fill(){layers.push(this.fillStyle);operations.push({kind:'fill',box:box(),color:this.fillStyle});},fillText(text){texts.push(text);}};
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
    pixel:(x,y)=>rasterPixel(operations,x,y),get paints(){return paints;},setTime(value){time=value;},setPresent(value){present=value;}};
}

test('bright loading tips remain visible at the top and bottom straight/curve junctions',t=>{
 const h=harness(t);h.setTime(1);h.state.runtime.lastAckAt=1;
 h.state.runtime.agent.state='working';
 h.state.runtime.ack={mode:'working',settingsApplied:true,drawing:{effectiveFps:10,elapsedMs:958.375}};
 for(let count=1;count<=6;count++){
  h.state.runtime.agent.sessionCounts={thinking:0,working:count,attention:0};h.preview.draw();
  assert.equal(h.pixel(97.5,6.5),'#E8F9FF','top tip was repainted by an arc at '+count+' colors');
  assert.equal(h.pixel(390.5,182.5),'#E8F9FF','bottom tip was repainted by an arc at '+count+' colors');
  h.state.runtime.agent.state='thinking';h.state.runtime.ack={mode:'thinking',settingsApplied:true,drawing:{effectiveFps:10,elapsedMs:5250.083333333333}};h.preview.draw();
  assert.equal(h.pixel(93.5,6.5),'#E8F9FF','thinking tip was repainted by an arc at '+count+' colors');
  h.state.runtime.agent.state='working';h.state.runtime.ack={mode:'working',settingsApplied:true,drawing:{effectiveFps:10,elapsedMs:958.375}};
 }
});

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


test('preview follows a static pet control receipt while preserving complete-to-idle semantics',t=>{
 const h=harness(t);h.setTime(1);h.state.runtime.lastAckAt=1;h.state.runtime.agent.state='working';
 h.state.runtime.ack={mode:'working',settingsApplied:true,drawing:{effectiveFps:10,animationEnabled:false,elapsedMs:1500}};
 h.preview.draw();
 assert.ok(!h.layers.includes('#94B5FF'));assert.ok(!h.layers.includes('#E8F9FF'));
 assert.ok(h.rectangles.some(r=>r[0]===118&&r[1]===50));
 const before=[...h.layers];h.setTime(5001);h.preview.draw();assert.deepEqual(h.layers,before);
 h.state.runtime.agent.state='complete';h.state.runtime.lastAckAt=5001;
 h.state.runtime.ack={mode:'complete',settingsApplied:true,drawing:{effectiveFps:10,animationEnabled:false,elapsedMs:4500}};
 h.preview.draw();assert.ok(!h.layers.map(c=>c.toLowerCase()).includes('#77edbd'));assert.ok(h.layers.map(c=>c.toLowerCase()).includes('#728bff'));
});

test('preview restores whole-border breathing and moving loading from the native renderer receipt',t=>{
 const h=harness(t);h.setTime(1);h.state.runtime.lastAckAt=1;h.state.runtime.agent.state='idle';
 h.state.runtime.ack={mode:'idle',settingsApplied:true,drawing:{renderer:'native-border',effectiveFps:10,animationEnabled:true,elapsedMs:0}};
 h.preview.draw();const dim=h.pixel(245.5,8.5);assert.equal(h.arcs.length,0);
 h.state.runtime.ack.drawing.elapsedMs=2000;h.preview.draw();const bright=h.pixel(245.5,8.5);assert.notEqual(bright,dim);
 assert.ok(parseInt(bright.slice(1,3),16)>parseInt(dim.slice(1,3),16));
 h.state.runtime.agent.state='working';h.state.runtime.ack.mode='working';h.state.runtime.agent.sessionCounts={working:2,thinking:0,attention:0};
 const positions=[];
 for(const elapsedMs of [0,400,800,1200]){
  h.state.runtime.ack.drawing.elapsedMs=elapsedMs;h.preview.draw();
  assert.equal(h.arcs.length,0);assert.ok(h.layers.includes('#94B5FF'));assert.ok(h.layers.includes('#E8F9FF'));
  positions.push([h.pixel(300.5,8.5),h.pixel(470.5,96.5),h.pixel(180.5,184.5),h.pixel(30.5,96.5)]);
 }
 assert.ok(positions.some(p=>JSON.stringify(p)!==JSON.stringify(positions[0])));
 assert.equal([...h.timers.values()][0].delay,100);
});

test('static border probe preview uses only the first two task colors on complete half borders',t=>{
 const h=harness(t);h.setTime(1);h.state.runtime.lastAckAt=1;h.state.runtime.agent.state='working';
 h.state.runtime.agent.sessionCounts={working:6,thinking:0,attention:0};
 h.state.runtime.ack={mode:'working',drawing:{capabilities:{renderer:'native-border-probe'},animationEnabled:false,elapsedMs:1500}};
 h.preview.draw();assert.equal(h.arcs.length,0);
 assert.equal(h.pixel(300.5,8.5).toUpperCase(),'#728BFF');assert.equal(h.pixel(482.5,96.5).toUpperCase(),'#728BFF');
 assert.equal(h.pixel(180.5,184.5).toUpperCase(),'#65D9BC');assert.equal(h.pixel(8.5,96.5).toUpperCase(),'#65D9BC');
 assert.ok(!h.layers.includes('#EFB86C'));assert.ok(!h.layers.includes('#94B5FF'));assert.ok(!h.layers.includes('#E8F9FF'));
 const before=[...h.layers];h.setTime(5001);h.preview.draw();assert.deepEqual(h.layers,before);
 h.state.bandPage=1;h.state.runtime.metrics={sampledAt:5001,cpu:42};h.state.runtime.lastAckAt=5001;
 h.preview.draw();assert.ok(h.arcs.length>0);assert.ok(h.texts.includes('42%'));
});

test('legacy native preview breathes without mutating its cached task palette',t=>{
 const h=harness(t);h.setTime(1);h.state.runtime.lastAckAt=1;h.state.runtime.agent.state='idle';
 h.state.runtime.ack={mode:'idle',drawing:{capabilities:{renderer:'native-geometry'},elapsedMs:0}};
 h.preview.draw();const dim=h.pixel(245.5,8.5);
 h.state.runtime.ack.drawing.elapsedMs=2000;h.preview.draw();const bright=h.pixel(245.5,8.5);
 assert.notEqual(bright,dim);assert.ok(parseInt(bright.slice(1,3),16)>parseInt(dim.slice(1,3),16));
 h.state.runtime.ack.drawing.elapsedMs=0;h.preview.draw();assert.equal(h.pixel(245.5,8.5),dim);
 h.state.runtime.ack.drawing.animationEnabled=false;h.preview.draw();const still=h.pixel(245.5,8.5);
 h.state.runtime.ack.drawing.elapsedMs=2000;h.preview.draw();assert.equal(h.pixel(245.5,8.5),still);
 assert.equal(still.toUpperCase(),'#728BFF');
});
