import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeHarness,ack} from '../helpers/runtime.mjs';
async function setup({active=true,keep=true,visible=1}={}){
  let awake=true;
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='launch_buddy'){awake=true;child.later({event:'result',id:c.id,ok:true});}
    if(c.op==='ping')child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot'&&awake)child.later(ack(c.payload,{keepScreen:'on',wakeDisplay:{id:c.payload.wakeId,remainingMs:20000},capabilities:{activityHold:true},pageLifecycle:{visible}}));
  }});
  await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:keep}});
  await h.connect();if(active)h.hook('UserPromptSubmit');await h.clock.advance(18000);
  h.children[0].event({event:'battery',percent:60,charging:false});
  return {...h,get state(){return h.state;},hide(){awake=false;},cover(){visible=0;},launches:()=>h.calls.filter(c=>c.op==='launch_buddy').length};
}
test('charging overlay gets one deferred task recovery; repeated samples never relaunch periodically',async t=>{
  const h=await setup();t.after(()=>h.runtime.stop());const before=h.launches();h.hide();
  h.children[0].event({event:'battery',percent:60,charging:true});
  await h.clock.advance(1999);assert.equal(h.launches(),before);
  h.children[0].event({event:'battery',percent:60,charging:true});
  await h.clock.advance(1);assert.equal(h.launches(),before+1);
  await h.clock.advance(6000);assert.equal(h.state.connection,'connected');
  for(let i=0;i<10;i++){h.children[0].event({event:'battery',percent:61,charging:true});await h.clock.advance(6000);}
  assert.equal(h.launches(),before+1);
});
for(const variant of ['paused','disabled','idle','hidden','unplugged','disconnect'])test(`charging recovery respects ${variant}`,async t=>{
  const h=await setup({active:variant!=='idle',keep:variant!=='disabled',visible:variant==='hidden'?0:1});t.after(()=>h.runtime.stop());
  if(variant==='paused')await h.runtime.dispatch({op:'pause',value:true});
  const before=h.launches();h.children[0].event({event:'battery',percent:60,charging:true});
  if(variant==='unplugged')h.children[0].event({event:'battery',percent:60,charging:false});
  if(variant==='disconnect')await h.runtime.dispatch({op:'disconnect'});
  await h.clock.advance(6000);assert.equal(h.launches(),before);
});

test('charging can recover a previously visible Buddy after its hidden ACK and a long overlay',async t=>{
  const h=await setup();t.after(()=>h.runtime.stop());h.cover();await h.clock.advance(4000);
  assert.equal(h.state.ack.pageLifecycle.visible,0);h.hide();await h.clock.advance(130000);
  const before=h.launches();h.children[0].event({event:'battery',percent:60,charging:true});
  await h.clock.advance(4000);assert.equal(h.launches(),before+1);
});
