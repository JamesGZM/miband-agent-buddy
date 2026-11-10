// Compatibility entry for existing source-checkout desktop builds.
import {pathToFileURL} from 'node:url';
import {runRuntime} from '../services/runtime/bin/buddy-runtime.mjs';
export {runRuntime};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runRuntime();
