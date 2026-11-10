import { createRuntime } from '../../services/runtime/src/core/runtime.mjs';

export function fakeClock() {
  let at = 1000000, id = 0;
  const timers = new Map();
  const clock = {
    now: () => at,
    schedule(fn, delay) {const token = ++id; timers.set(token, {at: at + delay, fn}); return token;},
    cancel(token) {timers.delete(token);},
    get size() {return timers.size;},
    async advance(ms) {
      const until = at + ms;
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        at = next[1].at; timers.delete(next[0]);
        await next[1].fn();
        await Promise.resolve();
      }
      at = until;
    },
  };
  return clock;
}

export function runtimeHarness({onWrite = () => {}, sample, timings} = {}) {
  const clock = fakeClock(), states = [], children = [], calls = [];
  let id = 0;
  const runtime = createRuntime({
    ...clock, now: clock.now, schedule: clock.schedule, cancel: clock.cancel,
    makeId: () => String(++id), packagePath: '/fixture/buddy.debug.rpk', timings,
    sample: sample || (async () => ({cpu: 42})),
    emit: value => states.push(structuredClone(value)),
    createTransport(handlers) {
      const child = {
        handlers, stopped: 0, killed: 0,
        event(value) {handlers.onEvent(value);},
        later(value) {clock.schedule(() => child.event(value), 0);},
        start() {},
        write(command) {calls.push(structuredClone(command)); onWrite(command, child); return true;},
        kill() {child.killed++; handlers.onClose();},
        async stop() {child.stopped++; handlers.onClose();},
      };
      children.push(child);
      return child;
    },
  });
  return {
    runtime, clock, states, children, calls,
    get state() {return states.at(-1);},
    async connect() {
      await runtime.start();
      await runtime.dispatch({op: 'connect', address: 'fixture', key: '0'.repeat(32)});
      children.at(-1).event({event: 'authenticated'});
    },
    hook(event) {runtime.acceptHook({event, session: 'a'.repeat(64), at: clock.now()});},
  };
}

export function ack(payload, extra = {}) {
  return {event: 'ack', ack: {v: 1, type: 'ack', session: payload.session, seq: payload.seq,
    received: 1, keepScreen: 'off', ...extra}};
}
