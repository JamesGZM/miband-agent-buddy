import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url),ui=require('../../packages/buddy-shared/presentation/native-ui.js');
test('all native loading frames and percentage layers exist',()=>{
 for(const mode of ['idle','thinking','working','attention','complete','sleep','offline','error'])for(let t=0;t<9;t+=.1){
  const m=ui.motion(mode,t);for(const field of ['ringSource','loadingSource','symbolSource'])assert.ok(existsSync(new URL('../../apps/band/src'+m[field],import.meta.url)));
  // Bound opacity/offset styles do not repaint on the band; motion must live in image sources.
  assert.equal(m.ringOpacity,1);assert.equal(m.loadingOpacity,1);assert.equal(m.symbolLeft,0);
 }
 for(const name of ['cpu','memory','disk'])for(let value=0;value<=100;value++)assert.ok(existsSync(new URL('../../apps/band/src'+ui.ringSource(name,value),import.meta.url)));
});
test('breathing and loading progress together, but offline still breathes',()=>{
 const a=ui.motion('thinking',0),b=ui.motion('thinking',1);
 assert.notEqual(a.ringSource,b.ringSource);assert.notEqual(a.loadingSource,b.loadingSource);
 assert.notEqual(ui.motion('offline',0).ringSource,ui.motion('offline',2).ringSource);
 const idle=new Set(),nudges=new Set();for(let t=0;t<4;t+=.05){const m=ui.motion('idle',t);idle.add(m.ringSource);nudges.add(m.symbolSource);}
 assert.equal(idle.size,8);assert.equal(nudges.size,5);
 assert.equal(ui.gesture(40,4),'exit');assert.equal(ui.gesture(2,-30),'monitor');assert.equal(ui.gesture(2,30),'pet');assert.equal(ui.gesture(5,8),null);
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
