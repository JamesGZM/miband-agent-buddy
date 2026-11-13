import {readFile} from 'node:fs/promises';
import {isMainModule} from '../src/adapters/entrypoint.mjs';
import {validateActivity} from '../src/adapters/activity-contract.mjs';
import {submitActivity} from '../src/adapters/activity-client.mjs';

export async function runBuddyCli(args, {submit = submitActivity} = {}) {
  if (args.length === 1 && ['guide', '--help'].includes(args[0])) {
    return {text: await readFile(new URL('../integration-guide.md', import.meta.url), 'utf8')};
  }
  if (args.length === 1 && args[0] === 'status') return {value: await submit({operation: 'status'})};
  try {
    if (args[0] !== 'report' || args.length !== 11) throw Error('Invalid arguments');
    const activity = {};
    for (let i = 1; i < args.length; i += 2) {
      const key = args[i].slice(2);
      if (!['source', 'session', 'run', 'seq', 'state'].includes(key) || !args[i].startsWith('--') || key in activity) throw Error('Invalid arguments');
      activity[key] = ['run', 'seq'].includes(key) && /^[1-9][0-9]*$/.test(args[i + 1]) ? Number(args[i + 1]) : args[i + 1];
    }
    return {value: await submit({operation: 'report', activity: validateActivity(activity)})};
  } catch {return {value: {accepted: false, code: 'invalid_arguments'}};}
}

if (isMainModule(import.meta.url)) {
  // Observational commands always fail open, with a machine-readable outcome.
  try {
    const result = await runBuddyCli(process.argv.slice(2));
    process.stdout.write(result.text || JSON.stringify(result.value) + '\n');
  } catch {process.stdout.write('{"accepted":false,"code":"unavailable"}\n');}
}
