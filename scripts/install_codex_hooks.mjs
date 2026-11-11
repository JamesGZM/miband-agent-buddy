import {runHookInstaller} from './install_agent_hooks.mjs';
try { await runHookInstaller(['codex', ...process.argv.slice(2)]); }
catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
