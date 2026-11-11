import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createCompletionQueue} from '../../services/runtime/src/core/completion-queue.mjs';
import {runtimeHarness} from '../helpers/runtime.mjs';
const {createPageController}=createRequire(import.meta.url)('../../apps/band/src/controllers/page-controller.js');
test('only observed active-to-Stop transitions notify; queue is bounded, expiring and receipt matched',()=>{
 let now=1000,id=0;const q=createCompletionQueue({now:()=>now,makeId:()=>`notice-${++id}`});
 q.observe({event:'Stop'},{mode:'working'},false);q.observe({event:'Stop'},null,true);
 for(const event of ['PostToolUse','PermissionRequest','Interrupt','SessionEnd'])q.observe({event},{mode:'working'},true);
 q.observe({event:'Stop'},{mode:'complete'},true);assert.equal(q.plan(true),null);
 for(let i=0;i<150;i++)q.observe({event:'Stop'},{mode:'thinking'},true);
 assert.equal(q.plan(false),null);const first=q.plan(true);assert.equal(first.count,128);
 q.acknowledge({id:first.id,status:'pending'});assert.deepEqual(q.plan(true),first);
 q.acknowledge({id:'wrong',status:'accepted'});assert.deepEqual(q.plan(true),first);
 q.acknowledge({id:first.id,status:'accepted'});assert.equal(q.plan(true),null);
 q.observe({event:'Stop'},{mode:'attention'},true);now+=60000;assert.equal(q.plan(true),null);
 q.observe({event:'Stop'},{mode:'working'},true);q.clear();assert.equal(q.plan(true),null);
});
function system({supported=true,dropReceipt=false,modesSupported=true}={}) {
 const storage=new Map(),pulses=[],sent=[];let page,child,drop=dropReceipt;
 const channel={send:c=>{if(!modesSupported)delete c.data.capabilities.completionVibrationModes;sent.push(c.data);if(c.data.completion&&drop){drop=false;return;}child.later({event:'ack',ack:c.data});}};
 const h=runtimeHarness({onWrite(command,target){
  child=target;
  if(command.op==='launch_buddy'){page.onShow();target.later({event:'result',id:command.id,ok:true});}
  if(command.op==='ping')target.later({event:'result',id:command.id,ok:true});
  if(command.op==='snapshot')channel.onmessage({data:JSON.stringify(command.payload)});
 }});
 function mount(){
  const controller=createPageController({
   interconnect:{instance:()=>channel},application:{terminate(){}},brightness:{setKeepScreenOn:c=>c.success()},
   storage:{get:c=>c.success(storage.get(c.key)??c.default??''),set:c=>{storage.set(c.key,c.value);c.success();}},
   ...(supported?{vibrator:{vibrate:c=>pulses.push({at:h.clock.now(),...c})}}:{}),
   now:h.clock.now,schedule:h.clock.schedule,cancel:h.clock.cancel,
  });page=Object.assign({},controller,controller.private);page.onInit();page.onShow();
 }
 mount();
 const hook=(event,session='a')=>h.runtime.acceptHook({event,session:session.repeat(64),at:h.clock.now()});
 return {...h,get state(){return h.state;},pulses,sent,hook,reload(){page.onDestroy();mount();},snapshots:()=>h.calls.filter(c=>c.op==='snapshot').map(c=>c.payload),async close(){page.onDestroy();await h.runtime.stop();}};
}
test('end-to-end: default off, each AI finishes independently, retries and restart never repeat a pulse',async t=>{
 const h=system({dropReceipt:true});t.after(()=>h.close());await h.connect();await h.clock.advance(7000);
 h.hook('UserPromptSubmit');h.hook('Stop');await h.clock.advance(4000);assert.equal(h.pulses.length,0);
 await h.runtime.dispatch({op:'configure',settings:{completionVibration:true},request:'vibration-on'});await h.clock.advance(6000);
 assert.equal(h.state.operation.status,'done');assert.equal(h.state.ack.completionVibration,true);
 h.hook('UserPromptSubmit','a');h.hook('PreToolUse','a');h.hook('UserPromptSubmit','b');h.hook('Stop','a');
 await h.clock.advance(4000);assert.equal(h.pulses.length,1);assert.equal(h.state.agent.activeSessions,1);
 h.reload();h.children.at(-1).kill();await h.clock.advance(3000);h.children.at(-1).event({event:'authenticated'});
 await h.clock.advance(42000);assert.equal(h.pulses.length,1);
 h.hook('Stop','b');await h.clock.advance(4000);assert.equal(h.pulses.length,2);
 h.hook('Stop','b');await h.clock.advance(4000);assert.equal(h.pulses.length,2);
 h.hook('UserPromptSubmit','c');h.hook('Interrupt','c');h.hook('Stop','c');await h.clock.advance(4000);assert.equal(h.pulses.length,2);
});
test('simultaneous completions keep their count; turning off and legacy bands stay quiet',async t=>{
 const h=system();t.after(()=>h.close());await h.connect();await h.clock.advance(7000);
 await h.runtime.dispatch({op:'configure',settings:{completionVibration:true}});await h.clock.advance(4000);
 for(const session of ['a','b','c']){h.hook('UserPromptSubmit',session);h.hook('Stop',session);}
 await h.clock.advance(6000);assert.equal(h.pulses.length,3);assert.ok(h.pulses.every(p=>p.mode==='short'));
 assert.ok(h.snapshots().some(p=>p.completion?.count===3));
 await h.runtime.dispatch({op:'configure',settings:{completionVibration:false}});h.hook('UserPromptSubmit');h.hook('Stop');await h.clock.advance(6000);assert.equal(h.pulses.length,3);
 const old=system({supported:false});t.after(()=>old.close());await old.connect();await old.clock.advance(7000);
 await old.runtime.dispatch({op:'configure',settings:{completionVibration:true},request:'unsupported-vibration'});await old.clock.advance(6000);
 assert.equal(old.state.operation.code,'unsupported');old.hook('UserPromptSubmit');old.hook('Stop');await old.clock.advance(6000);
 assert.ok(old.snapshots().every(p=>p.completion===undefined&&p.completionVibration===undefined));
});
test('disable, pause and reset discard completions not yet delivered',async t=>{
 const h=system();t.after(()=>h.close());await h.connect();await h.clock.advance(7000);
 for(const action of ['disable','pause','reset']){
  await h.runtime.dispatch({op:'configure',settings:{completionVibration:true}});await h.clock.advance(4000);
  h.hook('UserPromptSubmit');h.hook('Stop');
  if(action==='disable')await h.runtime.dispatch({op:'configure',settings:{completionVibration:false}});
  if(action==='pause')await h.runtime.dispatch({op:'pause',value:true});
  if(action==='reset')await h.runtime.dispatch({op:'reset_activity'});
  await h.clock.advance(6000);assert.equal(h.pulses.length,0,action);
  if(action==='pause'){await h.runtime.dispatch({op:'pause',value:false});await h.clock.advance(4000);assert.equal(h.pulses.length,0);}
 }
});
test('mode operations require capability and durable receipt; events use the saved long mode',async t=>{
 const h=system();t.after(()=>h.close());await h.connect();await h.clock.advance(7000);
 await h.runtime.dispatch({op:'configure',settings:{completionVibrationMode:'long'},request:'long-mode'});await h.clock.advance(6000);
 assert.equal(h.state.operation.status,'done');assert.equal(h.state.ack.completionVibrationMode,'long');
 await h.runtime.dispatch({op:'configure',settings:{completionVibration:true}});await h.clock.advance(4000);
 for(const session of ['a','b']){h.hook('UserPromptSubmit',session);h.hook('Stop',session);}
 await h.clock.advance(7000);assert.deepEqual(h.pulses.map(p=>p.mode),['long','long']);assert.equal(h.pulses[1].at-h.pulses[0].at,2000);
 const old=system({modesSupported:false});t.after(()=>old.close());await old.connect();await old.clock.advance(7000);
 await old.runtime.dispatch({op:'configure',settings:{completionVibrationMode:'long'},request:'legacy-long'});await old.clock.advance(6000);
 assert.equal(old.state.operation.code,'unsupported');assert.ok(old.snapshots().every(p=>p.completionVibrationMode===undefined));
});
