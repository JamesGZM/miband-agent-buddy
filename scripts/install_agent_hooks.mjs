import {readFile, writeFile, mkdir, rename, rm, lstat, stat, open, chmod, realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {dirname, join, isAbsolute, resolve, relative, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {EVENTS} from '../services/runtime/src/core/codex-state.mjs';
import {CLAUDE_EVENTS} from '../services/runtime/src/adapters/agent-hook.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const defaultBackupDirectory = join(homedir(), 'Library', 'Application Support',
  'io.github.jamesgzm.miband-agent-buddy', 'hook-backups');

export function hookDefinitions(provider, {nodePath = process.execPath, root = projectRoot} = {}) {
  if (!['codex', 'claude-code'].includes(provider)) throw Error('Unsupported hook provider');
  const events = provider === 'codex' ? EVENTS : CLAUDE_EVENTS;
  const script = join(root, provider === 'codex' ? 'mac/codex-hook.mjs' : 'services/runtime/bin/agent-hook.mjs');
  return Object.fromEntries(events.map(event => [event, {
    hooks: [{type: 'command', command: `${quote(nodePath)} ${quote(script)} ${provider === 'codex' ? '' : 'claude-code '}${event}`,
      timeout: 2, async: !(provider === 'codex' && event === 'SessionEnd')}],
  }]));
}

function validateConfig(root) {
  if (!object(root) || (root.hooks !== undefined && !object(root.hooks))) throw Error('Invalid hooks configuration');
  for (const groups of Object.values(root.hooks || {})) {
    if (!Array.isArray(groups) || groups.some(group => !object(group) || !Array.isArray(group.hooks) || group.hooks.some(hook => !object(hook)))) {
      throw Error('Invalid hook groups');
    }
  }
}

export function updateHookConfig(original, definitions, {remove = false} = {}) {
  validateConfig(original);
  const root = structuredClone(original);
  let changed = false;
  for (const [event, definition] of Object.entries(definitions)) {
    const command = definition.hooks[0].command;
    const matches = hook => hook.type === 'command' && hook.command === command;
    const groups = root.hooks?.[event] || [];
    if (remove) {
      const next = [];
      for (const group of groups) {
        const hooks = group.hooks.filter(hook => !matches(hook));
        if (hooks.length === group.hooks.length) next.push(group);
        else {
          changed = true;
          if (hooks.length) next.push({...group, hooks});
        }
      }
      if (next.length) root.hooks[event] = next;
      else if (groups.length) delete root.hooks[event];
    } else if (groups.some(group => (!group.matcher || group.matcher === '*') && group.hooks.some(matches))) {
      for (const group of groups) for (const hook of group.hooks) {
        if (!matches(hook)) continue;
        for (const field of ['async', 'timeout']) if (hook[field] !== definition.hooks[0][field]) {
          hook[field] = definition.hooks[0][field];
          changed = true;
        }
      }
    } else {
      root.hooks ??= {};
      root.hooks[event] = [...groups, structuredClone(definition)];
      changed = true;
    }
  }
  if (remove && changed && Object.keys(root.hooks).length === 0) delete root.hooks;
  return {root, changed};
}

export function hookConfigPath(provider, {scope = 'user', projectRoot: targetRoot} = {}) {
  if (!['codex', 'claude-code'].includes(provider)) throw Error('Unsupported hook provider');
  if (!['user', 'project'].includes(scope)) throw Error('Invalid hook scope');
  if (scope === 'project') {
    if (typeof targetRoot !== 'string' || !isAbsolute(targetRoot)) throw Error('Project scope requires an absolute --project-root');
    return join(targetRoot, provider === 'codex' ? '.codex/hooks.json' : '.claude/settings.local.json');
  }
  if (targetRoot !== undefined) throw Error('--project-root requires --scope project');
  return provider === 'codex' ? join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'hooks.json') :
    join(homedir(), '.claude', 'settings.json');
}

async function readConfig(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile()) throw Error('Hook configuration must be a regular file');
    const source = await readFile(path, 'utf8');
    const root = JSON.parse(source);
    validateConfig(root);
    return {root, source, exists: true};
  } catch (error) {
    if (error.code === 'ENOENT') return {root: {}, source: null, exists: false};
    // JSON parser messages can contain configuration fragments.
    if (error instanceof SyntaxError) throw Error('Invalid hooks JSON; existing configuration was not changed');
    throw error;
  }
}

async function conflictingScopes(provider, configPath, targetRoot, userConfigPath, ancestorRoot) {
  const candidates = new Set([userConfigPath]);
  if (provider === 'codex') candidates.add(join(dirname(userConfigPath), 'config.toml'));
  for (let directory = resolve(targetRoot); directory; directory =
    directory === ancestorRoot || dirname(directory) === directory ? null : dirname(directory)) {
    if (provider === 'codex') {
      candidates.add(join(directory, '.codex', 'hooks.json'));
      candidates.add(join(directory, '.codex', 'config.toml'));
    } else {
      candidates.add(join(directory, '.claude', 'settings.json'));
      candidates.add(join(directory, '.claude', 'settings.local.json'));
    }
  }
  const found = [];
  const hasCommand = text => provider === 'codex' ? text.includes('/mac/codex-hook.mjs') :
    text.includes('/services/runtime/bin/agent-hook.mjs') && /\bclaude-code\b/.test(text);
  for (const path of candidates) {
    if (resolve(path) === resolve(configPath)) continue;
    if (path.endsWith('.toml')) {
      let source;
      try { source = await readFile(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      let hookSection = false;
      for (const line of source.split('\n')) {
        const section = line.match(/^\s*\[\[?\s*([^\]]+)\]/);
        if (section) hookSection = /^hooks(?:\.|$)/.test(section[1].trim());
        if (hookSection && !/^\s*#/.test(line) && hasCommand(line)) { found.push(path); break; }
      }
    } else {
      const {root} = await readConfig(path);
      if (Object.values(root.hooks || {}).some(groups => groups.some(group =>
        group.hooks.some(hook => hook.type === 'command' && typeof hook.command === 'string' && hasCommand(hook.command))))) found.push(path);
    }
  }
  return found;
}

async function checkProjectTarget(targetRoot, configPath) {
  const root = await realpath(targetRoot);
  const lexical = relative(resolve(targetRoot), resolve(configPath));
  if (lexical === '..' || lexical.startsWith('..' + sep) || isAbsolute(lexical)) throw Error('Hook configuration must stay inside the project');
  let directory = dirname(configPath);
  while (true) {
    try {
      const info = await lstat(directory);
      if (!info.isDirectory()) throw Error('Project hook directory must not be a link');
      const inside = relative(root, await realpath(directory));
      if (inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) throw Error('Hook configuration must stay inside the project');
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      directory = dirname(directory);
    }
  }
}

export async function manageAgentHooks({provider, remove = false, dryRun = false, status = false,
  scope = 'user', projectRoot: targetRoot, configPath, backupDirectory = defaultBackupDirectory,
  userConfigPath, ancestorRoot, ...definitionOptions}) {
  const defaultPath = hookConfigPath(provider, {scope, projectRoot: targetRoot});
  configPath ??= defaultPath;
  userConfigPath ??= hookConfigPath(provider);
  if (scope === 'project' && !(await stat(targetRoot)).isDirectory()) throw Error('Project root must be an existing directory');
  if (ancestorRoot !== undefined) {
    if (!isAbsolute(ancestorRoot) || !targetRoot) throw Error('Invalid ancestor scope');
    ancestorRoot = resolve(ancestorRoot);
    const inside = relative(ancestorRoot, resolve(targetRoot));
    if (inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) throw Error('Invalid ancestor scope');
  }
  const definitions = hookDefinitions(provider, definitionOptions);

  async function perform() {
    const current = await readConfig(configPath);
    const conflictingPaths = scope === 'project' ? await conflictingScopes(provider, configPath, targetRoot, userConfigPath, ancestorRoot) : [];
    const blocked = !remove && conflictingPaths.length > 0;
    const update = updateHookConfig(current.root, definitions, {remove});
    const output = status || dryRun || blocked ? current.root : update.root;
    const installedEvents = Object.entries(definitions).filter(([event, definition]) =>
      output.hooks?.[event]?.some(group => (!group.matcher || group.matcher === '*') &&
        group.hooks.some(hook => hook.type === 'command' && hook.command === definition.hooks[0].command))).length;
    const result = {provider, scope, path: configPath, installed: installedEvents === Object.keys(definitions).length,
      installedEvents, totalEvents: Object.keys(definitions).length, changed: !status && !blocked && update.changed,
      needsUpgrade: !remove && Object.entries(definitions).some(([event, definition]) =>
        output.hooks?.[event]?.some(group => group.hooks.some(hook => hook.type === 'command' &&
          hook.command === definition.hooks[0].command &&
          (hook.async !== definition.hooks[0].async || hook.timeout !== definition.hooks[0].timeout)))),
      backupPath: null, blocked, reason: blocked ? 'existing_scope' : null, conflictingPaths};
    if (status || dryRun || blocked || !update.changed) return result;
    const suffix = randomUUID();
    const temporary = configPath + '.buddy-' + suffix + '.tmp';
    try {
      await writeFile(temporary, JSON.stringify(update.root, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
      if (current.exists) {
        await mkdir(backupDirectory, {recursive: true, mode: 0o700});
        if (!(await lstat(backupDirectory)).isDirectory()) throw Error('Backup location must be a private directory');
        if (targetRoot) {
          const inside = relative(await realpath(targetRoot), await realpath(backupDirectory));
          if (inside === '' || (inside !== '..' && !inside.startsWith('..' + sep) && !isAbsolute(inside))) throw Error('Backup location must be outside the project');
        }
        await chmod(backupDirectory, 0o700);
        result.backupPath = join(backupDirectory, `${provider}-${suffix}.json`);
        await writeFile(result.backupPath, current.source, {mode: 0o600, flag: 'wx'});
      }
      // The lock serializes Buddy writers; also catch external edits before replacement.
      const latest = await readConfig(configPath);
      if (latest.source !== current.source) throw Error('Hooks configuration changed; please retry');
      await rename(temporary, configPath);
    } finally { await rm(temporary, {force: true}); }
    return result;
  }

  if (status || dryRun) return perform();
  if (scope === 'project') await checkProjectTarget(targetRoot, configPath);
  await mkdir(dirname(configPath), {recursive: true});
  if (scope === 'project') await checkProjectTarget(targetRoot, configPath);
  const lockPath = configPath + '.buddy-lock';
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw Error('Another Buddy hook update holds the configuration lock; retry after it finishes');
    throw error;
  }
  try { return await perform(); }
  finally {
    try { await lock.close(); }
    finally { await rm(lockPath, {force: true}); }
  }
}

export async function runHookInstaller(args = process.argv.slice(2)) {
  const [provider, ...flags] = args;
  const options = {provider};
  for (let index = 0; index < flags.length; index++) {
    const flag = flags[index];
    if (['--scope', '--project-root'].includes(flag)) {
      const value = flags[++index];
      if (!value || value.startsWith('--')) throw Error('Missing hook option value');
      options[flag === '--scope' ? 'scope' : 'projectRoot'] = value;
    } else if (!['--uninstall', '--dry-run', '--status', '--json'].includes(flag)) {
      throw Error('Invalid hook option');
    }
  }
  if (flags.includes('--status') && (flags.includes('--uninstall') || flags.includes('--dry-run'))) throw Error('Invalid hook option combination');
  const result = await manageAgentHooks({...options, remove: flags.includes('--uninstall'),
    dryRun: flags.includes('--dry-run'), status: flags.includes('--status')});
  if (flags.includes('--json')) process.stdout.write(JSON.stringify(result) + '\n');
  else process.stdout.write(result.blocked ? `${provider}: Buddy hooks already exist in another scope. Inspect conflictingPaths with --status --json and keep one scope; no hooks were changed.\n` :
    `${provider}: ${result.installedEvents}/${result.totalEvents} hooks installed${flags.includes('--dry-run') ? ' (preview only)' : ''}. Review trust with /hooks.\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await runHookInstaller(); }
  catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
