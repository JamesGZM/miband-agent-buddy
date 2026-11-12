import {pathToFileURL} from 'node:url';
import {deliverHook} from '../src/adapters/hook-delivery.mjs';
import {EVENTS} from '../src/core/codex-state.mjs';

export async function runDelivery(value = process.argv[2]) {
  const watchdog = setTimeout(() => process.exit(0), 1200);
  try {
    const event = JSON.parse(value);
    if (!event || !EVENTS.includes(event.event) || !/^[a-f0-9]{64}$/.test(event.session) ||
        !Number.isSafeInteger(event.at) || Object.keys(event).sort().join() !== 'at,event,session') return;
    await deliverHook(event);
  } catch {
    // Observational delivery is best effort and never reports decisions or private input.
  } finally { clearTimeout(watchdog); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runDelivery();
