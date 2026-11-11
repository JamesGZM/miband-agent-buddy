const ACTIVE = new Set(['thinking', 'working', 'attention']);
const TERMINAL = new Set(['accepted', 'error']);
const TTL = 60000;
const LIMIT = 128;

export function createCompletionQueue({now, makeId}) {
  let waiting = [], flight = null;
  function expire() {
    const at = now();
    waiting = waiting.filter(time => at >= time && at - time < TTL);
    if (flight && (at < flight.at || at - flight.at >= TTL)) flight = null;
  }
  return {
    observe(event, previous, enabled) {
      expire();
      if (enabled && event.event === 'Stop' && ACTIVE.has(previous?.mode) &&
          waiting.length + (flight?.count || 0) < LIMIT) waiting.push(now());
    },
    plan(supported) {
      expire();
      if (!supported) return null;
      if (!flight && waiting.length) {
        flight = {id: makeId(), count: waiting.length, at: waiting[0]};
        waiting = [];
      }
      return flight ? {id: flight.id, count: flight.count} : null;
    },
    acknowledge(receipt) {
      if (flight && receipt?.id === flight.id && TERMINAL.has(receipt.status)) flight = null;
    },
    clear() { waiting = []; flight = null; },
  };
}
