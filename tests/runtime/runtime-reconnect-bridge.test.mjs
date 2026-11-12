import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeHarness,ack} from '../helpers/runtime.mjs';

async function setup({maximum=120000,respond=true,visible=1}={}) {
  let active=false,newSnapshots=0;
  const h=runtimeHarness({onWrite(c,child){
    if(c.op==='launch_buddy')child.later({event:'result',id:c.id,ok:true});
    if(c.op==='snapshot'){
      const reconnect=h.children.length>1;
      if(reconnect){newSnapshots++;if(!respond)return;}
      const foreground=!reconnect||visible===1;
      if(foreground && c.payload.activityHoldMs!=null)active=c.payload.activityHoldMs>0;
      child.later({event:'buddy',installed:true,versionCode:33});
      child.later(ack(c.payload,{keepScreen:foreground?'on':'off',
        pageLifecycle:{visible:foreground?1:0},
        wakeDisplay:{id:c.payload.wakeId,active:foreground&&active,remainingMs:active?120000:20000},
        capabilities:{activityHold:true,...(maximum==null?{}:{maxActivityHoldMs:maximum})}}));
    }
  }});
  await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:true}});
  await h.connect();h.hook('UserPromptSubmit');await h.clock.advance(14000);
  assert.equal(h.state.connection,'connected');
  return {...h,get state(){return h.state;},newSnapshots:()=>newSnapshots,
    async reconnect(){h.children[0].kill();await h.clock.advance(2000);h.children.at(-1).event({event:'authenticated'});},
    launches:()=>h.calls.filter(c=>c.op==='launch_buddy').length};
}

test('bridged active Buddy answers its first new-link snapshot without reopening the page',async t=>{
  const h=await setup();t.after(()=>h.runtime.stop());const before=h.launches();
  await h.reconnect();await h.clock.advance(2000);
  assert.equal(h.newSnapshots(),1,'initial inventory must not discard the first fresh ACK');
  assert.equal(h.state.connection,'connected');
  await h.clock.advance(30000);assert.equal(h.launches(),before);
});

test('missing reconnect snapshot response still authorizes one bounded fallback wake',async t=>{
  const h=await setup({respond:false});t.after(()=>h.runtime.stop());const before=h.launches();
  await h.reconnect();await h.clock.advance(6000);assert.equal(h.launches(),before);
  await h.clock.advance(60000);assert.equal(h.launches(),before+1);
});

test('older Buddy keeps the existing immediate active reconnect wake',async t=>{
  const h=await setup({maximum:null});t.after(()=>h.runtime.stop());const before=h.launches();
  await h.reconnect();await h.clock.advance(2000);assert.equal(h.launches(),before+1);
});

test('a negotiated 60-second activity hold retains the immediate reconnect wake',async t=>{
  const h=await setup({maximum:60000});t.after(()=>h.runtime.stop());
  assert.equal(h.calls.filter(c=>c.op==='snapshot').at(-1).payload.activityHoldMs,60000);
  const before=h.launches();await h.reconnect();await h.clock.advance(2000);
  assert.equal(h.launches(),before+1);
});

test('a fresh hidden-page receipt cancels fallback instead of reopening a user-hidden Buddy',async t=>{
  const h=await setup({visible:0});t.after(()=>h.runtime.stop());const before=h.launches();
  await h.reconnect();await h.clock.advance(30000);assert.equal(h.launches(),before);
});

for(const action of ['stop','disable','pause','reset','disconnect','install','manual'])test(`pending bridge fallback yields to ${action}`,async t=>{
  const h=await setup({respond:false});t.after(()=>h.runtime.stop());await h.reconnect();
  const from=h.states.length;
  if(action==='stop')h.hook('Stop');
  else if(action==='disable')await h.runtime.dispatch({op:'configure',settings:{activityKeepAwake:false}});
  else if(action==='pause')await h.runtime.dispatch({op:'pause',value:true});
  else if(action==='reset')await h.runtime.dispatch({op:'reset_activity'});
  else if(action==='manual')await h.runtime.dispatch({op:'wake',request:'fixture-user'});
  else await h.runtime.dispatch({op:action});
  await h.clock.advance(30000);
  assert.ok(h.states.slice(from).every(s=>s.wake?.reason!=='activity_reconnect'));
});
