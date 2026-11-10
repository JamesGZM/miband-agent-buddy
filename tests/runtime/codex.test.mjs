import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createCodexState} from '../../services/runtime/src/core/codex-state.mjs';
import {sanitizeHook,forwardHook} from '../../services/runtime/bin/codex-hook.mjs';
import {createHookServer} from '../../services/runtime/src/adapters/hook-server.mjs';
const session='a'.repeat(64);
test('official lifecycle maps to states, completion settles, active sessions win',()=>{
 let now=1000;const state=createCodexState({now:()=>now});
 assert.equal(state.status().connected,false);
 for(const [event,mode] of [['UserPromptSubmit','thinking'],['PreToolUse','working'],['PermissionRequest','attention'],['PostToolUse','thinking'],['Stop','complete']]){
  state.accept({event,session,at:++now});assert.equal(state.status().state,mode);
 }
 state.accept({event:'PreToolUse',session:'b'.repeat(64),at:++now});assert.equal(state.status().state,'working');
 state.accept({event:'SessionEnd',session:'b'.repeat(64),at:++now});assert.equal(state.status().state,'complete');
 now+=4001;assert.equal(state.status().state,'idle');
 state.accept({event:'PermissionRequest',session,at:++now});now+=900001;assert.equal(state.status().state,'attention');assert.equal(state.status().activeSessions,1);assert.equal(state.status().stale,true);
});
test('reject unknown/malformed/stale events and ignore out-of-order delivery',()=>{
 const s=createCodexState({now:()=>1000});
 assert.throws(()=>s.accept({event:'Fake',session,at:1000}));assert.throws(()=>s.accept({event:'Stop',session,at:999999}));
 s.accept({event:'Stop',session,at:1000});s.accept({event:'PreToolUse',session,at:999});assert.equal(s.status().state,'complete');
});
test('hook strips transcript, prompt, paths and tool contents before sending',()=>{
 const msg=sanitizeHook({hook_event_name:'Stop',session_id:'private-id',prompt:'secret',cwd:'/private',transcript_path:'/private/log',tool_input:{token:'secret'}},'Stop',10);
 assert.deepEqual(Object.keys(msg).sort(),['at','event','session']);assert.equal(msg.session.length,64);assert.ok(!JSON.stringify(msg).includes('private'));
 assert.throws(()=>sanitizeHook({hook_event_name:'Stop',session_id:'a'},'PreToolUse'));
});
test('local hook reaches service and drives band mode; browser writes rejected',async t=>{
 const agent=createCodexState();const server=createHookServer(agent);
 t.after(()=>{server.closeAllConnections();server.close();});server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`;
 await forwardHook({hook_event_name:'PreToolUse',session_id:'test'},'PreToolUse',{endpoint:base+'/api/codex-event'});
 assert.equal(agent.status().state,'working');assert.equal(agent.status().eventCount,1);
 assert.equal((await fetch(base+'/api/codex-event',{method:'POST',headers:{Origin:'https://example.com','X-Band-Codex':'1'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/codex-event',{method:'POST',body:'{}'})).status,403);
 assert.equal((await fetch(base+'/api/codex-event',{method:'POST',headers:{'X-Band-Codex':'1'},body:'{}'})).status,400);
 await assert.rejects(forwardHook({},'Stop',{endpoint:'https://example.com'}));
});
