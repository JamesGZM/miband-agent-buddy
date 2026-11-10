import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeHarness, ack} from '../helpers/runtime.mjs';

test('single flight rejects wrong ACK, accepts current ACK and sends latest data', async t => {
  const h = runtimeHarness({onWrite(c, child) {
    if (c.op === 'launch_buddy') child.later({event: 'result', id: c.id, ok: false, code: 'app_missing'});
  }});
  t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(4000);
  const first = h.calls.find(c => c.op === 'snapshot');
  h.children[0].event(ack({...first.payload, seq: 99}));
  await h.clock.advance(4000);
  assert.equal(h.calls.filter(c => c.op === 'snapshot').length, 1);
  h.children[0].event(ack(first.payload));
  assert.equal(h.state.connection, 'connected');
  await h.clock.advance(2000);
  assert.equal(h.calls.filter(c => c.op === 'snapshot').length, 2);
});

test('pause discards wake and pending data; resume does not replay old events', async t => {
  const h = runtimeHarness(); t.after(() => h.runtime.stop());
  await h.connect();
  await h.runtime.dispatch({op: 'pause', value: true});
  h.hook('UserPromptSubmit');
  await h.clock.advance(20000);
  assert.equal(h.calls.length, 0);
  await h.runtime.dispatch({op: 'pause', value: false});
  await h.clock.advance(2000);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, 0);
});

test('late events from an abandoned child cannot mutate a new connection', async t => {
  const h = runtimeHarness(); t.after(() => h.runtime.stop());
  await h.connect(); const old = h.children[0];
  await h.runtime.dispatch({op: 'connect', address: 'second', key: '1'.repeat(32)});
  assert.equal(old.stopped, 1);
  const count = h.states.length;
  old.event({event: 'authenticated'}); old.event({event: 'battery', percent: 1});
  old.handlers.onError(); old.handlers.onClose();
  assert.equal(h.states.length, count);
  assert.equal(h.state.connection, 'connecting');
});

test('install pauses snapshots and requires device result before post-install wake', async t => {
  const h = runtimeHarness(); t.after(() => h.runtime.stop());
  await h.connect(); await h.runtime.dispatch({op: 'install'});
  await h.clock.advance(20000);
  assert.equal(h.calls.filter(c => c.op === 'snapshot').length, 0);
  assert.equal(h.state.installation, null);
  h.children[0].event({event: 'result', id: 'install', ok: true});
  await h.clock.advance(2000);
  assert.equal(h.state.installation.ok, true);
  assert.equal(h.state.wake.reason, 'installed');
});

test('installation timeout terminates transport and reports uncertainty', async t => {
  const h = runtimeHarness({timings: {install: 100}}); t.after(() => h.runtime.stop());
  await h.connect(); await h.runtime.dispatch({op: 'install'});
  await h.clock.advance(100);
  assert.equal(h.children[0].killed, 1);
  assert.ok(h.states.some(s => s.error?.includes('安裝逾時')));
});

test('transport retries are bounded and background reconnect never synthesizes wake', async t => {
  const h = runtimeHarness(); t.after(() => h.runtime.stop());
  await h.connect(); h.children[0].handlers.onClose();
  for (let i = 0; i < 8; i++) {
    await h.clock.advance(30000);
    h.children.at(-1).handlers.onClose();
  }
  await h.clock.advance(60000);
  assert.equal(h.children.length, 9);
  assert.equal(h.state.connection, 'error');
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, 0);
});

test('authentication rejection stops retries', async t => {
  const h = runtimeHarness(); t.after(() => h.runtime.stop());
  await h.connect();
  h.children[0].event({event: 'error', code: 'auth_rejected', message: 'rejected'});
  h.children[0].handlers.onClose(); await h.clock.advance(60000);
  assert.equal(h.children.length, 1); assert.equal(h.state.connection, 'error');
});

test('stop is idempotent, clears timers and ignores a late sample and queued commands', async () => {
  let resolve;
  const h = runtimeHarness({sample: () => new Promise(r => {resolve = r;})});
  const sampling = h.runtime.start();
  await h.runtime.dispatch({op: 'connect', address: 'fixture', key: '0'.repeat(32)});
  const stopped = h.runtime.stop(); await stopped; await h.runtime.stop();
  const count = h.states.length;
  resolve({cpu: 42}); await sampling;
  await h.runtime.dispatch({op: 'connect', address: 'again', key: '0'.repeat(32)});
  await h.clock.advance(60000);
  assert.equal(h.clock.size, 0); assert.equal(h.states.length, count);
  assert.equal(h.children[0].stopped, 1); assert.equal(h.children.length, 1);
});
