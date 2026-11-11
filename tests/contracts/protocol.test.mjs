import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import protocol from '../../packages/buddy-shared/protocol/snapshot.js';
import wire from '../../packages/buddy-shared/protocol/runtime.js';
import display from '../../packages/buddy-shared/presentation/display.js';
import {createBridge} from '../../apps/desktop/ui/bridge.js';

const fixture = JSON.parse(await fs.readFile(new URL('../../packages/buddy-shared/fixtures/v1.json', import.meta.url)));
test('canonical v1 snapshot, ACK and both IPC boundaries consume the same fixtures', () => {
  assert.deepEqual(protocol.decodeMessage(JSON.stringify(fixture.snapshot)), fixture.snapshot);
  assert.equal(protocol.matchesAck(fixture.ack, fixture.snapshot), true);
  assert.equal(protocol.matchesAck(null, fixture.snapshot), false);
  for (const c of fixture.runtimeCommands) assert.deepEqual(wire.decodeRuntimeCommand(c), c);
  for (const e of fixture.transportEvents) assert.deepEqual(wire.decodeTransportEvent(e), e);
  assert.throws(() => protocol.decodeMessage(JSON.stringify({...fixture.snapshot, page: 2})));
  assert.equal(protocol.decodeMessage(JSON.stringify({...fixture.snapshot, page: 1})).page, 1);
  for (const c of [{op:'pause',value:'true'}, {op:'configure',settings:{revision:-1}}, {op:'connect',address:'x',key:'bad'}, {op:'unknown'},
    {op:'configure',settings:{revision:1},request:'bad id'}, {op:'show_page',page:2,request:'op-1'}, {op:'show_page',page:1}, {op:'wake'}, {op:'reset_activity',value:true},
    {op:'reset_activity',request:'bad id'}, {op:'check_buddy',request:true}]) {
    assert.throws(() => wire.decodeRuntimeCommand(c));
  }
  for (const e of [{event:'battery',percent:101}, {event:'ack',ack:null}, {event:'result',id:1,ok:'yes'}]) {
    assert.throws(() => wire.decodeTransportEvent(e));
  }
});
test('activity keep-awake settings accept only booleans at the runtime boundary', () => {
  for (const activityKeepAwake of [true, false]) {
    const command = {op: 'configure', settings: {activityKeepAwake}};
    assert.deepEqual(wire.decodeRuntimeCommand(command), command);
  }
  for (const activityKeepAwake of ['true', 0, 1, null, {}, []]) {
    assert.throws(() => wire.decodeRuntimeCommand({op: 'configure', settings: {activityKeepAwake}}));
    assert.throws(() => wire.decodeRuntimeCommand({op: 'connect', address: 'fixture', key: '0'.repeat(32), settings: {activityKeepAwake}}));
  }
});
test('activity lease fields are additive, paired and bounded at the band boundary', () => {
  const base = {...fixture.snapshot};
  delete base.activityHoldMs; delete base.idleHoldMs;
  assert.deepEqual(protocol.decodeMessage(JSON.stringify(base)), base);
  for (const [activityHoldMs, idleHoldMs] of [[15000,60000],[0,5000],[1000,1800000]]) {
    assert.equal(protocol.decodeMessage(JSON.stringify({...base,activityHoldMs,idleHoldMs})).activityHoldMs, activityHoldMs);
  }
  for (const pair of [{activityHoldMs:15000},{idleHoldMs:60000},{activityHoldMs:15001,idleHoldMs:60000},
    {activityHoldMs:-1,idleHoldMs:60000},{activityHoldMs:999,idleHoldMs:60000},{activityHoldMs:0,idleHoldMs:4999},
    {activityHoldMs:15000,idleHoldMs:1800001},{activityHoldMs:true,idleHoldMs:60000}]) {
    assert.throws(() => protocol.decodeMessage(JSON.stringify({...base,...pair})));
  }
});
test('session counts are bounded totals and share the same compact presentation', () => {
  for (const sessionCounts of [{thinking:1,working:1,attention:1},{thinking:0,working:0,attention:128}]) {
    assert.deepEqual(protocol.decodeMessage(JSON.stringify({...fixture.snapshot,sessionCounts})).sessionCounts, sessionCounts);
  }
  for (const sessionCounts of [{thinking:128,working:1,attention:0},{thinking:-1,working:0,attention:0},
    {thinking:0,working:0,attention:0.5},{thinking:1},[],true]) {
    assert.throws(() => protocol.decodeMessage(JSON.stringify({...fixture.snapshot,sessionCounts})));
  }
  assert.equal(display.activityLabel({thinking:1,working:1,attention:1},false),'3 ACTIVE · 1 WAIT');
  assert.equal(display.activityLabel({thinking:0,working:128,attention:0},false),'128 ACTIVE');
  assert.equal(display.activityLabel({thinking:0,working:0,attention:128},false),'128 ACTIVE · 128 WAIT');
  for (const counts of [null,{}, {thinking:0,working:0,attention:0}, {thinking:128,working:1,attention:0}]) assert.equal(display.activityLabel(counts,false),'');
  assert.equal(display.activityLabel({thinking:1,working:1,attention:1},true),'');
});
test('generated Vela and browser adapters preserve the canonical module exports', async () => {
  const require = createRequire(import.meta.url);
  for (const [name, source] of [['protocol','protocol/snapshot'],['display','presentation/display'],['native-ui','presentation/native-ui']]) {
    const canonical = require('../../packages/buddy-shared/'+source+'.js');
    const band = require('../../apps/band/src/common/generated/'+name+'.js');
    const browser = (await import('../../apps/desktop/ui/assets/'+name+'.mjs')).default;
    assert.deepEqual(Object.keys(band).sort(), Object.keys(canonical).sort());
    assert.deepEqual(Object.keys(browser).sort(), Object.keys(canonical).sort());
    const args = name === 'protocol' ? [JSON.stringify(fixture.snapshot)] : name === 'display' ? [fixture.snapshot,false] : ['working',1.5,'claude'];
    const method = name === 'protocol' ? 'decodeMessage' : name === 'display' ? 'fields' : 'motion';
    assert.deepEqual(band[method](...args), canonical[method](...args));
    assert.deepEqual(browser[method](...args), canonical[method](...args));
  }
});
test('frontend bridge retains Tauri command names and argument shape', async () => {
  const calls = [], bridge = createBridge(async (...args) => calls.push(args));
  await bridge.getState(); await bridge.openLogin('sg'); await bridge.finishLogin('cn'); await bridge.action('pause',true);
  assert.deepEqual(calls,[['get_state'],['open_login',{region:'sg'}],['finish_login',{region:'cn'}],['action',{operation:'pause',value:true}]]);
});
test('core, executable modules and compatibility entries import without opening ports or children', async () => {
  const modules = ['services/runtime/src/core/runtime.mjs','services/runtime/bin/buddy-runtime.mjs','services/runtime/bin/codex-hook.mjs','mac/buddy-runtime.mjs','mac/codex-hook.mjs'];
  await promisify(execFile)(process.execPath,['--input-type=module','-e',`await Promise.all(${JSON.stringify(modules)}.map(p=>import('./'+p)));`],{timeout:5000});
});
test('legacy hook executable fails open for invalid input', async () => {
  const {spawn} = await import('node:child_process');
  const {once} = await import('node:events');
  const child = spawn(process.execPath,['mac/codex-hook.mjs','UserPromptSubmit'],{stdio:['pipe','pipe','pipe']});
  const done = once(child,'close'); let stdout='',stderr='';
  child.stdout.on('data',b=>stdout+=b); child.stderr.on('data',b=>stderr+=b);
  child.stdin.end('{}');
  const [code] = await done;
  assert.equal(code,0); assert.equal(stdout,''); assert.equal(stderr,'');
});
