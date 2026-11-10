import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSource,checkArchitecture} from '../../scripts/check_architecture.mjs';

test('architecture guard rejects effects in core and cross-app imports', () => {
  for (const [file,source] of [
    ['services/runtime/src/core/invalid.mjs',"import {spawn} from 'node:child_process';"],
    ['services/runtime/src/core/invalid.mjs',"import sampler from '../adapters/metrics.mjs';"],
    ['packages/buddy-shared/protocol/invalid.js',"var fs=require('node:fs');"],
    ['apps/desktop/ui/invalid.js',"import band from '../../band/src/app.ux';"],
    ['apps/desktop/ui/invalid.js','window.__TAURI__.core.invoke("get_state");'],
    ['apps/band/src/controllers/invalid.js',"import brightness from '@system.brightness';"],
    ['apps/desktop/src-tauri/src/domain.rs','use std::process::Command;'],
    ['tests/runtime/invalid.mjs',"const s=readFileSync(file).replace('8000','80');"],
    ['scripts/invalid.py',"path = root/'quickapp/src/app.ux'"],
  ]) assert.ok(checkSource(file,source).length,file);
});
test('architecture guard accepts pure shared imports and the explicit platform bridge', () => {
  assert.deepEqual(checkSource('services/runtime/src/core/valid.mjs',"import protocol from '../../../../packages/buddy-shared/protocol/snapshot.js';"),[]);
  assert.deepEqual(checkSource('apps/desktop/ui/bridge.js','globalThis.__TAURI__?.core?.invoke'),[]);
});
test('owned source obeys architecture boundaries', async () => {
  assert.deepEqual((await checkArchitecture()).errors,[]);
});
