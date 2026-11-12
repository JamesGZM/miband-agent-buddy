import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ui=require('../../packages/buddy-shared/presentation/native-ui.js');
const geometry=require('../../packages/buddy-shared/presentation/geometry.js');
test('code poses retain all breathing, center motion and loading steps at original cadences',()=>{
 assert.equal(ui.frameDelay(false),100);assert.equal(ui.bandFrameDelay(false),100);assert.equal(ui.bandFrameDelay(true),100);assert.equal(ui.frameDelay(true),100);
 for(const mode of ['idle','thinking','working','attention','complete','sleep','offline','error']){
  const levels=new Set(),offsets=new Set(),starts=new Set();
  for(let t=0;t<12;t+=.01){const p=ui.pose(mode,t);levels.add(p.level);offsets.add(p.offset);starts.add(p.start);assert.equal(p.level,ui.breathLevel(mode,t));}
  assert.equal(levels.size,32);assert.equal(offsets.size,mode==='offline'?1:17);
  if(mode==='thinking'||mode==='working')assert.equal(starts.size,96);
 }
 assert.equal(ui.pose('working',0).highlights,2);assert.equal(ui.pose('thinking',0).fraction,.24);
 assert.equal(ui.gesture(40,4),'exit');assert.equal(ui.gesture(2,-30),'monitor');assert.equal(ui.gesture(2,30),'pet');assert.equal(ui.gesture(5,8),null);
});
test('every theme and state produces finite bounded geometry without image paths',()=>{
 for(const theme of ['chatgpt','claude','deepseek'])for(const mode of ['idle','thinking','working','attention','complete','sleep','offline','error'])for(let t=0;t<9;t+=.13){
  const frame=geometry.frame({theme,mode,seconds:t});
  assert.ok(frame.rects.length&&frame.arcs.length);assert.doesNotMatch(JSON.stringify(frame),/\.png|CODE|probe/);
  for(const shape of [...frame.rects,...frame.arcs])for(const value of Object.values(shape))if(typeof value==='number')assert.ok(Number.isFinite(value));
  for(const rect of frame.rects){assert.ok(rect.left>=0&&rect.top>=0&&rect.left+rect.width<=490&&rect.top+rect.height<=192);}
  for(const arc of frame.arcs){assert.ok(arc.total>0&&arc.total<=180.000001);assert.ok(arc.radius>=61&&arc.radius<=88);}
 }
});
test('resource rings follow the original three nested capsule paths and clamp values',()=>{
 const f=geometry.frame({page:1,values:{disk:100,memory:50,cpu:200}});
 assert.deepEqual([...new Set(f.arcs.filter(a=>a.width===6).map(a=>a.radius))],[87,74,61]);
 const none=geometry.frame({page:1,values:{disk:-1,memory:NaN}});assert.ok(none.arcs.every(a=>a.width===2.5));
});
test('ring transition retargets continuously, never overshoots and finishes in bounded time',()=>{
 const s=ui.createRingTransition();ui.retargetRing(s,10,1000,true);ui.retargetRing(s,90,2000,false);
 let previous=10;for(let t=2000;t<=2900;t+=50){const v=ui.ringValue(s,t);assert.ok(v>=previous&&v<=90);previous=v;}
 const middle=ui.ringValue(s,2450);ui.retargetRing(s,5,2450,false);assert.equal(ui.ringValue(s,2450),middle);
 assert.equal(ui.ringValue(s,3350),5);assert.equal(ui.ringMoving(s,3350),false);
 ui.retargetRing(s,0,3400,true);assert.equal(ui.ringValue(s,3400),0);assert.equal(ui.ringMoving(s,3400),false);
});

test('native full capsules use one border and immutable glyphs instead of arc/rect batches',()=>{
 for(const theme of ['chatgpt','claude','deepseek']){
  const a=geometry.frame({native:true,theme,mode:'idle',seconds:0}),b=geometry.frame({native:true,theme,mode:'idle',seconds:1});
  assert.equal(a.capsules.length,2);assert.equal(a.arcs.length,0);assert.equal(a.rects.length,0);assert.equal(a.glyphs,b.glyphs);
  assert.equal(a.capsules[0].height,184);assert.equal(a.capsules[0].radius,92);assert.equal(a.capsules[0].stroke,8);
  assert.notEqual(a.glyphLeft,b.glyphLeft);
 }
 const resource=geometry.frame({native:true,page:1,values:{disk:100,memory:50,cpu:42}});
 assert.equal(resource.capsules.length,3);assert.equal(resource.arcs.length,6);assert.equal(resource.glyphs,null);
});
test('native arc outer and inner edges meet both straight strokes and full borders',()=>{
 for(const [inset,width] of [[8,7],[9,6],[22,6],[35,6],[9,2.5]]){
  const partial={rects:[],arcs:[],capsules:[],rings:0};geometry.ring(partial,inset,width,'#ffffff',0,.5);
  const full={rects:[],arcs:[],capsules:[],rings:0};geometry.ring(full,inset,width,'#ffffff');
  const arc=partial.arcs[0],top=partial.rects[0],bottom=partial.rects[1],border=full.capsules[0];
  const cy=arc.top+arc.center;
  assert.equal(arc.width%2,0,'keep native stroke cap radii on integer pixels');
  assert.ok(Number.isInteger(arc.radius-arc.width/2),'align the arc centerline to a pixel');
  // LVGL strokes inwards from the supplied outer radius.
  assert.equal(cy-arc.radius,top.top);assert.equal(cy-arc.radius+arc.width,top.top+top.height);
  assert.equal(cy+arc.radius,bottom.top+bottom.height);assert.equal(cy+arc.radius-arc.width,bottom.top);
  assert.equal(border.top,top.top);assert.equal(border.radius,arc.radius);assert.equal(border.stroke,arc.width);
  assert.equal(border.left+border.radius,96);assert.equal(border.left+border.width-border.radius,394);
  for(const shape of [...partial.rects,...partial.arcs])for(const key of ['left','top','width','height','size','center','radius']){
   if(shape[key]!=null)assert.ok(Number.isInteger(shape[key]),key+' must align to physical pixels');
  }
 }
});

test('native resource paths keep fixed identities and arc geometry across all percentages',()=>{
 let ids;
 for(let value=0;value<=100;value++){
  const f=geometry.frame({native:true,page:1,values:{disk:value,memory:value,cpu:value}});
  const next=[f.rects,f.arcs,f.capsules].map(list=>list.map(x=>x.id));
  if(ids)assert.deepEqual(next,ids);else ids=next;
  assert.equal(f.arcs.length,6);assert.equal(f.capsules.length,3);
  for(const a of f.arcs){assert.equal(a.total,180);assert.ok([0,180].includes(a.start));assert.ok(a.percent>=0&&a.percent<=100);}
  for(let i=0;i<3;i++){
   const track=f.capsules[i],arc=f.arcs[i*2];
   assert.equal(track.top+track.stroke/2,arc.top+arc.center-arc.radius+arc.width/2);
  }
 }
});
test('portrait projection preserves ring geometry without a transformed drawing parent',()=>{
 for(const page of [0,1])for(const theme of ['chatgpt','claude','deepseek']){
  const source=geometry.frame({native:true,page,theme,mode:'working',seconds:1.1,values:{disk:73,memory:86,cpu:25}});
  const expected=JSON.parse(JSON.stringify(source));const actual=geometry.portrait(source);
  for(const list of ['rects','capsules'])for(let i=0;i<actual[list].length;i++){
   const a=actual[list][i],b=expected[list][i];
   assert.equal(a.top,b.left);assert.equal(a.left,192-b.top-b.height);assert.equal(a.width,b.height);assert.equal(a.height,b.width);
  }
  for(let i=0;i<actual.arcs.length;i++){
   const a=actual.arcs[i],b=expected.arcs[i];
   assert.equal(a.left+a.center,192-b.top-b.center);assert.equal(a.top+a.center,b.left+b.center);
   assert.equal(a.start,(b.start+90)%360);assert.equal(a.total,b.total);assert.equal(a.percent,b.percent);
  }
  if(page===0){
   const again=geometry.portrait(geometry.frame({native:true,page,theme,mode:'working',seconds:2}));
   assert.equal(actual.glyphs,again.glyphs);
   for(let i=0;i<actual.glyphs.length;i++)assert.equal(actual.glyphs[i].top,expected.glyphs[i].left);
  }
 }
});
