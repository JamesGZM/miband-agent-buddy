import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {runtimeHarness, ack} from '../helpers/runtime.mjs';
import {readBandPackage} from '../../services/runtime/src/adapters/band-package.mjs';
import {initialBuddyState, checkedBuddyState, acknowledgedBuddyState} from '../../services/runtime/src/core/band-package-state.mjs';
import wire from '../../packages/buddy-shared/protocol/runtime.js';

const available = {versionName: '0.5.4', versionCode: 16};

test('inventory identifies a sleeping or missing Buddy without launching it', async t => {
  const h = runtimeHarness({bandPackage: available}); t.after(() => h.runtime.stop());
  await h.connect();
  assert.equal(h.state.buddy.status, 'checking');
  assert.equal(h.state.buddy.installed, null);
  assert.equal(h.calls.filter(c => c.op === 'buddy_status').length, 0);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, 0);
  const child = h.children[0];
  child.event({event: 'buddy', installed: false, versionCode: null});
  assert.equal(h.state.buddy.status, 'not_installed');
  assert.equal(h.state.error, null);
  for (const [versionCode, expected] of [[15, 'update_available'], [16, 'current'], [17, 'newer']]) {
    await h.runtime.dispatch({op: 'check_buddy'});
    assert.equal(h.state.buddy.status, 'checking');
    child.event({event: 'buddy', installed: true, versionCode});
    assert.equal(h.state.buddy.status, expected);
    assert.equal(h.state.buddy.installedVersionCode, versionCode);
    assert.equal(h.state.buddy.installedVersion, null);
  }
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, 0);
});

test('unknown inventory is not missing and failed checks retain the known installation', async t => {
  const h = runtimeHarness({bandPackage: available, timings: {buddy: 100}}); t.after(() => h.runtime.stop());
  await h.connect();
  await h.clock.advance(100);
  assert.equal(h.state.buddy.status, 'error');
  assert.equal(h.state.buddy.installed, null);
  assert.equal(h.state.error, null);
  await h.runtime.dispatch({op: 'check_buddy'});
  h.children[0].event({event: 'buddy', installed: true, versionCode: 15});
  await h.runtime.dispatch({op: 'check_buddy'});
  h.children[0].event({event: 'result', id: 'buddy-status', ok: false, code: 'operation_failed'});
  assert.equal(h.state.buddy.installed, true);
  assert.equal(h.state.buddy.installedVersionCode, 15);
  assert.equal(h.state.buddy.status, 'error');
  assert.equal(h.state.error, null);
});

test('successful installation triggers inventory verification; rejected install does not erase old version', async t => {
  const h = runtimeHarness({bandPackage: available}); t.after(() => h.runtime.stop());
  await h.connect();
  const child = h.children[0];
  child.event({event: 'buddy', installed: true, versionCode: 15});
  await h.runtime.dispatch({op: 'install'});
  assert.equal(h.state.buddy.status, 'installing');
  child.event({event: 'result', id: 'install', ok: false, code: 'install_rejected'});
  assert.equal(h.state.buddy.installed, true);
  assert.equal(h.state.buddy.installedVersionCode, 15);
  assert.equal(h.state.error, null);
  await h.runtime.dispatch({op: 'install'});
  child.event({event: 'result', id: 'install', ok: true});
  assert.equal(h.state.buddy.status, 'checking');
  assert.equal(h.state.buddy.installedVersionCode, null);
  assert.equal(h.calls.filter(c => c.op === 'buddy_status').length, 0);
  child.event({event: 'buddy', installed: true, versionCode: 16});
  assert.equal(h.state.buddy.status, 'current');
});

test('pause and background reconnect stay quiet; a completed manual install wakes even while paused', async t => {
  const h = runtimeHarness({bandPackage: available}); t.after(() => h.runtime.stop());
  await h.connect();
  await h.runtime.dispatch({op: 'pause', value: true});
  assert.equal(h.calls.filter(c => c.op === 'buddy_status').length, 1);
  h.children[0].event({event: 'buddy', installed: true, versionCode: 16});
  await h.clock.advance(4000);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, 0);
  h.children[0].handlers.onClose();
  await h.clock.advance(30000);
  h.children.at(-1).event({event: 'authenticated'});
  assert.equal(h.calls.filter(c => c.op === 'buddy_status').length, 2);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, 0);
  h.children.at(-1).event({event: 'buddy', installed: true, versionCode: 16});
  await h.runtime.dispatch({op: 'install'});
  h.children.at(-1).event({event: 'result', id: 'install', ok: true});
  assert.equal(h.calls.filter(c => c.op === 'buddy_status').length, 2);
  assert.equal(h.calls.filter(c => c.op === 'launch_buddy').length, 1);
  assert.deepEqual([h.state.operation.kind, h.state.operation.status], ['install', 'waking']);
  assert.equal(h.state.paused, true);
  assert.equal(h.state.buddy.status, 'checking');
});

for (const installed of [true, false]) test(`manual Buddy check wakes first and confirms ${installed ? 'inventory' : 'absence'} while paused`, async t => {
  const h = runtimeHarness({bandPackage:available,onWrite(c,child) {
    if (c.op === 'launch_buddy') child.later({event:'result',id:c.id,ok:installed,code:installed?null:'app_missing'});
    if (c.op === 'snapshot') child.later(ack(c.payload,{keepScreen:'on',wakeDisplay:{id:c.payload.wakeId,remainingMs:20000}}));
    if (c.op === 'buddy_status') child.later({event:'buddy',installed,versionCode:installed?16:null});
  }}); t.after(() => h.runtime.stop());
  await h.runtime.dispatch({op:'pause',value:true});
  await h.connect(); await h.clock.advance(1000);
  const launches = h.calls.filter(c=>c.op==='launch_buddy').length;
  await h.runtime.dispatch({op:'check_buddy',request:'op-check'});
  assert.equal(h.calls.filter(c=>c.op==='launch_buddy').length,launches+1);
  await h.clock.advance(6000);
  assert.deepEqual([h.state.operation.kind,h.state.operation.status],['check_buddy','done']);
  assert.equal(h.state.buddy.installed,installed);
  assert.equal(h.state.buddy.status,installed?'current':'not_installed');
  const snapshots = h.calls.filter(c=>c.op==='snapshot').length;
  await h.clock.advance(60000);
  assert.equal(h.calls.filter(c=>c.op==='snapshot').length,snapshots);
  assert.equal(h.state.paused,true);
});

test('missing app errors stay on Buddy status and an ACK proves presence without inventing a version code', async t => {
  const h = runtimeHarness({bandPackage: available, onWrite(c, child) {
    if (c.op === 'launch_buddy') child.later({event: 'result', id: c.id, ok: false, code: 'app_missing'});
  }}); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(4000);
  assert.equal(h.state.buddy.status, 'not_installed');
  assert.equal(h.state.error, null);
  const pending = h.calls.find(c => c.op === 'snapshot');
  h.children[0].event(ack(pending.payload, {appVersion: '0.5.4'}));
  assert.equal(h.state.buddy.status, 'current');
  assert.equal(h.state.buddy.installedVersion, '0.5.4');
  assert.equal(h.state.buddy.installedVersionCode, null);
});

test('inventory validates its boundary and an abandoned transport cannot supply the next device version', async t => {
  for (const event of [
    {event: 'buddy', installed: true}, {event: 'buddy', installed: 'yes', versionCode: 16},
    {event: 'buddy', installed: true, versionCode: -1}, {event: 'buddy', installed: false, versionCode: 16},
  ]) assert.throws(() => wire.decodeTransportEvent(event));
  const h = runtimeHarness({bandPackage: available}); t.after(() => h.runtime.stop());
  await h.connect(); const old = h.children[0];
  await h.runtime.dispatch({op: 'connect', address: 'second', key: '1'.repeat(32)});
  old.event({event: 'buddy', installed: true, versionCode: 16});
  assert.equal(h.state.buddy.installed, null);
});

test('a changed inventory invalidates an older in-flight version receipt', async t => {
  const h = runtimeHarness({bandPackage: available, onWrite(c, child) {
    if (c.op === 'launch_buddy') child.later({event: 'result', id: c.id, ok: true});
  }}); t.after(() => h.runtime.stop());
  await h.connect(); await h.clock.advance(4000);
  const before = h.calls.filter(c => c.op === 'snapshot').at(-1);
  h.children[0].event({event: 'buddy', installed: true, versionCode: 16});
  h.children[0].event(ack(before.payload, {appVersion: '0.5.3'}));
  assert.equal(h.state.buddy.installedVersion, null);
  assert.equal(h.state.ack, null);
  await h.clock.advance(2000);
  const after = h.calls.filter(c => c.op === 'snapshot').at(-1);
  assert.notEqual(after.payload.seq, before.payload.seq);
  h.children[0].event(ack(after.payload, {appVersion: '0.5.4'}));
  assert.equal(h.state.buddy.installedVersion, '0.5.4');
});

test('a fresh bundled-version ACK reconciles stale inventory without inventing an install receipt or numeric code', async t => {
  const h = runtimeHarness({bandPackage:{versionName:'0.5.5',versionCode:17},onWrite(c,child) {
    if (c.op === 'launch_buddy') {
      child.later({event:'buddy',installed:true,versionCode:16});
      child.later({event:'result',id:c.id,ok:true});
    }
    if (c.op === 'snapshot') child.later(ack(c.payload,{appVersion:'0.5.5',keepScreen:'on',
      wakeDisplay:{id:c.payload.wakeId,remainingMs:20000}}));
    if (c.op === 'buddy_status') child.later({event:'buddy',installed:true,versionCode:16});
    if (c.op === 'install') child.later({event:'result',id:c.id,ok:false,code:'install_receipt_missing'});
  }}); t.after(() => h.runtime.stop());
  await h.runtime.dispatch({op:'pause',value:true});
  await h.connect(); await h.clock.advance(1000);
  assert.equal(h.state.buddy.status,'update_available');
  await h.runtime.dispatch({op:'install'}); await h.clock.advance(1);
  assert.equal(h.state.installation.code,'install_receipt_missing');
  await h.runtime.dispatch({op:'check_buddy',request:'op-reconcile'});
  await h.clock.advance(6000);
  assert.equal(h.state.operation.status,'done');
  assert.equal(h.state.buddy.status,'current');
  assert.equal(h.state.buddy.installedVersion,'0.5.5');
  assert.equal(h.state.buddy.installedVersionCode,16,'the numeric inventory is retained, not inferred from the ACK');
  assert.equal(h.state.installation.ok,false,'the missing original install receipt is not rewritten as success');
  assert.equal(h.state.paused,true);
  await h.runtime.dispatch({op:'check_buddy'}); await h.clock.advance(1);
  assert.equal(h.state.buddy.status,'current','an unchanged inventory must not undo a live version confirmation');
  h.children[0].event({event:'buddy',installed:true,versionCode:15});
  assert.equal(h.state.buddy.status,'update_available','a changed inventory invalidates prior version evidence');
  assert.equal(h.state.buddy.installedVersion,null);
  const old=h.calls.filter(c=>c.op==='snapshot').at(-1).payload;
  h.children[0].event(ack(old,{appVersion:'0.5.5'}));
  assert.equal(h.state.buddy.status,'update_available','a stale sequence cannot restore current status');
  h.children[0].event({event:'buddy',installed:false,versionCode:null});
  assert.equal(h.state.buddy.status,'not_installed');
});

test('version-name reconciliation does not hide newer numeric builds or infer codes for unknown inventory', () => {
  const initial = initialBuddyState({versionName:'0.5.5',versionCode:17});
  const older = checkedBuddyState(initial,{installed:true,versionCode:16},1);
  assert.equal(acknowledgedBuddyState(older,'0.5.4').status,'update_available');
  assert.equal(acknowledgedBuddyState(older,undefined).status,'update_available');
  const newer = acknowledgedBuddyState(checkedBuddyState(initial,{installed:true,versionCode:18},1),'0.5.5');
  assert.equal(newer.status,'newer');
  assert.equal(newer.installedVersionCode,18);
  const nameOnly = acknowledgedBuddyState(initial,'0.5.5');
  assert.equal(nameOnly.status,'current');
  assert.equal(nameOnly.installedVersionCode,null);
});

test('available version metadata must match the built package bytes', t => {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-package-test-')); t.after(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, 'buddy.debug.rpk');
  const bytes = Buffer.from('synthetic package'); writeFileSync(path, bytes);
  const metadata = {...available, sizeBytes: 1, sha256: createHash('sha256').update(bytes).digest('hex')};
  writeFileSync(join(dir, 'buddy-package.json'), JSON.stringify(metadata));
  assert.deepEqual(readBandPackage(path), {...available, sizeBytes: bytes.length}, 'size comes from verified bytes, not metadata');
  writeFileSync(path, 'replaced package');
  assert.equal(readBandPackage(path), null);
  writeFileSync(join(dir, 'buddy-package.json'), '{}');
  assert.equal(readBandPackage(path), null);
});
