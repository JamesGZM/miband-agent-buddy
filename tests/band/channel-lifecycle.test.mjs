import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fakeClock} from '../helpers/runtime.mjs';
const {createChannelLifecycle}=createRequire(import.meta.url)('../../apps/band/src/common/channel-lifecycle.js');

function setup(ready){
  const clock=fakeClock(),sent=[];
  const channel={send:value=>sent.push(value),...(ready?{getReadyState:ready}:{})};
  const lifecycle=createChannelLifecycle(channel,clock.now,clock.schedule,clock.cancel);
  return {clock,channel,lifecycle,sent};
}
test('unsupported ready query is compatible; close/open replays only the latest ACK once',()=>{
  const h=setup();let completed=0;
  h.lifecycle.send({seq:1},()=>completed++);const stale=h.sent[0];
  h.lifecycle.send({seq:2},()=>completed++);
  h.channel.onclose({code:1006,data:'synthetic-private-value'});
  stale.success();assert.equal(completed,0);
  h.channel.onopen({isReconnected:true});h.channel.onopen({isReconnected:true});
  assert.equal(h.sent.length,3);assert.equal(h.sent[2].data.seq,2);
  assert.equal(h.sent[2].data.channelLifecycle.replays,1);
  h.sent[2].success();assert.equal(completed,1);
  assert.equal(h.lifecycle.snapshot().firstReason,'closed');
  assert.equal(h.lifecycle.snapshot().firstCode,1006);
  h.channel.onerror({code:999});assert.equal(h.lifecycle.snapshot().firstCode,1006);
  assert.ok(!JSON.stringify(h.lifecycle.snapshot()).includes('synthetic-private-value'));
  h.lifecycle.close();assert.equal(h.channel.onclose,null);assert.equal(h.clock.size,0);
});
test('ready checks time out once, ignore late callbacks and never start a polling loop',async()=>{
  let query;const h=setup(value=>{query=value;});
  h.lifecycle.send({seq:1});
  await h.clock.advance(1000);
  assert.equal(h.lifecycle.snapshot().firstReason,'ready_timeout');
  query.success({status:1});assert.equal(h.lifecycle.snapshot().state,'unknown');
  await h.clock.advance(60000);assert.equal(h.lifecycle.snapshot().readyChecks,1);
  const oldOpen=h.channel.onopen;h.lifecycle.close();oldOpen({});query.fail(null,1006);
  assert.equal(h.clock.size,0);assert.equal(h.lifecycle.snapshot().opens,0);
});
test('ready and send errors retain only numeric codes and destruction retires all callbacks',()=>{
  const h=setup(value=>value.success({status:2}));
  assert.equal(h.lifecycle.snapshot().firstReason,undefined,'startup not-ready is not an outage');
  h.channel.onclose({code:1006});
  h.lifecycle.send({seq:1});h.sent[0].fail('synthetic-private-value','private-code');
  assert.equal(h.lifecycle.snapshot().firstCode,1006);
  assert.equal(h.lifecycle.snapshot().sendFailures,1);
  const error=h.channel.onerror;h.lifecycle.close();error({code:5});h.sent[0].fail(null,10);
  assert.equal(h.lifecycle.snapshot().errors,0);assert.equal(h.lifecycle.snapshot().sendFailures,1);
});
test('a pending ready response cannot reopen a channel after close, and replay failure cannot loop',()=>{
  let query;const h=setup(value=>{query=value;});
  h.lifecycle.send({seq:1});h.channel.onclose({code:1006});
  query.success({status:1});assert.equal(h.lifecycle.snapshot().state,'closed');
  h.channel.onopen({});h.sent.at(-1).fail(null,1006);h.channel.onopen({});
  assert.equal(h.sent.length,2);h.lifecycle.close();
});
