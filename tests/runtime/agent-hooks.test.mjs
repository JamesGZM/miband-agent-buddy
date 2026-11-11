import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sanitizeAgentHook, forwardAgentHook, CLAUDE_EVENTS} from '../../services/runtime/src/adapters/agent-hook.mjs';
import {sanitizeHook} from '../../services/runtime/src/adapters/codex-hook.mjs';
import {createCodexState} from '../../services/runtime/src/core/codex-state.mjs';
import {createHookServer} from '../../services/runtime/src/adapters/hook-server.mjs';

test('providers share the private event contract without sharing session identities', () => {
  const input = {hook_event_name:'Stop',session_id:'synthetic-session',prompt:'synthetic-private-text',
    transcript_path:'/synthetic/private',tool_input:{value:'synthetic-private-text'}};
  const codex = sanitizeHook(input, 'Stop', 1000);
  const claude = sanitizeAgentHook(input, 'claude-code', 'Stop', 1000);
  const deepseek = sanitizeAgentHook(input, 'deepseek', 'Stop', 1000);
  assert.deepEqual(Object.keys(claude).sort(), ['at','event','session']);
  assert.equal(new Set([codex.session,claude.session,deepseek.session]).size, 3);
  assert.doesNotMatch(JSON.stringify(claude), /synthetic|prompt|transcript|tool_input/);
  assert.deepEqual(claude, sanitizeAgentHook(input, 'claude-code', 'Stop', 1000));
  assert.throws(() => sanitizeAgentHook(input, 'unknown', 'Stop'));
  assert.throws(() => sanitizeAgentHook(input, 'claude-code', 'PreToolUse'));
  assert.throws(() => sanitizeAgentHook(null, 'claude-code', 'Stop'));
});

test('Claude lifecycle maps failed turns to idle and failed tools back to thinking', () => {
  let now = 1000;
  const state = createCodexState({now:()=>now});
  for (const [event, mode] of [['UserPromptSubmit','thinking'],['PreToolUse','working'],
    ['PostToolUseFailure','thinking'],['PermissionRequest','attention'],['StopFailure','idle']]) {
    state.accept(sanitizeAgentHook({hook_event_name:event,session_id:'synthetic-session'}, 'claude-code', event, ++now));
    assert.equal(state.status().state, mode);
  }
  assert.ok(!CLAUDE_EVENTS.includes('Interrupt'));
  assert.throws(() => sanitizeAgentHook({hook_event_name:'StopFailure',session_id:'s'}, 'deepseek', 'StopFailure'));
});

test('nested Claude agents cannot replace the main conversation status', () => {
  const state = createCodexState({now:()=>1000});
  const input = {hook_event_name:'PermissionRequest',session_id:'main-session'};
  state.accept(sanitizeAgentHook(input,'claude-code','PermissionRequest',1000));
  for (const event of ['PreToolUse','PostToolUse','Stop']) {
    assert.throws(()=>sanitizeAgentHook({...input,hook_event_name:event,agent_id:'child-agent'},'claude-code',event,1000),/Nested agent ignored/);
  }
  assert.equal(state.status().state,'attention');
  assert.equal(state.status().activeSessions,1);
});

test('stale work remains active with diagnostic counts, and reset retains delivery evidence', () => {
  let now = 1000;
  const state = createCodexState({now:()=>now});
  const send = (id,event) => state.accept(sanitizeAgentHook({hook_event_name:event,session_id:id},'custom',event,now));
  send('first','UserPromptSubmit');
  now += 15*60*1000;
  assert.equal(state.status().freshActiveSessions,1);
  now++;
  assert.equal(state.status().state,'thinking');
  assert.equal(state.status().activeSessions,1);
  assert.equal(state.status().freshActiveSessions,0);
  assert.equal(state.status().staleSessions,1);
  send('second','PermissionRequest');
  assert.equal(state.status().state,'attention');
  assert.equal(state.status().freshActiveSessions,1);
  assert.equal(state.status().staleSessions,1);
  assert.equal(state.status().stale,true);
  const {eventCount,lastEventAt} = state.status();
  state.reset(); state.reset();
  assert.equal(state.status().state,'idle');
  assert.equal(state.status().activeSessions,0);
  assert.equal(state.status().freshActiveSessions,0);
  assert.equal(state.status().staleSessions,0);
  assert.equal(state.status().stale,false);
  assert.equal(state.status().connected,true);
  assert.deepEqual([state.status().eventCount,state.status().lastEventAt],[eventCount,lastEventAt]);
  send('first','PreToolUse');
  assert.equal(state.status().freshActiveSessions,1);
});

test('concurrent providers retain active work when another provider completes or disconnects', () => {
  let now = 1000;
  const state = createCodexState({now:()=>now});
  const send = (provider,event,id='same-fixture-session') => {
    const input = {hook_event_name:event,session_id:id};
    state.accept(provider === 'codex' ? sanitizeHook(input,event,++now) : sanitizeAgentHook(input,provider,event,++now));
  };
  send('codex','UserPromptSubmit'); send('claude-code','PreToolUse'); send('deepseek','UserPromptSubmit');
  assert.equal(state.status().activeSessions, 3);
  assert.deepEqual(state.status().sessionCounts,{thinking:2,working:1,attention:0});
  send('claude-code','Stop');
  assert.equal(state.status().state, 'thinking');
  assert.equal(state.status().activeSessions, 2);
  send('codex','PermissionRequest'); send('deepseek','Stop');
  assert.equal(state.status().state, 'attention');
  send('claude-code','SessionEnd');
  assert.equal(state.status().state, 'attention');
  assert.equal(state.status().activeSessions, 1);
  assert.deepEqual(state.status().sessionCounts,{thinking:0,working:0,attention:1});
  send('codex','Interrupt');
  assert.equal(state.status().activeSessions, 0);
  assert.deepEqual(state.status().sessionCounts,{thinking:0,working:0,attention:0});
});

test('generic provider reaches the existing loopback receiver', async t => {
  const state = createCodexState();
  const server = createHookServer(state);
  t.after(()=>{server.closeAllConnections();server.close();});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  await forwardAgentHook({hook_event_name:'UserPromptSubmit',session_id:'fixture'}, 'deepseek', 'UserPromptSubmit',
    {endpoint:`http://127.0.0.1:${server.address().port}/api/codex-event`});
  assert.equal(state.status().state,'thinking');
  await assert.rejects(forwardAgentHook({},'custom','Stop',{endpoint:'https://example.com'}));
});

test('hook process fails open and emits no payload or decision for invalid input', async () => {
  const script = fileURLToPath(new URL('../../services/runtime/bin/agent-hook.mjs',import.meta.url));
  const child = spawn(process.execPath,[script,'claude-code','Stop'],{stdio:['pipe','pipe','pipe']});
  let output = '';
  child.stdout.on('data',chunk=>{output+=chunk;}); child.stderr.on('data',chunk=>{output+=chunk;});
  child.stdin.end('{"synthetic-private-text":');
  const [code] = await once(child,'exit');
  assert.equal(code,0); assert.equal(output,'');
});
