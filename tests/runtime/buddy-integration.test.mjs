import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCodexState} from '../../services/runtime/src/core/codex-state.mjs';
import {createActivityIngress} from '../../services/runtime/src/core/activity-ingress.mjs';
import {sanitizeActivity, validateActivity} from '../../services/runtime/src/adapters/activity-contract.mjs';
import {createHookServer} from '../../services/runtime/src/adapters/hook-server.mjs';
import {submitActivity} from '../../services/runtime/src/adapters/activity-client.mjs';
import {runBuddyCli} from '../../services/runtime/bin/buddy-cli.mjs';
import {runtimeHarness} from '../helpers/runtime.mjs';

const fixture = {source:'client-a',session:'conversation-a',run:1,seq:1,state:'thinking'};
const flags = value => ['report',...Object.entries(value).flatMap(([key,value])=>['--'+key,String(value)])];
function harness(options = {}) {
  let now=1000;
  const state=createCodexState({now:()=>now});
  const ingress=createActivityIngress({now:()=>now,accept:event=>state.accept(event),...options});
  return {state, ingress, send:value=>ingress.accept(sanitizeActivity({...fixture,...value})), advance:ms=>now+=ms};
}
async function receiver(t) {
  const h=harness();
  const server=createHookServer({accept:h.state.accept,report:h.ingress.accept,status:h.state.status});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  return {...h,port:server.address().port};
}

test('strict status contract rejects content fields and hashes only anonymous identity', () => {
  const value=sanitizeActivity(fixture);
  assert.deepEqual(Object.keys(value).sort(),['run','seq','session','state']);
  assert.equal(value.session.length,64);
  assert.doesNotMatch(JSON.stringify(value),/client-a|conversation-a/);
  assert.notEqual(sanitizeActivity({...fixture,source:'client-b'}).session,value.session);
  for (const value of [{...fixture,prompt:'synthetic-private'}, {...fixture,source:'/private/path'}, {...fixture,source:'client\n'}, {...fixture,seq:'1'}, {...fixture,run:0}, {...fixture,state:'unknown'}]) assert.throws(()=>validateActivity(value));
});

test('same-millisecond transitions, replay and terminal runs obey source sequence', () => {
  const h=harness();
  assert.equal(h.send({}).accepted,true);
  h.send({seq:2,state:'working'});
  h.send({seq:3,state:'thinking'});
  assert.equal(h.state.status().state,'thinking');
  assert.equal(h.state.status().eventCount,3);
  assert.equal(h.send({seq:2,state:'working'}).code,'ignored');
  h.send({seq:4,state:'completed'});
  assert.equal(h.send({seq:5,state:'working'}).code,'ignored');
  h.send({run:2,seq:1,state:'working'});
  h.send({run:1,seq:999,state:'completed'});
  assert.equal(h.state.status().state,'working');
  assert.equal(h.state.status().activeSessions,1);
  assert.equal(h.state.status().eventCount,5);
});

test('independent clients and conversations cannot end each other', () => {
  const h=harness();
  h.send({state:'working'});
  h.send({source:'client-b',state:'needs_user'});
  h.send({session:'conversation-b',state:'thinking'});
  assert.equal(h.state.status().activeSessions,3);
  h.send({seq:2,state:'completed'});
  assert.equal(h.state.status().activeSessions,2);
  assert.equal(h.state.status().state,'attention');
  h.send({source:'client-b',seq:2,state:'cancelled'});
  assert.equal(h.state.status().state,'thinking');
  h.send({session:'conversation-b',seq:2,state:'failed'});
  assert.equal(h.state.status().activeSessions,0);
});

test('aggregate status never identifies an AI provider for generic or legacy events', () => {
  const h=harness();
  const identity=()=>({source:h.state.status().source,scope:h.state.status().scope});
  assert.deepEqual(identity(),{source:'buddy-activity',scope:'aggregate'});
  h.send({state:'working'});
  h.state.accept({event:'PermissionRequest',session:'a'.repeat(64),at:1000});
  assert.equal(h.state.status().activeSessions,2);
  assert.deepEqual(identity(),{source:'buddy-activity',scope:'aggregate'});
  assert.equal(h.send({seq:2,state:'completed'}).accepted,true);
  assert.equal(h.state.status().activeSessions,1,'an accepted ending does not require the aggregate to reach zero');
  assert.equal(h.state.status().state,'attention');
  assert.deepEqual(identity(),{source:'buddy-activity',scope:'aggregate'});
});

test('busy senders are bounded without losing endings or evicting another task', () => {
  const h=harness({rate:2,capacity:2});
  h.send({});h.send({seq:2,state:'working'});
  assert.equal(h.send({seq:3,state:'thinking'}).code,'rate_limited');
  assert.equal(h.send({session:'other'}).accepted,true);
  assert.equal(h.send({session:'overflow'}).code,'capacity');
  assert.equal(h.send({seq:4,state:'completed'}).accepted,true);
  assert.equal(h.state.status().activeSessions,1);
  h.advance(1000);
  assert.equal(h.send({session:'other',seq:2,state:'working'}).accepted,true);
});

test('CLI submission reaches runtime ingress and returns receipt without a band', async t => {
  const h=await receiver(t);
  const submit=value=>submitActivity(value,{port:h.port});
  const result=await runBuddyCli(flags(fixture),{submit});
  assert.equal(result.value.accepted,true);
  const status=(await runBuddyCli(['status'],{submit})).value;
  assert.equal(status.activeSessions,1);
  assert.equal(status.source,'buddy-activity');
  assert.equal(status.scope,'aggregate');
  assert.equal((await runBuddyCli(flags({...fixture,seq:2,state:'completed'}),{submit})).value.accepted,true);
  assert.equal(h.state.status().activeSessions,0);
  assert.equal((await runBuddyCli([...flags(fixture),'--prompt','synthetic-private'],{submit})).value.code,'invalid_arguments');
});

test('private ingress rejects browser-origin writes and never accepts raw content', async t => {
  const h=await receiver(t),url=`http://127.0.0.1:${h.port}/internal/buddy-activity`;
  const send=(body,headers={})=>fetch(url,{method:'POST',headers:{'X-Buddy-Local':'1',...headers},body:JSON.stringify(body)});
  assert.equal((await send({operation:'report',activity:fixture},{Origin:'https://example.invalid'})).status,403);
  assert.equal((await send({operation:'report',activity:{...fixture,prompt:'synthetic-private'}})).status,400);
  assert.equal(h.state.status().eventCount,0);
});

test('unresponsive runtime has a bounded local deadline', async t => {
  const server=createServer(()=>{});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  const at=performance.now();
  assert.equal((await submitActivity({operation:'status'},{port:server.address().port,timeoutMs:40})).code,'unavailable');
  assert.ok(performance.now()-at<1000);
});

test('generic ingress uses the actual runtime state and resets/stops with its owner', async t => {
  const h=runtimeHarness();
  t.after(()=>h.runtime.stop());
  await h.runtime.start();
  assert.equal(h.runtime.acceptActivity(sanitizeActivity(fixture)).accepted,true);
  assert.equal(h.runtime.activityStatus().activeSessions,1);
  await h.runtime.dispatch({op:'reset_activity'});
  assert.equal(h.runtime.activityStatus().activeSessions,0);
  assert.equal(h.runtime.acceptActivity(sanitizeActivity(fixture)).accepted,true);
  await h.runtime.stop();
  assert.equal(h.runtime.acceptActivity(sanitizeActivity({...fixture,seq:2,state:'working'})).code,'unavailable');
  assert.equal(h.clock.size,0);
});

test('independent CLI child processes share one runtime without blocking on device delivery', async t => {
  const h=await receiver(t);
  const helper=fileURLToPath(new URL('../helpers/activity-cli.mjs',import.meta.url));
  const report=value=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[helper,String(h.port),...flags({...fixture,...value})],{stdio:['ignore','pipe','pipe']});
    let output='',error='';
    child.stdout.on('data',chunk=>output+=chunk);
    child.stderr.on('data',chunk=>error+=chunk);
    child.on('error',reject);
    child.on('close',code=>{
      try {assert.equal(code,0);assert.equal(error,'');resolve(JSON.parse(output));} catch(error){reject(error);}
    });
  });
  const replies=await Promise.all([report({}),report({source:'client-b',state:'working'}),report({session:'conversation-b',state:'needs_user'})]);
  assert.ok(replies.every(reply=>reply.accepted),JSON.stringify(replies));
  assert.equal(h.state.status().activeSessions,3);
  assert.equal((await report({seq:2,state:'completed'})).accepted,true);
  assert.equal(h.state.status().activeSessions,2);
  const endings=await Promise.all([report({source:'client-b',seq:2,state:'cancelled'}),report({session:'conversation-b',seq:2,state:'failed'})]);
  assert.ok(endings.every(reply=>reply.accepted));
  assert.equal(h.state.status().activeSessions,0);
});
