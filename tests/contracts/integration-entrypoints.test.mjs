import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runBuddyCli} from '../../services/runtime/bin/buddy-cli.mjs';
import {isMainModule} from '../../services/runtime/src/adapters/entrypoint.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('CLI guide executes through a linked installation path with either Node symlink mode', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'buddy-linked-entry-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const linked = join(directory, 'linked-installation');
  await symlink(root, linked, process.platform === 'win32' ? 'junction' : 'dir');
  const expected = await readFile(join(root, 'services/runtime/integration-guide.md'), 'utf8');
  for (const flags of [[], ['--preserve-symlinks-main']]) {
    const {stdout, stderr} = await promisify(execFile)(process.execPath,
      [...flags, join(linked, 'services/runtime/bin/buddy-cli.mjs'), 'guide'], {cwd: directory, timeout: 5000});
    assert.equal(stderr, '');
    assert.ok(stdout === expected, 'linked CLI must print the complete guide');
  }
});

test('entrypoint identity distinguishes linked CLI/runtime files from imports and invalid arguments', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'buddy-entry-identity-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const linked = join(directory, 'linked-installation');
  await symlink(root, linked, process.platform === 'win32' ? 'junction' : 'dir');
  for (const entry of ['buddy-cli.mjs', 'buddy-runtime.mjs']) {
    const moduleUrl = new URL('../../services/runtime/bin/' + entry, import.meta.url).href;
    assert.equal(isMainModule(moduleUrl, join(linked, 'services/runtime/bin', entry)), true);
    assert.equal(isMainModule(moduleUrl, fileURLToPath(import.meta.url)), false);
    assert.equal(isMainModule(moduleUrl, moduleUrl), false, 'an import URL argument is not an executable path');
    assert.equal(isMainModule(moduleUrl, join(directory, 'missing.mjs')), false);
    assert.equal(isMainModule(moduleUrl, ''), false);
  }
});

test('retired source installers are absent while runtime compatibility entries remain', async () => {
  for (const name of ['install_agent_hooks.mjs', 'install_codex_hooks.mjs']) {
    await assert.rejects(stat(join(root, 'scripts', name)), {code: 'ENOENT'});
  }
  for (const name of ['mac/codex-hook.mjs', 'mac/buddy-runtime.mjs']) assert.ok((await stat(join(root, name))).isFile());
  for (const name of ['services/runtime/bin/buddy-mcp.mjs', 'services/runtime/src/adapters/buddy-mcp.mjs']) {
    await assert.rejects(stat(join(root, name)), {code: 'ENOENT'});
  }
});

test('the public npm compatibility command prints the integration guide without changing host configuration', async t => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['hooks:install'], 'node services/runtime/bin/buddy-cli.mjs guide');
  const directory = await mkdtemp(join(tmpdir(), 'buddy-guide-entry-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const configs = ['.codex/hooks.json', '.claude/settings.local.json', '.cursor/hooks.json'];
  const original = '{"syntheticSetting":"preserve","hooks":{}}\n';
  for (const file of configs) {
    await mkdir(join(directory, file.split('/')[0]));
    await writeFile(join(directory, file), original);
  }
  const before = await readdir(directory);
  const {stdout, stderr} = await promisify(execFile)(process.execPath,
    [join(root, 'services/runtime/bin/buddy-cli.mjs'), 'guide'], {cwd: directory, timeout: 5000});
  assert.equal(stderr, '');
  assert.match(stdout, /continuous automatic status reporting/);
  assert.match(stdout, /Automatic trigger/);
  assert.match(stdout, /Delivery channel/);
  assert.deepEqual(await readdir(directory), before);
  for (const file of configs) assert.equal(await readFile(join(directory, file), 'utf8'), original);
});

test('guide entry is self-contained and old installer flags cannot trigger an installation', async () => {
  const submit = () => {throw Error('Guide must not contact the runtime');};
  const guide = await runBuddyCli(['guide'], {submit});
  assert.match(guide.text, /MiBand Agent Buddy/);
  const result = await runBuddyCli(['guide', '--scope', 'user', '--uninstall'], {submit});
  assert.deepEqual(result.value, {accepted: false, code: 'invalid_arguments'});
});

test('bundled setup requires persistent user-wide automation rather than a CLI or project-only test', async () => {
  const {text} = await runBuddyCli(['guide']);
  assert.match(text, /user-wide automatic reporting/);
  assert.match(text, /all local projects, new main conversations and later turns/);
  assert.match(text, /Do not silently fall back to project-only configuration/);
  assert.match(text, /Complete the feasible setup in this setup turn/);
  assert.match(text, /A successful CLI test is an intermediate transport check/);
  assert.match(text, /Hooks are one possible mechanism, not a requirement/);
  assert.match(text, /independent of the current project and working directory/);
  assert.match(text, /new main conversation in a different project/);
  assert.match(text, /Native review, trust or reload pending/);
  assert.match(text, /Do not create a reusable installer\/uninstaller/);
  assert.match(text, /Do not depend on another application's private Node\/interpreter/);
  assert.match(text, /Nonblocking observation and ordered delivery/);
  assert.match(text, /A lock alone prevents concurrent writes but does not recover callback order/);
  assert.match(text, /300ms ingress deadline covers only local submission/);
  assert.match(text, /an event-loop timer cannot interrupt synchronous child execution/);
  assert.doesNotMatch(text, /use project scope where supported|goal is[^\n]*selected main conversation/);
});

test('current localized guides do not instruct users to run retired installers or upgrades', async () => {
  for (const locale of ['en', 'zh-CN', 'zh-TW']) {
    const guide = await readFile(join(root, 'docs', locale, 'development/hooks.md'), 'utf8');
    assert.doesNotMatch(guide, /node scripts\/install_|needsUpgrade|manageAgentHooks/);
    assert.match(guide, /npm run hooks:install/);
  }
});
