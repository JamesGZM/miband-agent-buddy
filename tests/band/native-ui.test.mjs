import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),ui=require('../../packages/buddy-shared/presentation/native-ui.js');
test('all native loading frames and percentage layers exist',()=>{
 for(const mode of ['idle','thinking','working','attention','complete','sleep','offline','error'])for(let t=0;t<9;t+=.1){
  const m=ui.motion(mode,t);for(const field of ['ringSource','loadingSource','symbolSource'])assert.ok(existsSync(new URL('../../apps/band/src'+m[field],import.meta.url)));
  // Bound opacity/offset styles do not repaint on the band; motion must live in image sources.
  assert.equal(m.ringOpacity,1);assert.equal(m.loadingOpacity,1);assert.equal(m.symbolLeft,0);
 }
 for(const name of ['cpu','memory','disk'])for(let value=0;value<=100;value++)assert.ok(existsSync(new URL('../../apps/band/src'+ui.ringSource(name,value),import.meta.url)));
});
test('only the three thumbnail still rings ship alongside animated frames',()=>{
 const has=name=>existsSync(new URL('../../apps/band/src/common/capsule/'+name+'.png',import.meta.url));
 for(const prefix of ['', 'claude-', 'deepseek-']){
  assert.ok(has(prefix+'ring-idle'));
  for(const mode of ['thinking','working','attention','complete','error','sleep','offline'])assert.equal(has(prefix+'ring-'+mode),false);
 }
 for(const theme of ['chatgpt','claude','deepseek'])for(const variant of ['active','attention'])for(let count=2;count<=6;count++)assert.equal(has('activity-'+theme+'-'+variant+'-'+count),false);
});
test('breathing and loading progress together, but offline still breathes',()=>{
 const a=ui.motion('thinking',0),b=ui.motion('thinking',1);
 assert.notEqual(a.ringSource,b.ringSource);assert.notEqual(a.loadingSource,b.loadingSource);
 assert.notEqual(ui.motion('offline',0).ringSource,ui.motion('offline',2).ringSource);
 const idle=new Set(),nudges=new Set();for(let t=0;t<4;t+=.01){const m=ui.motion('idle',t);idle.add(m.ringSource);nudges.add(m.symbolSource);}
 assert.equal(idle.size,32);assert.equal(nudges.size,17);
 assert.equal(ui.gesture(40,4),'exit');assert.equal(ui.gesture(2,-30),'monitor');assert.equal(ui.gesture(2,30),'pet');assert.equal(ui.gesture(5,8),null);
});
test('shared breathing level matches the main ring phase for every state',()=>{
 for(const mode of ['idle','thinking','working','attention','complete','sleep','offline','error'])for(let time=0;time<8;time+=.07){
  const level=ui.breathLevel(mode,time);
  assert.ok(Number.isInteger(level)&&level>=0&&level<32);
  assert.match(ui.motion(mode,time).ringSource,new RegExp('-b'+level+'\\.png$'));
 }
});
test('active states reuse the idle artwork while retaining their own phase and loading motion',()=>{
 for(const theme of ['chatgpt','claude','deepseek'])for(const mode of ['thinking','working']){
  const prefix=theme==='chatgpt'?'':theme+'-';
  for(let level=0;level<32;level++)assert.equal(existsSync(new URL('../../apps/band/src/common/capsule/'+prefix+'ring-'+mode+'-b'+level+'.png',import.meta.url)),false);
  const time=.5,active=ui.motion(mode,time,theme),idle=ui.motion('idle',time,theme);
  assert.match(active.ringSource,new RegExp('/'+prefix+'ring-idle-b'+ui.breathLevel(mode,time)+'\\.png$'));
  assert.notEqual(active.ringSource,idle.ringSource,'active breathing keeps its distinct period');
  assert.match(active.loadingSource,new RegExp('/'+prefix+mode+'-'));
  assert.notEqual(active.symbolSource,idle.symbolSource,'active center motion keeps its distinct period');
 }
});
test('every live state animates the center for every theme, with smooth and reduced cadences',()=>{
 assert.equal(ui.frameDelay(false),1000/30);assert.equal(ui.frameDelay(true),200);assert.equal(ui.frameDelay(undefined),1000/30);
 for(const theme of ['chatgpt','claude','deepseek'])for(const mode of ['idle','thinking','working','attention','complete','sleep','error']){
  const symbols=new Set();for(let t=0;t<6;t+=.01)symbols.add(ui.motion(mode,t,theme).symbolSource);
  assert.equal(symbols.size,17,`${theme}/${mode} moves the center`);
 }
 for(const mode of ['thinking','working']){
  const frames=new Set();for(let t=0;t<8;t+=.01)frames.add(ui.motion(mode,t).loadingSource);
  assert.equal(frames.size,96);
 }
});
test('smoother artwork contains actual intermediate pixels rather than duplicate frame names',()=>{
 const hash=name=>createHash('sha256').update(readFileSync(new URL('../../apps/band/src/common/capsule/'+name,import.meta.url))).digest('hex');
 for(const prefix of ['', 'claude-', 'deepseek-']){
  assert.equal(new Set(Array.from({length:17},(_,i)=>hash(prefix+'symbols-x'+i+'.png'))).size,17);
  assert.equal(new Set(Array.from({length:32},(_,i)=>hash(prefix+'ring-idle-b'+i+'.png'))).size,32);
  for(const mode of ['thinking','working']){
   const frames=Array.from({length:96},(_,i)=>hash(prefix+mode+'-'+String(i).padStart(2,'0')+'.png'));
   // Two opposite highlights can repeat after half a turn; adjacent poses must differ.
   assert.ok(new Set(frames).size>=48);
   for(let i=1;i<frames.length;i++)assert.notEqual(frames[i],frames[i-1]);
  }
 }
});

test('ring transition retargets continuously, never overshoots and finishes in bounded time',()=>{
 const s=ui.createRingTransition();ui.retargetRing(s,10,1000,true);ui.retargetRing(s,90,2000,false);
 let previous=10;for(let t=2000;t<=2900;t+=50){const v=ui.ringValue(s,t);assert.ok(v>=previous&&v<=90);previous=v;}
 const middle=ui.ringValue(s,2450);ui.retargetRing(s,5,2450,false);assert.equal(ui.ringValue(s,2450),middle);
 assert.equal(ui.ringValue(s,3350),5);assert.equal(ui.ringMoving(s,3350),false);
 ui.retargetRing(s,0,3400,true);assert.equal(ui.ringValue(s,3400),0);assert.equal(ui.ringMoving(s,3400),false);
});
test('both Buddy themes provide every activity state without changing timing',()=>{for(const mode of ['idle','thinking','working','attention','complete','sleep','offline','error'])for(const time of [0,1,3,7]){const a=ui.motion(mode,time,'chatgpt'),b=ui.motion(mode,time,'claude');assert.equal(a.ringOpacity,b.ringOpacity);for(const k of ['ringSource','symbolSource','loadingSource'])assert.ok(existsSync(new URL('../../apps/band/src'+b[k],import.meta.url)),b[k]);assert.notEqual(a.symbolSource,b.symbolSource);}});
test('DeepSeek theme ships its own ring, loading and whale frames for every state',()=>{
 for(const mode of ['idle','thinking','working','attention','complete','sleep','offline','error'])for(let t=0;t<9;t+=.25){
  const m=ui.motion(mode,t,'deepseek');
  for(const k of ['ringSource','symbolSource','loadingSource']){assert.ok(existsSync(new URL('../../apps/band/src'+m[k],import.meta.url)),m[k]);if(m[k]!=='/common/capsule/blank.png')assert.match(m[k],/\/deepseek-/);}
 }
});
