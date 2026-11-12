import {pathToFileURL} from 'node:url';
import {sanitizeAgentHook} from '../src/adapters/agent-hook.mjs';
import {dispatchHook} from '../src/adapters/hook-delivery.mjs';

export async function runAgentHook(args = process.argv.slice(2), input = process.stdin, {
  dispatch = dispatchHook, at = Date.now(),
} = {}) {
  const watchdog = setTimeout(() => process.exit(0), 150);
  try {
    const [provider, event, flag, session] = args;
    let data;
    if (args.length === 4 && flag === '--session') {
      data = {hook_event_name: event, session_id: session};
    } else if (args.length === 2) {
      let body = '', bytes = 0;
      for await (const chunk of input) {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 2 * 1024 * 1024) throw Error('Input too large');
        body += chunk;
      }
      data = JSON.parse(body);
    } else throw Error('Invalid arguments');
    dispatch(sanitizeAgentHook(data, provider, event, at));
  } catch {
    // Observational only: never print payloads or influence permission decisions.
  } finally { clearTimeout(watchdog); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runAgentHook();
