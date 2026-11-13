// Private stdio entry. Only sanitized state leaves this process.
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { isMainModule } from '../src/adapters/entrypoint.mjs';
import { createRuntime } from '../src/core/runtime.mjs';
import { createSampler } from '../src/adapters/metrics.mjs';
import { createHookServer } from '../src/adapters/hook-server.mjs';
import { transportFactory } from '../src/adapters/transport.mjs';
import { transportPath, packagePath } from '../src/adapters/paths.mjs';
import { readBandPackage } from '../src/adapters/band-package.mjs';

export function runRuntime() {
  const runtime = createRuntime({
    createTransport: transportFactory(transportPath), sample: createSampler(),
    makeId: randomUUID, packagePath, bandPackage: readBandPackage(packagePath),
    emit: value => process.stdout.write(JSON.stringify(value) + '\n'),
  });
  const input = createInterface({input: process.stdin});
  input.on('line', line => {
    if (line.length > 32768) return;
    try {void runtime.dispatch(JSON.parse(line));}
    catch {runtime.reportError('操作無法完成');}
  });
  const server = createHookServer({accept: runtime.acceptHook, report: runtime.acceptActivity, status: runtime.activityStatus});
  let stopping = null;
  async function shutdown(code = 0) {
    if (stopping) return stopping;
    process.exitCode = code;
    stopping = Promise.resolve().then(async () => {
      input.close();
      process.off('SIGTERM', terminate);
      process.off('SIGINT', terminate);
      await runtime.stop();
      await new Promise(resolve => server.close(() => resolve()));
    });
    return stopping;
  }
  const terminate = () => {void shutdown();};
  input.on('close', terminate);
  server.on('error', () => {
    runtime.reportError('本機活動端口已被使用；請關閉重複執行的 Buddy');
    void shutdown(1);
  });
  server.listen(10731, '127.0.0.1');
  process.on('SIGTERM', terminate);
  process.on('SIGINT', terminate);
  void runtime.start();
  return {stop: shutdown};
}

if (isMainModule(import.meta.url)) runRuntime();
