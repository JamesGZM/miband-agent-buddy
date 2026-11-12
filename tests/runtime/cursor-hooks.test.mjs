import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {Readable} from 'node:stream';
import {sanitizeCursorHook, cursorHookResponse} from '../../services/runtime/src/adapters/cursor-hook.mjs';
import {sanitizeAgentHook} from '../../services/runtime/src/adapters/agent-hook.mjs';
import {runCursorHook} from '../../services/runtime/bin/cursor-hook.mjs';

test('Cursor lifecycle retains the installed identity and strips all private fields', () => {
  for (const [cursor, canonical, status] of [
    ['beforeSubmitPrompt','UserPromptSubmit'],['preToolUse','PreToolUse'],['postToolUse','PostToolUse'],
    ['postToolUseFailure','PostToolUse'],['stop','Stop','completed'],['stop','Interrupt','aborted'],
    ['stop','Interrupt','error'],['sessionEnd','SessionEnd'],
  ]) {
    const data={hook_event_name:cursor,conversation_id:'fixture-conversation',status,prompt:'synthetic-private-text',
      tool_input:{command:'synthetic-private-text'},transcript_path:'/fixture/private',user_email:'fixture@example.invalid'};
    const actual=sanitizeCursorHook(data,cursor,1000);
    assert.deepEqual(actual,sanitizeAgentHook({hook_event_name:canonical,session_id:'fixture-conversation'},'custom',canonical,1000));
    assert.doesNotMatch(JSON.stringify(actual),/fixture|synthetic|prompt|command|transcript|email/);
  }
  assert.equal(sanitizeCursorHook({session_id:'fixture-session'},'sessionEnd',1000).event,'SessionEnd');
});

test('invalid or background input cannot dispatch activity', () => {
  for (const data of [null,[],{}, {conversation_id:'x',is_background_agent:true},
    {conversation_id:'x',hook_event_name:'stop'},{conversation_id:'x'.repeat(513)}]) {
    assert.throws(()=>sanitizeCursorHook(data,'preToolUse',1000));
  }
  assert.throws(()=>sanitizeCursorHook({conversation_id:'x'},'unknown',1000));
});

test('Cursor response is valid and independent of notification failure', async () => {
  for (const event of ['beforeSubmitPrompt','preToolUse','postToolUse','postToolUseFailure','stop','sessionEnd']) {
    const expected=event==='preToolUse'?{permission:'allow'}:event==='beforeSubmitPrompt'?{continue:true}:{};
    assert.deepEqual(cursorHookResponse(event),expected);
    for (const input of ['{"conversation_id":"fixture-conversation"}','{invalid', 'null']) {
      const replies=[];
      await runCursorHook(event,Readable.from([input]),{dispatch:()=>{throw Error('fixture spawn failure');},respond:value=>replies.push(value)});
      assert.deepEqual(replies,[expected]);
    }
  }
});

test('Cursor ingress never awaits delivery and sends only a canonical event', async () => {
  const events=[],replies=[];
  await runCursorHook('preToolUse',Readable.from(['{"conversation_id":"fixture-conversation","prompt":"synthetic-private-text"}']),{
    at:1000,dispatch:value=>{events.push(value);return new Promise(()=>{});},respond:value=>replies.push(value),
  });
  assert.deepEqual(events,[sanitizeCursorHook({conversation_id:'fixture-conversation'},'preToolUse',1000)]);
  assert.deepEqual(replies,[{permission:'allow'}]);
});

test('Cursor with open stdin exits promptly with a valid response', async () => {
  for(const [event,expected] of [['preToolUse',{permission:'allow'}],['beforeSubmitPrompt',{continue:true}]]) {
    const start=performance.now();
    const child=spawn(process.execPath,['services/runtime/bin/cursor-hook.mjs',event],{stdio:['pipe','pipe','pipe']});
    let output='',errors='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
    const [code]=await once(child,'close');
    assert.equal(code,0);assert.equal(errors,'');assert.deepEqual(JSON.parse(output),expected);
    assert.ok(performance.now()-start<1000,'stdin outlived ingress deadline');
  }
});
