import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridge} from '../../apps/desktop/ui/bridge.js';

function clock() {
  let serial = 0;
  const pending = new Map(), cancelled = [];
  return {
    pending, cancelled,
    schedule(callback, delay) {
      const id = ++serial;
      pending.set(id, {callback, delay});
      return id;
    },
    cancel(id) {pending.delete(id); cancelled.push(id);},
    expire(id) {
      const task = pending.get(id);
      pending.delete(id);
      task.callback();
    },
  };
}

test('state reads clean up their deadlines on success and native errors', async () => {
  const timers = clock();
  let mode = 'success';
  const nativeError = new Error('fixture native failure');
  const bridge = createBridge(() => {
    if (mode === 'throw') throw nativeError;
    if (mode === 'reject') return Promise.reject(nativeError);
    return Promise.resolve({loggedIn: false});
  }, timers);
  assert.deepEqual(await bridge.getState(), {loggedIn: false});
  for (mode of ['throw', 'reject']) await assert.rejects(bridge.getState(), error => error === nativeError);
  assert.equal(timers.pending.size, 0);
  assert.deepEqual(timers.cancelled, [1, 2, 3]);
});

test('a timed-out read permits retry and ignores its late response', async () => {
  const timers = clock(), requests = [], visible = [];
  const bridge = createBridge(command => {
    assert.equal(command, 'get_state');
    return new Promise((resolve, reject) => requests.push({resolve, reject}));
  }, {...timers, timeoutMs: 25});
  const first = bridge.getState();
  first.then(value => visible.push(value), () => {});
  await Promise.resolve();
  assert.equal(timers.pending.get(1).delay, 25);
  const failed = assert.rejects(first, /Local state read timed out/);
  timers.expire(1);
  await failed;

  const retry = bridge.getState();
  retry.then(value => visible.push(value));
  await Promise.resolve();
  requests[1].resolve({revision: 2});
  assert.deepEqual(await retry, {revision: 2});
  requests[0].resolve({revision: 1});
  await Promise.resolve();
  assert.deepEqual(visible, [{revision: 2}]);
  assert.equal(timers.pending.size, 0);
  assert.deepEqual(timers.cancelled, [1, 2]);
});

test('default state deadline is five seconds and late native failures are consumed', async () => {
  const timers = clock();
  let fail;
  const bridge = createBridge(() => new Promise((resolve, reject) => {fail = reject;}), timers);
  const read = bridge.getState();
  await Promise.resolve();
  assert.equal(timers.pending.get(1).delay, 5000);
  const failed = assert.rejects(read, /Local state read timed out/);
  timers.expire(1);
  await failed;
  fail(new Error('fixture late native failure'));
  await Promise.resolve();
  assert.equal(timers.pending.size, 0);
});

test('state deadlines do not time out login or application operations', async () => {
  const calls = [], timers = clock();
  const bridge = createBridge(async (...args) => {calls.push(args);}, timers);
  await bridge.openLogin('sg');
  await bridge.finishLogin('cn');
  await bridge.action('wake_hold', 60);
  assert.deepEqual(calls, [
    ['open_login', {region: 'sg'}],
    ['finish_login', {region: 'cn'}],
    ['action', {operation: 'wake_hold', value: 60}],
  ]);
  assert.equal(timers.pending.size, 0);
  assert.deepEqual(timers.cancelled, []);
});
