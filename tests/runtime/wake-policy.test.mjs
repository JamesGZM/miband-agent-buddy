import test from 'node:test';
import assert from 'node:assert/strict';
import {createWakePolicy} from '../../services/runtime/src/core/wake-policy.mjs';
import {createCodexState} from '../../services/runtime/src/core/codex-state.mjs';
function harness() {
 let at=1000;
 const policy=createWakePolicy({now:()=>at});
 const agent=createCodexState({now:()=>at,onEvent:policy.observe});
 return {policy,agent,event(event,session='a'.repeat(64)){agent.accept({event,session,at});},advance(ms){at+=ms;}};
}
test('eight-hour task stays active; tool traffic and silence never periodically wake',()=>{
 const h=harness();h.event('UserPromptSubmit');assert.equal(h.policy.take(true).reason,'start');
 for(let i=0;i<1000;i++){h.advance(1000);h.event('PreToolUse');h.advance(1000);h.event('PostToolUse');assert.equal(h.policy.take(true),null);}
 h.advance(8*60*60*1000);assert.equal(h.agent.status().state,'thinking');assert.equal(h.agent.status().stale,true);assert.equal(h.policy.take(true),null);
 h.event('Stop');assert.equal(h.policy.take(true).reason,'complete');assert.equal(h.agent.status().activeSessions,0);
});
test('duplicate and reordered hooks do not retrigger; repeated completion is suppressed',()=>{
 const h=harness();h.event('UserPromptSubmit');h.event('UserPromptSubmit');assert.equal(h.agent.status().eventCount,1);
 assert.equal(h.policy.take(true).reason,'start');h.advance(10001);h.event('Stop');assert.equal(h.policy.take(true).reason,'complete');
 h.advance(10001);h.event('Stop');assert.equal(h.policy.take(true),null);
});
test('quick task coalesces start into completion and obeys global cooldown',()=>{
 const h=harness();h.event('UserPromptSubmit');h.advance(1);h.event('Stop');assert.equal(h.policy.take(true).reason,'complete');
 h.advance(1);h.event('UserPromptSubmit');assert.equal(h.policy.take(true),null);h.advance(10000);assert.equal(h.policy.take(true).reason,'start');
});
test('pause drops queued events and reconnect cannot replay old events',()=>{
 const h=harness();h.event('UserPromptSubmit');assert.equal(h.policy.take(false),null);assert.equal(h.policy.take(true),null);
 h.advance(1);h.event('PermissionRequest');h.advance(60001);assert.equal(h.policy.take(true),null);
});
test('permission request is prioritized across sessions; cancellation clears stale wake',()=>{
 const h=harness();h.event('PermissionRequest');h.advance(1);h.event('UserPromptSubmit','b'.repeat(64));assert.equal(h.policy.take(true).reason,'attention');
 h.advance(10001);h.event('UserPromptSubmit');h.advance(1);h.event('Interrupt');assert.equal(h.policy.take(true),null);
});
test('completion of one concurrent task can wake even while another task remains active',()=>{
 const h=harness();h.event('UserPromptSubmit');h.policy.take(true);h.advance(10001);h.event('PreToolUse','b'.repeat(64));h.event('Stop');
 assert.equal(h.agent.status().state,'working');assert.equal(h.policy.take(true).mode,'complete');
});
test('resume work invalidates an unsent permission request',()=>{
 const h=harness();h.event('PermissionRequest');h.advance(1);h.event('PreToolUse');assert.equal(h.policy.take(true),null);
});

test('interleaved same-timestamp retransmission cannot reopen a completed task',()=>{
 const h=harness();h.event('UserPromptSubmit');h.event('Stop');h.event('UserPromptSubmit');
 assert.equal(h.agent.status().state,'complete');assert.equal(h.agent.status().eventCount,2);assert.equal(h.policy.take(true).reason,'complete');
});

test('user operations bypass the event cooldown and are not displaced by later Codex events',()=>{
 const h=harness();h.event('UserPromptSubmit');assert.equal(h.policy.take(true).reason,'start');
 h.advance(1);h.policy.requestUser('theme','op-1');h.event('PermissionRequest');h.policy.requestConnection();
 const wake=h.policy.take(true);assert.deepEqual([wake.reason,wake.kind,wake.operation],['user','theme','op-1']);
 h.advance(1);h.event('Stop');assert.equal(h.policy.take(true),null);
 h.policy.requestUser('wake','op-2');assert.equal(h.policy.take(false),null);assert.equal(h.policy.take(true),null);
});
test('explicit connection/install wakes are bounded and do not override pending task attention',()=>{
 const h=harness();h.policy.requestConnection();assert.equal(h.policy.take(true).reason,'connection');assert.equal(h.policy.take(true),null);
 h.advance(10001);h.event('PermissionRequest');h.policy.requestConnection('installed');assert.equal(h.policy.take(true).reason,'attention');
 h.advance(10001);h.policy.requestConnection('installed');assert.equal(h.policy.take(true).reason,'installed');
});
