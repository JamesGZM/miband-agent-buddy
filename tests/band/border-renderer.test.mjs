import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),geometry=require('../../packages/buddy-shared/presentation/geometry.js');
const colors=['#647FFF','#78EDFF','#A192FF','#EBA270','#FFBD64','#76CDB8'];
function contains(window,x,y){return x>=window.left&&x<window.left+window.width&&y>=window.top&&y<window.top+window.height;}
function rounded(x,y,left,top,width,height,radius){
 if(x<left||x>=left+width||y<top||y>=top+height)return false;
 const cx=Math.max(left+radius,Math.min(x,left+width-radius)),cy=Math.max(top+radius,Math.min(y,top+height-radius));
 return (x-cx)**2+(y-cy)**2<=radius**2;
}
test('whole-border task windows cover every border pixel once for one through six colors',()=>{
 for(let count=1;count<=6;count++){
  const scene=geometry.createBorderRenderer().native({native:true,mode:'working',colors:colors.slice(0,count),seconds:0});
  assert.equal(scene.arcs.length+scene.rects.length+scene.capsules.length,0,'pet contour never uses split primitives');
  assert.ok(scene.border.base.length<=8);assert.deepEqual([...new Set(scene.border.base.map(w=>w.color))],colors.slice(0,count));
  for(let y=.5;y<192;y++)for(let x=.5;x<490;x++){
   if(!rounded(x,y,4,4,482,184,92)||rounded(x,y,12,12,466,168,84))continue;
   assert.equal(scene.border.base.filter(w=>contains(w,x,y)).length,1,`${count} colors: uncovered/overlapping pixel ${x},${y}`);
  }
 }
});
test('loading and breathing retain fixed geometry topology across modes, phases and task counts',()=>{
 const draw=geometry.createBorderRenderer();
 for(const count of [1,2,6])for(const theme of ['chatgpt','claude','deepseek']){
  let base,ids;
  for(const mode of ['idle','thinking','working','attention','complete','offline'])for(let tick=0;tick<96;tick++){
   const scene=draw.native({native:true,mode,theme,seconds:tick/12,colors:colors.slice(0,count)}),border=scene.border;
   if(base)assert.equal(border.base,base);base=border.base;
   const next=[...border.bodies,...border.tips].map(w=>w.id);if(ids)assert.deepEqual(next,ids);ids=next;
   assert.equal(border.bodies.length,4);assert.equal(border.tips.length,4);
   assert.equal(border.bodies.some(w=>w.visible),mode==='working'||mode==='thinking');
   for(const window of [...border.base,...border.bodies,...border.tips]){
    assert.ok(window.width>0&&window.height>0);
    assert.ok(window.left>=0&&window.top>=0&&window.left+window.width<=490&&window.top+window.height<=192);
   }
  }
 }
 const a=draw.native({native:true,mode:'thinking',seconds:0,colors}),b=draw.native({native:true,mode:'thinking',seconds:1.6,colors});
 assert.notEqual(a.border.breathColor,b.border.breathColor);assert.notEqual(a.glyphLeft,b.glyphLeft);
 assert.notDeepEqual(a.border.bodies,b.border.bodies);assert.equal(a.border.base,b.border.base);
});
test('border projection, static controls and resources preserve their contracts',()=>{
 const draw=geometry.createBorderRenderer();
 const state={native:true,mode:'working',theme:'chatgpt',colors,seconds:1};
 const logical=draw.native(state),projected=draw.portrait(state);
 for(const name of ['base','bodies','tips'])for(let i=0;i<logical.border[name].length;i++){
  const a=logical.border[name][i],b=projected.border[name][i];
  assert.equal(b.left,192-a.top-a.height);assert.equal(b.top,a.left);assert.equal(b.width,a.height);assert.equal(b.height,a.width);
 }
 assert.equal(draw.portrait({...state,seconds:2}).border.base,projected.border.base);
 const still=draw.native({...state,still:true});assert.equal(still.glyphLeft,0);assert.equal(still.border.breathColor,'rgba(0,0,0,0)');assert.ok(still.border.bodies.every(w=>!w.visible));
 const resources={...state,page:1,values:{disk:73,memory:85,cpu:13}};
 assert.deepEqual(draw.native(resources),geometry.frame(resources));assert.deepEqual(draw.portrait(resources),geometry.portrait(geometry.frame(resources)));
});
