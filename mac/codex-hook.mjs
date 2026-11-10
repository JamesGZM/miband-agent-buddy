import { pathToFileURL } from 'node:url';
import { runHook } from '../services/runtime/bin/codex-hook.mjs';
export { sanitizeHook, forwardHook } from '../services/runtime/bin/codex-hook.mjs';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runHook();
