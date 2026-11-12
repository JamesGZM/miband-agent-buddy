import test from 'node:test';
import assert from 'node:assert/strict';
import {wakeProgress} from '../../apps/desktop/ui/connection-status.js';

test('automatic recovery shows actual launch and receipt phases without claiming success', () => {
  const r = {connection:'waiting',wake:{reason:'activity_reconnect',status:'sending'}};
  assert.equal(wakeProgress(r),'正在恢復喚醒 Buddy…');
  r.wake.status='awaiting_ack';
  assert.equal(wakeProgress(r),'喚醒指令已送出，等待 Buddy 確認');
  for (const status of ['confirmed','failed','cancelled','expired']) {
    r.wake.status=status;assert.equal(wakeProgress(r),'');
  }
  r.wake.status='sending';r.connection='retrying';
  assert.equal(wakeProgress(r),'','stale wake must not hide a disconnected radio');
  r.connection='waiting';r.wake.reason='start';
  assert.equal(wakeProgress(r),'正在喚醒 Buddy…');
});
