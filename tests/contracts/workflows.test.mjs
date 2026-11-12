import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const readWorkflow = name => readFileSync(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');

test('update Worker deployment is explicit, main-only and independent of app publication', () => {
  const workflow=readWorkflow('update-worker.yml');
  assert.match(workflow,/^  workflow_dispatch:/m);
  assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
  assert.doesNotMatch(workflow,/^  (push|pull_request|schedule):/m);
  assert.match(workflow,/contents: read/);
  assert.doesNotMatch(workflow,/contents: write|gh release|upload-artifact|xime-index/);
  assert.ok(workflow.indexOf('node --test tests/contracts/update-worker.test.mjs')<workflow.indexOf('npx --yes wrangler'));
  for(const value of ['secrets.CLOUDFLARE_API_TOKEN','secrets.CLOUDFLARE_ACCOUNT_ID','services/update-worker/wrangler.toml'])assert.ok(workflow.includes(value));
});

test('Windows preview builds native x64 and ARM64 installers without publishing or certificates', () => {
  const workflow = readWorkflow('windows.yml');
  assert.match(workflow, /^  workflow_dispatch:/m);
  assert.match(workflow, /^  workflow_call:/m);
  assert.match(workflow, /ref: \$\{\{ inputs.tag && format\('refs\/tags\/\{0\}', inputs.tag\) \|\| github.ref \}\}/);
  assert.match(workflow, /Tag and desktop version must match/);
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

test('release tags build both platforms from the same tag and gate publication on every architecture', () => {
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
  assert.match(workflow, /windows:\n    uses: \.\/\.github\/workflows\/windows.yml\n    with:\n      tag: \$\{\{ inputs.tag \|\| github.ref_name \}\}/);
  assert.match(workflow, /publish:\n    needs: \[macos, windows\]/);
  assert.match(workflow, /run: python3 scripts\/verify_release_assets.py dist/);
  assert.ok(workflow.includes('dist/MiBand-Agent-Buddy-macos-${{ matrix.arch }}.dmg\n'));
  assert.ok(workflow.includes('dist/MiBand-Agent-Buddy-macos-${{ matrix.arch }}.dmg.sha256\n'));
  assert.ok(workflow.indexOf('scripts/verify_release_assets.py') < workflow.indexOf('gh release create'));
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

test('release publication requires Mac DMG and Windows installers with valid checksums', () => {
  const result=spawnSync('python3',['-B','-c',String.raw`
import hashlib,sys,tempfile
from pathlib import Path
sys.path.insert(0,'scripts')
from verify_release_assets import verify
with tempfile.TemporaryDirectory() as temporary:
    root=Path(temporary)
    for arch in ['arm64','x64']:
        assets=[('SHA256SUMS-'+arch,'MiBand-Agent-Buddy-macos-'+arch+'.zip')]
        for name in ['MiBand-Agent-Buddy-macos-'+arch+'.dmg','MiBand-Agent-Buddy-windows-'+arch+'-setup.exe','MiBand-Agent-Buddy-source-'+arch+'.tar.gz','MiBand-Agent-Buddy-source-windows-'+arch+'.tar.gz']:
            assets.append((name+'.sha256',name))
        for checksum,name in assets:
            content=('synthetic artifact '+name).encode()
            (root/name).write_bytes(content)
            (root/checksum).write_text(hashlib.sha256(content).hexdigest()+'  '+name+'\n')
    verify(root)
    for name in ['MiBand-Agent-Buddy-windows-arm64-setup.exe','MiBand-Agent-Buddy-macos-x64.dmg']:
        path=root/name;content=path.read_bytes();path.unlink()
        try:
            verify(root)
            raise AssertionError('missing desktop installer accepted')
        except ValueError:
            pass
        path.write_bytes(content)
    installer=root/'MiBand-Agent-Buddy-windows-arm64-setup.exe'
    content=installer.read_bytes()
    installer.write_bytes(content+b'corrupt')
    try:
        verify(root)
        raise AssertionError('corrupt checksum accepted')
    except ValueError:
        pass
    installer.write_bytes(content);verify(root)
`],{cwd:new URL('../../',import.meta.url),encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
});

test('desktop release versions agree across npm, Tauri and Cargo', () => {
  const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
  const version = JSON.parse(read('package.json')).version;
  assert.equal(JSON.parse(read('apps/desktop/src-tauri/tauri.conf.json')).version, version);
  assert.equal(read('apps/desktop/src-tauri/Cargo.toml').match(/^version = "([^"]+)"/m)[1], version);
  assert.ok(read('CHANGELOG.md').split('\n').some(line => line.startsWith('## [' + version + ']')));
});
