import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, readdir, stat, mkdir, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hookDefinitions, hookConfigPath, updateHookConfig, manageAgentHooks} from '../../scripts/install_agent_hooks.mjs';

const definitions = hookDefinitions('claude-code',{nodePath:'/fixture/node path',root:"/fixture/Buddy's checkout"});

test('install merges, quotes paths, is idempotent and removes only owned hook commands', () => {
  const existing = {permissions:{allow:['Read']},env:{SYNTHETIC_SETTING:'fixture'},hooks:{Stop:[{matcher:'',hooks:[{type:'command',command:'existing-hook'}]}]}};
  const {root,changed} = updateHookConfig(existing,definitions);
  assert.equal(changed,true);
  assert.deepEqual(root.permissions,existing.permissions);
  assert.deepEqual(root.env,existing.env);
  assert.equal(root.hooks.Stop.length,2);
  assert.equal(existing.hooks.Stop.length,1);
  assert.match(definitions.Stop.hooks[0].command,/^'\/fixture\/node path'/);
  assert.ok(definitions.Stop.hooks[0].command.includes("Buddy'\\''s checkout"));
  assert.equal(updateHookConfig(root,definitions).changed,false);
  const mixed = structuredClone(root);
  mixed.hooks.Stop.at(-1).hooks.push({type:'command',command:'keep-this'});
  const removed = updateHookConfig(mixed,definitions,{remove:true}).root;
  assert.deepEqual(removed.hooks.Stop.flatMap(group=>group.hooks.map(hook=>hook.command)),['existing-hook','keep-this']);
  assert.equal(removed.hooks.UserPromptSubmit,undefined);
  assert.deepEqual(updateHookConfig(root,definitions,{remove:true}).root,existing);
});

test('malformed configuration is rejected and scoped paths are explicit', () => {
  for (const value of [null,[],{hooks:null},{hooks:{Stop:{}}},{hooks:{Stop:[null]}}]) {
    assert.throws(()=>updateHookConfig(value,definitions));
  }
  assert.equal(hookConfigPath('codex',{scope:'project',projectRoot:'/fixture/project'}),'/fixture/project/.codex/hooks.json');
  assert.equal(hookConfigPath('claude-code',{scope:'project',projectRoot:'/fixture/project'}),'/fixture/project/.claude/settings.local.json');
  assert.throws(()=>hookConfigPath('claude-code',{scope:'project',projectRoot:'relative'}));
  assert.throws(()=>hookConfigPath('claude-code',{projectRoot:'/fixture/project'}));
});

test('installation keeps private backup, performs read-only previews and restores other settings on removal', async t => {
  const directory = await mkdtemp(join(tmpdir(),'buddy-hook-fixture-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const configPath = join(directory,'settings.json');
  const original = '{"permissions":{"allow":["Read"]}}\n';
  await writeFile(configPath,original);
  const options = {provider:'claude-code',configPath,nodePath:'/fixture/node',root:'/fixture/buddy',backupDirectory:join(directory,'private-backups')};
  const preview = await manageAgentHooks({...options,dryRun:true});
  assert.equal(preview.changed,true); assert.equal(preview.installed,false);
  assert.equal(await readFile(configPath,'utf8'),original);
  assert.deepEqual(await readdir(directory),['settings.json']);
  const result = await manageAgentHooks(options);
  assert.equal(result.installed,true); assert.equal(result.installedEvents,result.totalEvents);
  assert.equal(await readFile(result.backupPath,'utf8'),original);
  assert.equal((await stat(configPath)).mode & 0o777,0o600);
  assert.equal((await stat(result.backupPath)).mode & 0o777,0o600);
  assert.equal((await stat(options.backupDirectory)).mode & 0o777,0o700);
  assert.ok(result.backupPath.startsWith(options.backupDirectory + '/'));
  assert.ok(!(await readdir(directory)).some(name=>name.includes('.buddy-backup-')));
  const files = await readdir(directory);
  assert.equal((await manageAgentHooks(options)).changed,false);
  assert.equal((await manageAgentHooks({...options,status:true})).installed,true);
  assert.deepEqual(await readdir(directory),files);
  const removed = await manageAgentHooks({...options,remove:true});
  assert.equal(removed.installed,false);
  assert.deepEqual(JSON.parse(await readFile(configPath,'utf8')),JSON.parse(original));
});

test('project installs target the selected project and invalid JSON is left untouched', async t => {
  const directory = await mkdtemp(join(tmpdir(),'buddy-project-fixture-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const options = {provider:'codex',scope:'project',projectRoot:directory,ancestorRoot:directory,nodePath:'/fixture/node',root:'/fixture/buddy',userConfigPath:join(directory,'user-hooks.json')};
  const result = await manageAgentHooks(options);
  assert.equal(result.path,join(directory,'.codex/hooks.json'));
  assert.equal(result.scope,'project');
  assert.ok((await readFile(result.path,'utf8')).includes('mac/codex-hook.mjs'));
  await writeFile(result.path,'{"synthetic-private-text":');
  await assert.rejects(manageAgentHooks(options),error=>!error.message.includes('synthetic-private-text'));
  assert.equal(await readFile(result.path,'utf8'),'{"synthetic-private-text":');
});

test('project backups stay outside the project and duplicate global commands block installation', async t => {
  const directory = await mkdtemp(join(tmpdir(),'buddy-scope-fixture-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const projectRoot = join(directory,'project');
  const backupDirectory = join(directory,'private-backups');
  const userConfigPath = join(directory,'user-settings.json');
  await mkdir(join(projectRoot,'.claude'),{recursive:true});
  const configPath = join(projectRoot,'.claude/settings.local.json');
  const original = {env:{SYNTHETIC_SETTING:'fixture'},permissions:{allow:['Read']}};
  await writeFile(configPath,JSON.stringify(original));
  const options = {provider:'claude-code',scope:'project',projectRoot,ancestorRoot:directory,backupDirectory,userConfigPath,nodePath:'/fixture/node',root:'/fixture/buddy'};
  const global = updateHookConfig({},hookDefinitions('claude-code',{nodePath:'/fixture/previous-node',root:'/fixture/previous-checkout'})).root;
  await writeFile(userConfigPath,JSON.stringify(global));
  const blocked = await manageAgentHooks(options);
  assert.equal(blocked.blocked,true); assert.equal(blocked.reason,'existing_scope');
  assert.equal(blocked.installed,false); assert.equal(blocked.changed,false);
  assert.deepEqual(blocked.conflictingPaths,[userConfigPath]);
  assert.deepEqual(JSON.parse(await readFile(configPath,'utf8')),original);
  assert.deepEqual(await readdir(join(projectRoot,'.claude')),['settings.local.json']);
  await rm(userConfigPath);
  const result = await manageAgentHooks(options);
  assert.equal(result.installed,true); assert.equal(result.blocked,false);
  assert.ok(result.backupPath.startsWith(backupDirectory + '/'));
  assert.deepEqual(JSON.parse(await readFile(result.backupPath,'utf8')),original);
  assert.deepEqual(await readdir(join(projectRoot,'.claude')),['settings.local.json']);
  await assert.rejects(manageAgentHooks({...options,remove:true,backupDirectory:join(projectRoot,'bad-backups')}),/outside the project/);
  assert.equal((await manageAgentHooks({...options,status:true})).installed,true);
});

test('Codex ancestor inline hooks are reported without modifying them', async t => {
  const directory = await mkdtemp(join(tmpdir(),'buddy-ancestor-fixture-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const projectRoot = join(directory,'child');
  await mkdir(projectRoot); await mkdir(join(directory,'.codex'));
  const inline = join(directory,'.codex/config.toml');
  await writeFile(inline,'[[hooks.Stop]]\n[[hooks.Stop.hooks]]\ntype = "command"\ncommand = "node /fixture/buddy/mac/codex-hook.mjs Stop"\n');
  const result = await manageAgentHooks({provider:'codex',scope:'project',projectRoot,ancestorRoot:directory,userConfigPath:join(directory,'user-hooks.json'),dryRun:true});
  assert.equal(result.blocked,true);
  assert.deepEqual(result.conflictingPaths,[inline]);
  assert.deepEqual(await readdir(projectRoot),[]);
});

test('a concurrent Buddy updater cannot overwrite a locked configuration', async t => {
  const directory = await mkdtemp(join(tmpdir(),'buddy-lock-fixture-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const configPath = join(directory,'settings.json');
  const original = '{"permissions":{"allow":["Read"]}}';
  await writeFile(configPath,original);
  await writeFile(configPath+'.buddy-lock','');
  const options = {provider:'claude-code',configPath,backupDirectory:join(directory,'private-backups')};
  await assert.rejects(manageAgentHooks(options),/configuration lock/);
  assert.equal(await readFile(configPath,'utf8'),original);
  await rm(configPath+'.buddy-lock');
  const results = await Promise.allSettled([manageAgentHooks(options),manageAgentHooks(options)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.filter(result=>result.status==='rejected'&&/configuration lock/.test(result.reason.message)).length,1);
  assert.deepEqual(JSON.parse(await readFile(configPath,'utf8')).permissions,{allow:['Read']});
  assert.ok(!(await readdir(directory)).some(name=>name.endsWith('.buddy-lock')));
});

test('project installation rejects linked configuration directories before writing outside the project', async t => {
  const directory = await mkdtemp(join(tmpdir(),'buddy-linked-fixture-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const projectRoot = join(directory,'project'), outside = join(directory,'outside');
  await mkdir(projectRoot); await mkdir(outside);
  const original = '{"unrelated":"fixture"}';
  await writeFile(join(outside,'settings.local.json'),original);
  await symlink(outside,join(projectRoot,'.claude'));
  await assert.rejects(manageAgentHooks({provider:'claude-code',scope:'project',projectRoot,ancestorRoot:directory,
    userConfigPath:join(directory,'user-settings.json'),backupDirectory:join(directory,'private-backups')}),/must not be a link/);
  assert.equal(await readFile(join(outside,'settings.local.json'),'utf8'),original);
  assert.deepEqual(await readdir(outside),['settings.local.json']);
  assert.ok(!(await readdir(directory)).includes('private-backups'));
});
