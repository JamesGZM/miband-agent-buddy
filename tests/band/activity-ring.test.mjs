import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),ring=require('../../packages/buddy-shared/presentation/activity-ring.js'),g=require('../../packages/buddy-shared/presentation/geometry.js');
const counts=thinking=>({thinking,working:0,attention:0});
test('concurrent colors divide precisely the original capsule circumference',()=>{
 for(const theme of ['chatgpt','claude','deepseek'])for(let total=2;total<=6;total++){
  const f=g.frame({theme,mode:'attention',counts:counts(total),seconds:0});
  for(let slot=0;slot<total;slot++){
   const color=g.shade(slot?ring.palettes[theme][slot]:'#FFBD64',.32);
   const length=f.rects.filter(r=>r.color===color).reduce((n,r)=>n+r.width-r.height,0)+f.arcs.filter(a=>a.color===color).reduce((n,a)=>n+a.radius*a.total*Math.PI/180,0);
   assert.ok(Math.abs(length-(596+2*Math.PI*88)/total)<.00001);
  }
 }
});
test('malformed counts and stale snapshots cannot add task colors',()=>{
 for(const c of [null,{},counts(-1),counts(129),counts(1.5),counts(NaN),{thinking:1,working:0}])assert.equal(ring.count(c,false),0);
 assert.equal(ring.count(counts(4),true),0);assert.equal(ring.count({thinking:1,working:2,attention:1},false),4);
 for(const stale of [false,true]){
  const f=g.frame({theme:'claude',mode:'idle',counts:counts(4),stale});assert.ok(!f.arcs.some(a=>a.color===g.shade(ring.palettes.claude[1],.32)));
 }
 assert.deepEqual(g.frame({mode:'attention',counts:counts(128)}),g.frame({mode:'attention',counts:counts(6)}));
});
test('native concurrent animation keeps highlight topology fixed across the whole path',()=>{
 for(const theme of ['chatgpt','claude','deepseek'])for(const mode of ['thinking','working'])for(let total=1;total<=6;total++){
  let ids;
  for(let tick=0;tick<240;tick++){
   const scene=g.portrait(g.frame({native:true,theme,mode,counts:counts(total),seconds:tick/10}));
   const next=[scene.rects,scene.arcs,scene.capsules].map(list=>list.map(shape=>shape.id));
   if(ids)assert.deepEqual(next,ids,`${theme}/${mode}/${total}: animation changed native topology`);else ids=next;
   assert.ok(scene.arcs.length<=10);
   for(const list of [scene.rects,scene.arcs,scene.capsules])assert.equal(new Set(list.map(shape=>shape.id)).size,list.length);
   for(const shape of [...scene.rects,...scene.arcs])if(shape.visible!==false){
    assert.ok(shape.width>0);
    if(shape.total!=null)assert.ok(shape.total>0&&shape.total<=180.000001);
   }
  }
 }
});
test('cached ring layouts preserve colors and invalidate on task, theme and mode changes',()=>{
 const draw=g.createRenderer(),other=g.createRenderer();
 for(const native of [true,false])for(const theme of ['chatgpt','claude','deepseek'])for(const total of [2,6,1,3,128])for(const mode of ['working','thinking','attention','offline','complete','idle']){
  for(const seconds of [0,.1,1,2.4,4,0]){
   const state={native,theme,mode,counts:counts(total),seconds};
   const actual=draw(state),expected=g.frame(state);assert.deepEqual(actual,expected);
   if(native){g.portrait(actual);assert.deepEqual(draw(state),expected,'portrait projection mutated a cached path');}
   assert.deepEqual(other(state),expected,'renderer cache escaped its owner');
  }
 }
 for(const stale of [true,false])for(const still of [true,false]){
  const state={native:true,theme:'claude',mode:'working',counts:counts(4),seconds:1,stale,still};
  assert.deepEqual(draw(state),g.frame(state));
 }
 const before=draw({native:true,mode:'working',counts:counts(2),seconds:1});
 const frozen=JSON.stringify(before);draw({native:true,mode:'attention',counts:counts(6),seconds:3});
 assert.equal(JSON.stringify(before),frozen,'a later frame mutated an earlier scene');
});
test('fixed native highlights preserve the original stroke at every loading position',()=>{
 const ui=require('../../packages/buddy-shared/presentation/native-ui.js');
 for(const mode of ['thinking','working'])for(let step=0;step<96;step++){
  const seconds=(step+.001)/(mode==='working'?24:12),pose=ui.pose(mode,seconds);
  const scene=g.frame({native:true,mode,seconds});
  for(const [color,tip] of [['#94B5FF',false],['#E8F9FF',true]]){
   const expected={rects:[],arcs:[],capsules:[],rings:0};
   for(let n=0;n<pose.highlights;n++)g.ring(expected,8,7,color,pose.start+n*.5+(tip?pose.fraction-.025:0),tip?.025:pose.fraction);
   const actualArcs=scene.arcs.filter(shape=>shape.color===color&&shape.visible!==false);
   assert.equal(actualArcs.length,expected.arcs.length);
   for(let i=0;i<actualArcs.length;i++)for(const key of ['left','top','size','center','radius','start','total','width'])assert.ok(Math.abs(actualArcs[i][key]-expected.arcs[i][key])<1e-9,key);
   const actualRects=scene.rects.filter(shape=>shape.color===color&&shape.visible!==false);
   for(const rect of expected.rects)assert.ok(actualRects.some(actual=>actual.top===rect.top&&actual.height===rect.height&&actual.left<=rect.left&&actual.left+actual.width>=rect.left+rect.width));
   for(const rect of actualRects){
    const fragments=expected.rects.filter(piece=>piece.top===rect.top&&piece.left>=rect.left&&piece.left+piece.width<=rect.left+rect.width);
    assert.ok(fragments.length);assert.equal(Math.min(...fragments.map(piece=>piece.left)),rect.left);
    assert.equal(Math.max(...fragments.map(piece=>piece.left+piece.width)),rect.left+rect.width);
   }
  }
 }
});
test('production template contains geometry without bitmap animation or diagnostic labels',()=>{
 const s=readFileSync(new URL('../../apps/band/src/pages/index/index.ux',import.meta.url),'utf8');
 assert.match(s,/<stack class="outlines">\s*<div for="\{\{ drawCapsules \}\}"/);
 assert.match(s,/drawCapsules[^>]*>[\s\S]*?<\/stack>\s*<div for="\{\{ drawRects \}\}"/);
 assert.doesNotMatch(s.match(/\.stage \{[^}]+\}/)[0],/transform/);
 assert.match(s,/drawRects/);assert.match(s,/drawArcs/);assert.match(s,/<progress[^>]+type="arc"/);
 assert.doesNotMatch(s,/<image|activity-count|activity-label|CODE|probePercent|dotLeft/);
});
test('host compilation selects task colors and native rendering consumes the prepared result',()=>{
 for(const theme of ['chatgpt','claude','deepseek'])for(let total=1;total<=6;total++)for(const mode of ['thinking','working','attention','idle','complete']){
  const colors=ring.colors(theme,mode,counts(total));
  assert.equal(colors.length,['thinking','working','attention'].includes(mode)?total:1);
  assert.equal(colors[0],mode==='attention'?'#FFBD64':mode==='complete'?'#77EDBD':ring.palettes[theme][0]);
  const input={native:true,theme,mode,seconds:1};
  assert.deepEqual(g.frame({...input,colors}),g.frame({...input,counts:counts(total)}));
 }
 const state={native:true,mode:'working',colors:['#123456','#ABCDEF'],seconds:1};
 Object.defineProperty(state,'counts',{get(){assert.fail('renderer aggregated AI sessions');}});
 assert.ok(g.createRenderer()(state).arcs.length);
});
test('band and browser execute identical canonical geometry',async()=>{
 const consumers=[require('../../apps/band/src/common/generated/geometry.js'),(await import('../../apps/desktop/ui/assets/geometry.mjs')).default];
 for(const consumer of consumers)for(const theme of ['chatgpt','claude','deepseek'])for(const mode of ['thinking','working','attention','offline'])for(const page of [0,1]){
  const input={theme,mode,page,seconds:1.5,counts:counts(4),values:{disk:77,memory:50,cpu:30}};
  assert.deepEqual(consumer.frame(input),g.frame(input));
 }
});
