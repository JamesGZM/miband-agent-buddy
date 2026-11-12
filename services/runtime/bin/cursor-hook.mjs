import {pathToFileURL} from 'node:url';
import {cursorHookResponse, sanitizeCursorHook} from '../src/adapters/cursor-hook.mjs';
import {dispatchHook} from '../src/adapters/hook-delivery.mjs';

export async function runCursorHook(event = process.argv[2], input = process.stdin, {
  dispatch = dispatchHook, at = Date.now(), respond = value => process.stdout.write(JSON.stringify(value) + '\n'),
} = {}) {
  let replied = false;
  const reply = () => {
    if (replied) return;
    replied = true;
    respond(cursorHookResponse(event));
  };
  const watchdog = setTimeout(() => {
    reply();
    // Flush the small, valid response before exiting even when stdin never closes.
    process.stdout.write('', () => process.exit(0));
  }, 150);
  try {
    let body = '', bytes = 0;
    for await (const chunk of input) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 2 * 1024 * 1024) throw Error('Input too large');
      body += chunk;
    }
    dispatch(sanitizeCursorHook(JSON.parse(body), event, at));
  } catch {
    // Observation failures never change the host response or expose the input.
  } finally {
    clearTimeout(watchdog);
    reply();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCursorHook();
