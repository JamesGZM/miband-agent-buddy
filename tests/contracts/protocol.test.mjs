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
  assert.deepEqual(fixture.transportCommands.find(command=>command.op==='snapshot').payload,fixture.snapshot);
  assert.deepEqual(fixture.transportEvents.find(event=>event.event==='ack').ack,fixture.ack);
  assert.deepEqual(fixture.runtimeState.ack,fixture.ack);
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
  for (const [activityHoldMs, idleHoldMs] of [[15000,60000],[120000,60000],[0,5000],[1000,1800000]]) {
    assert.equal(protocol.decodeMessage(JSON.stringify({...base,activityHoldMs,idleHoldMs})).activityHoldMs, activityHoldMs);
  }
  for (const pair of [{activityHoldMs:15000},{idleHoldMs:60000},{activityHoldMs:120001,idleHoldMs:60000},
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
test('host-compiled task colors are additive, compact and validated at the band boundary',()=>{
 const legacy={...fixture.snapshot};delete legacy.activityRing;
 assert.deepEqual(protocol.decodeMessage(JSON.stringify(legacy)),legacy);
 for(const activityRing of [[],Array(7).fill('#728BFF'),null,{},true,['red'],['#12345'],['#abcdef'],['#123456',2]]){
  assert.throws(()=>protocol.decodeMessage(JSON.stringify({...legacy,activityRing})));
 }
 for(let size=1;size<=6;size++){
  const snapshot={...legacy,activityRing:Array(size).fill('#123ABC')};
  assert.deepEqual(protocol.decodeMessage(JSON.stringify(snapshot)),snapshot);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot))<=1024);
 }
});
test('completion setting and notices are strictly bounded, optional and fit the wire limit',()=>{
 const legacy={...fixture.snapshot};delete legacy.completionVibration;delete legacy.completion;
 assert.deepEqual(protocol.decodeMessage(JSON.stringify(legacy)),legacy);
 for(const completionVibration of [null,0,1,'true',{},[]]){
  assert.throws(()=>wire.decodeRuntimeCommand({op:'configure',settings:{completionVibration}}));
  assert.throws(()=>protocol.decodeMessage(JSON.stringify({...legacy,completionVibration})));
 }
 for(const completion of [null,{},[],{id:'bad id',count:1},{id:'x',count:0},{id:'x',count:129},{id:'x',count:1.5},{id:'x',count:'1'}])assert.throws(()=>protocol.decodeMessage(JSON.stringify({...legacy,completionVibration:true,completion})));
 assert.throws(()=>protocol.decodeMessage(JSON.stringify({...legacy,completionVibration:false,completion:{id:'x',count:1}})));
 const max={...legacy,completionVibration:true,completion:{id:'x'.repeat(64),count:128}};
 assert.deepEqual(protocol.decodeMessage(JSON.stringify(max)),max);assert.ok(Buffer.byteLength(JSON.stringify(max))<=1024);
});
test('vibration modes accept only native short/long values at both boundaries',()=>{
 for(const completionVibrationMode of ['short','long']){
  assert.equal(wire.decodeRuntimeCommand({op:'configure',settings:{completionVibrationMode}}).settings.completionVibrationMode,completionVibrationMode);
  assert.equal(protocol.decodeMessage(JSON.stringify({...fixture.snapshot,completionVibrationMode})).completionVibrationMode,completionVibrationMode);
 }
 for(const completionVibrationMode of [null,0,1,true,'LONG','short ',5000,{},[]]){
  assert.throws(()=>wire.decodeRuntimeCommand({op:'configure',settings:{completionVibrationMode}}));
  assert.throws(()=>protocol.decodeMessage(JSON.stringify({...fixture.snapshot,completionVibrationMode})));
 }
});
test('generated Vela and browser adapters preserve the canonical module exports', async () => {
  const require = createRequire(import.meta.url);
  for (const [name, source] of [['protocol','protocol/snapshot'],['display','presentation/display'],['native-ui','presentation/native-ui'],['geometry','presentation/geometry']]) {
    const canonical = require('../../packages/buddy-shared/'+source+'.js');
    const band = require('../../apps/band/src/common/generated/'+name+'.js');
    const browser = (await import('../../apps/desktop/ui/assets/'+name+'.mjs')).default;
    assert.deepEqual(Object.keys(band).sort(), Object.keys(canonical).sort());
    assert.deepEqual(Object.keys(browser).sort(), Object.keys(canonical).sort());
    const args = name === 'protocol' ? [JSON.stringify(fixture.snapshot)] : name === 'display' ? [fixture.snapshot,false] : name==='geometry' ? [{theme:'claude',mode:'working',seconds:1.5}] : ['working',1.5];
    const method = name === 'protocol' ? 'decodeMessage' : name === 'display' ? 'fields' : name==='geometry' ? 'frame' : 'pose';
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
  const modules = ['services/runtime/src/core/runtime.mjs','services/runtime/bin/buddy-runtime.mjs','services/runtime/bin/codex-hook.mjs','services/runtime/bin/agent-hook.mjs','services/runtime/bin/cursor-hook.mjs','services/runtime/bin/deliver-hook.mjs','mac/buddy-runtime.mjs','mac/codex-hook.mjs'];
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
test('frame-rate setting rejects malformed IPC and snapshot values while retaining legacy v1',()=>{
 for(const buddyFps of [9,31,10.5,'20',null,{},true]){
  assert.throws(()=>wire.decodeRuntimeCommand({op:'configure',settings:{buddyFps}}));
  assert.throws(()=>protocol.decodeMessage(JSON.stringify({...fixture.snapshot,buddyFps})));
 }
 for(let buddyFps=10;buddyFps<=30;buddyFps++)assert.equal(wire.decodeRuntimeCommand({op:'configure',settings:{buddyFps}}).settings.buddyFps,buddyFps);
 const legacy={...fixture.snapshot};delete legacy.buddyFps;assert.deepEqual(protocol.decodeMessage(JSON.stringify(legacy)),legacy);
});

test('brightness is additive and validates integer 0–255 at both boundaries',()=>{
  const require=createRequire(import.meta.url);
  const {decodeMessage}=require('../../packages/buddy-shared/protocol/snapshot.js');
  const {decodeRuntimeCommand,decodeTransportEvent}=require('../../packages/buddy-shared/protocol/runtime.js');
  const base={v:1,type:'snapshot',session:'brightness',seq:1,text:'',value:0,cpu:0};
  for(const value of [0,25,128,255]){
    assert.equal(decodeMessage(JSON.stringify({...base,bandBrightness:value})).bandBrightness,value);
    assert.equal(decodeRuntimeCommand({op:'configure',settings:{bandBrightness:value}}).settings.bandBrightness,value);
  }
  for(const value of [null,-1,256,10.5,'25',true]){
    assert.throws(()=>decodeMessage(JSON.stringify({...base,bandBrightness:value})));
    assert.throws(()=>decodeRuntimeCommand({op:'configure',settings:{bandBrightness:value}}));
  }
  assert.throws(()=>decodeTransportEvent({event:'battery',percent:19,charging:'yes'}));
});

test('auto brightness accepts only additive booleans',()=>{
  const require=createRequire(import.meta.url);
  const {decodeMessage}=require('../../packages/buddy-shared/protocol/snapshot.js');
  const {decodeRuntimeCommand}=require('../../packages/buddy-shared/protocol/runtime.js');
  const base={v:1,type:'snapshot',session:'auto-brightness',seq:1,text:'',value:0,cpu:0};
  for(const value of [true,false]){
    assert.equal(decodeMessage(JSON.stringify({...base,bandAutoBrightness:value})).bandAutoBrightness,value);
    assert.equal(decodeRuntimeCommand({op:'configure',settings:{bandAutoBrightness:value}}).settings.bandAutoBrightness,value);
  }
  for(const value of [null,0,1,'true']){
    assert.throws(()=>decodeMessage(JSON.stringify({...base,bandAutoBrightness:value})));
    assert.throws(()=>decodeRuntimeCommand({op:'configure',settings:{bandAutoBrightness:value}}));
  }
});
