import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const worker = fileURLToPath(new URL('../../bin/deliver-hook.mjs', import.meta.url));

export async function deliverHook(event, {endpoint = 'http://127.0.0.1:10731/api/codex-event'} = {}) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw Error('Local endpoint required');
  const response = await fetch(url, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(600),
    headers: {'Content-Type': 'application/json', 'X-Band-Codex': '1'}, body: JSON.stringify(event)});
  if (!response.ok) throw Error('Monitor unavailable');
}

export function dispatchHook(event, {start = spawn} = {}) {
  // Only the sanitized event crosses this process boundary; inherited pipes would keep the host waiting.
  const child = start(process.execPath, [worker, JSON.stringify(event)], {
    detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.on('error', () => {});
  child.unref();
}
