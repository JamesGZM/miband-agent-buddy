const events = {thinking: 'UserPromptSubmit', working: 'PreToolUse', needs_user: 'PermissionRequest',
  completed: 'Stop', cancelled: 'Interrupt', failed: 'Interrupt'};
const ended = new Set(['completed', 'cancelled', 'failed']);

// Keep run watermarks even after completion; old deliveries cannot reopen a task.
export function createActivityIngress({accept, now, capacity = 128, rate = 30}) {
  const sessions = new Map();
  let revision = 0;
  return {
    accept(value) {
      if (!value || typeof value.session !== 'string' || value.session.length !== 64 ||
          !/^[a-f0-9]{64}$/.test(value.session) || !Object.hasOwn(events, value.state) ||
          !Number.isSafeInteger(value.run) || value.run < 1 || !Number.isSafeInteger(value.seq) || value.seq < 1) {
        return {accepted: false, code: 'invalid_activity'};
      }
      const old = sessions.get(value.session), at = now();
      if (old && (value.run < old.run || value.run === old.run && (value.seq <= old.seq || ended.has(old.state)))) {
        return {accepted: false, code: 'ignored'};
      }
      if (!old && sessions.size >= capacity) return {accepted: false, code: 'capacity'};
      const count = old && at - old.windowAt < 1000 ? old.count + 1 : 1;
      // Endings may pass the activity rate limit so busy senders can still close.
      if (count > rate && (!ended.has(value.state) || count > rate + 1)) return {accepted: false, code: 'rate_limited'};
      const runStart = !old || value.run > old.run;
      const event = value.state === 'thinking' && !runStart ? 'PostToolUse' : events[value.state];
      const result = accept({event, session: value.session, at, revision: ++revision, runStart});
      if (result === false) return {accepted: false, code: 'capacity'};
      sessions.set(value.session, {...value, windowAt: count === 1 ? at : old.windowAt, count});
      return {accepted: true, code: 'accepted'};
    },
    reset() {sessions.clear();},
  };
}
