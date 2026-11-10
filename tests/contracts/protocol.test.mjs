import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import protocol from '../../packages/buddy-shared/protocol/snapshot.js';
import wire from '../../packages/buddy-shared/protocol/runtime.js';
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
    {op:'configure',settings:{revision:1},request:'bad id'}, {op:'show_page',page:2,request:'op-1'}, {op:'show_page',page:1}, {op:'wake'}]) {
    assert.throws(() => wire.decodeRuntimeCommand(c));
  }
  for (const e of [{event:'battery',percent:101}, {event:'ack',ack:null}, {event:'result',id:1,ok:'yes'}]) {
    assert.throws(() => wire.decodeTransportEvent(e));
  }
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
