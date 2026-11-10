import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {transportFactory} from '../../services/runtime/src/adapters/transport.mjs';

test('stdio adapter writes initial credentials, filters bad frames and stops its child once', async () => {
  const child = new EventEmitter(), events = [], signals = [];
  child.stdin = new PassThrough(); child.stdout = new PassThrough();
  child.exitCode = null; child.signalCode = null;
  child.kill = signal => {signals.push(signal); queueMicrotask(()=>{child.signalCode=signal;child.emit('close');});};
  let input=''; child.stdin.on('data',b=>input+=b);
  let closes=0;
  const handle = transportFactory('/fixture/transport',{spawnChild:()=>child})({
    onEvent:e=>events.push(e),onError:()=>assert.fail('unexpected spawn error'),onClose:()=>closes++,
  });
  handle.start({address:'fixture',key:'0'.repeat(32)});
  handle.write({op:'ping',id:'check'});
  child.stdout.write('not-json\n'+JSON.stringify({event:'authenticated'})+'\n');
  assert.deepEqual(events,[{event:'authenticated'}]);
  assert.equal(JSON.parse(input.split('\n')[0]).address,'fixture');
  assert.equal(JSON.parse(input.split('\n')[1]).op,'ping');
  await Promise.all([handle.stop(),handle.stop()]);
  assert.deepEqual(signals,['SIGTERM']); assert.equal(closes,1);
});
