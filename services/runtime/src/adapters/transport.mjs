import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** Owns one child and its readers. Protocol and reconnect policy live in core. */
export function transportFactory(binary, {spawnChild = spawn, killAfter = 1500} = {}) {
  return ({onEvent, onError, onClose}) => {
    let child = null, lines = null, closing = null;
    return {
      start(credentials) {
        child = spawnChild(binary, [], {stdio: ['pipe', 'pipe', 'ignore']});
        child.stdin.on('error', () => {});
        child.once('error', onError);
        child.once('close', (code, signal) => {lines?.close(); onClose({
          code:Number.isInteger(code)?code:null,
          signal:['SIGTERM','SIGKILL','SIGABRT','SIGSEGV','SIGBUS'].includes(signal)?signal:null,
        });});
        lines = createInterface({input: child.stdout});
        lines.on('line', line => {
          if (line.length > 65536) return;
          let event;
          try {event = JSON.parse(line);} catch {return;}
          onEvent(event);
        });
        child.stdin.write(JSON.stringify(credentials) + '\n');
      },
      write(command) {
        if (!child?.stdin.writable) return false;
        return child.stdin.write(JSON.stringify(command) + '\n');
      },
      kill() {child?.kill('SIGTERM');},
      stop() {
        if (closing) return closing;
        if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
        closing = new Promise(resolve => {
          const force = setTimeout(() => child.kill('SIGKILL'), killAfter);
          child.once('close', () => {clearTimeout(force); resolve();});
          child.stdin.end();
          child.kill('SIGTERM');
        });
        return closing;
      },
    };
  };
}
