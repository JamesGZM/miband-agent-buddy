import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const readWorkflow = name => readFileSync(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');

test('Windows preview builds native x64 and ARM64 installers without publishing or certificates', () => {
  const workflow = readWorkflow('windows.yml');
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  (push|pull_request|schedule):/m);
  for (const value of ['windows-2025','windows-11-arm','arch: x64','arch: arm64','scripts/build_windows.py','scripts/package_sources.py','actions/upload-artifact']) assert.ok(workflow.includes(value),value);
  assert.doesNotMatch(workflow, /contents: write|gh release|SIGNING_IDENTITY|\.p12|Import-PfxCertificate/);
});

test('ordinary source checks cannot package or publish application artifacts', () => {
  const workflow = readWorkflow('check.yml');
  assert.match(workflow, /^  push:/m);
  assert.match(workflow, /^  pull_request:/m);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write|npm run build|gh release|upload-artifact/);
  for (const command of ['scripts/render_band_ui.py', 'scripts/prepare_desktop.py', 'npm test', 'npm run check:architecture']) {
    assert.ok(workflow.includes(command), command);
  }
});

test('only version tags or an explicit release dispatch package and publish portable macOS assets', () => {
  const workflow = readWorkflow('release.yml');
  assert.match(workflow, /^  push:\n    tags: \['v\[0-9\]\*'\]$/m);
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  (pull_request|schedule):/m);
  assert.doesNotMatch(workflow, /branches:/);
  for (const command of ['npm run build', 'npm run build:desktop -- --release', 'scripts/package_release.py', 'npm test', 'npm run check:architecture', 'gh release create', 'gh release upload']) {
    assert.ok(workflow.includes(command), command);
  }
  assert.match(workflow, /runner: macos-15-intel/);
  assert.match(workflow, /runner: macos-15\n/);
  assert.match(workflow, /needs: macos/);
  assert.match(workflow, /npm run build:desktop -- --release --signing-mode ci/);
  assert.doesNotMatch(workflow, /BUDDY_SIGNING_IDENTITY|security import|create-keychain|\.p12/);
  assert.match(workflow, /--verify-tag/);
  assert.match(workflow, /Tag and desktop version must match/);
  assert.match(workflow, /Tauri version must match/);
  assert.match(workflow, /Cargo version must match/);
  assert.match(workflow, /scripts\/release_notes.py/);
  assert.match(workflow, /--notes-file/);
  assert.doesNotMatch(workflow, /dist\/buddy\.debug\.rpk|name: buddy-package/);
  for (const line of workflow.split('\n').filter(line => line.includes('gh release'))) {
    assert.ok(line.includes('"$RELEASE_TAG"'));
    assert.ok(!line.includes('${{'));
  }
});

test('desktop release versions agree across npm, Tauri and Cargo', () => {
  const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
  const version = JSON.parse(read('package.json')).version;
  assert.equal(JSON.parse(read('apps/desktop/src-tauri/tauri.conf.json')).version, version);
  assert.equal(read('apps/desktop/src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)[1], version);
  assert.ok(read('CHANGELOG.md').split('\n').some(line => line.startsWith('## [' + version + ']')));
});
