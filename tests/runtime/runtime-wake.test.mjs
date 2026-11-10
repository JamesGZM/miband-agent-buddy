import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeHarness, ack} from '../helpers/runtime.mjs';

// The real coordinator runs against injected transport/time, with no source copies.
for (const responds of [true, false]) test(`sleeping Buddy: launch ${responds ? 'confirmed by ACK' : 'never confirmed by enqueue alone'}`, async t => {
  let awake = false, launches = 0;
  const h = runtimeHarness({onWrite(command, child) {
    if (command.op === 'launch_buddy') {
      launches++;
      awake = launches > 1;
      child.later({event: 'result', id: command.id, ok: awake, code: awake ? null : 'app_missing'});
    }
    if (command.op === 'ping') child.later({event: 'result', id: command.id, ok: true});
    if (command.op === 'snapshot' && awake && responds) child.later(ack(command.payload, {
      keepScreen: 'on', wakeDisplay: {id: command.payload.wakeId, remainingMs: 20000},
    }));
  }});
  t.after(() => h.runtime.stop());
  await h.connect();
  await h.clock.advance(45000);
  assert.ok(h.states.some(s => s.connection === 'standby'));
  assert.ok(h.calls.some(c => c.op === 'ping'));
  h.hook('UserPromptSubmit');
  await h.clock.advance(20000);
  assert.ok(h.states.some(s => s.wake?.status === 'awaiting_ack'));
  assert.equal(h.states.some(s => s.wake?.status === 'confirmed'), responds);
  assert.ok(h.states.some(s => s.wake?.status === (responds ? 'confirmed' : 'unconfirmed')));
  assert.ok(!h.states.some(s => s.connection === 'retrying'));
  assert.equal(launches, 2);
  assert.ok(h.states.some(s => s.wake?.reason === 'connection' && s.wake.code === 'app_missing'));
  assert.ok(h.states.some(s => s.error?.includes('尚未安裝')));
  assert.ok(h.calls.filter(c => c.op === 'snapshot').every(c => c.payload.keepScreen === false));
});
