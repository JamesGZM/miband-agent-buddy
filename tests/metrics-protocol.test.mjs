import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpuUsage, matchesAck } from '../mac/cpu.mjs';
import { memoryFromVm, diskFromFs } from '../mac/metrics.mjs';
const protocol = createRequire(import.meta.url)('../quickapp/src/common/protocol.js');
const sample = { v: 1, type: 'snapshot', session: 'test-1', seq: 1, text: 'Mac ready', value: 42, cpu: 0 };
const ack = { v: 1, type: 'ack', session: 'test-1', seq: 1, keepScreen: 'on', received: 1 };

test('protocol validates fields and rejects replay within a session', () => {
  assert.deepEqual(protocol.decodeMessage(JSON.stringify(sample)), sample);
  assert.equal(protocol.acceptMessage(JSON.stringify(sample), sample), null);
  assert.equal(protocol.acceptMessage(JSON.stringify(sample), { ...sample, seq: 2 }), null);
  assert.equal(protocol.acceptMessage(JSON.stringify({ ...sample, session: 'new' }), sample).seq, 1);
  for (const bad of ['invalid', 'null', JSON.stringify({ ...sample, cpu: 101 }),
    JSON.stringify({ ...sample, seq: 0 }), JSON.stringify({ ...sample, text: 'x'.repeat(33) })]) {
    assert.throws(() => protocol.decodeMessage(bad));
  }
  assert.equal(protocol.decodeMessage(JSON.stringify({ ...sample, cpu: -1 })).cpu, -1);
  assert.ok(matchesAck(protocol.makeAck(sample, 'on', 1), sample));
});

test('CPU deltas preserve idle zero and unavailable values', () => {
  assert.equal(cpuUsage({ idle: 0, total: 0 }, { idle: 100, total: 100 }), 0);
  assert.equal(cpuUsage({ idle: 0, total: 0 }, { idle: 25, total: 100 }), 75);
  assert.equal(cpuUsage({ idle: 100, total: 100 }, { idle: 0, total: 0 }), -1);
});


test('memory uses anonymous, wired and compressed pages without adding cache twice', () => {
  const counters = 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nAnonymous pages: 100.\nPages wired down: 20.\nPages occupied by compressor: 30.\nFile-backed pages: 300.';
  assert.deepEqual(memoryFromVm(counters, 300*16384), {usedBytes:150*16384,totalBytes:300*16384,percent:50});
  assert.throws(()=>memoryFromVm('unavailable', 300*16384));
  assert.throws(()=>memoryFromVm(counters, 100*16384));
});
test('disk accounts for allocated blocks and rejects impossible counters', () => {
  assert.deepEqual(diskFromFs({blocks:100n,bfree:25n,bsize:4096n}),{usedBytes:75*4096,totalBytes:100*4096,percent:75});
  assert.throws(()=>diskFromFs({blocks:0n,bfree:0n,bsize:4096n}));
  assert.throws(()=>diskFromFs({blocks:100n,bfree:101n,bsize:4096n}));
});
