// Events and bounded recovery evidence, never elapsed task time or metrics, request a wake.
export function createWakePolicy({ now = Date.now, cooldown = 10000, ttl = 60000 } = {}) {
  let pending = null, lastLaunch = -Infinity;
  return {
    observe(event, previous, {coalesce = false} = {}) {
      let reason = null, mode = null;
      if (event.event === 'UserPromptSubmit') { reason = 'start'; mode = 'thinking'; }
      if (event.event === 'PermissionRequest' && previous?.event !== 'PermissionRequest') { reason = 'attention'; mode = 'attention'; }
      if (event.event === 'Stop' && (!previous || ['thinking','working','attention'].includes(previous.mode))) { reason = 'complete'; mode = 'complete'; }
      // A terminal/cancel event invalidates an earlier start for this session.
      if (pending?.session === event.session && ['Stop','Interrupt','SessionEnd'].includes(event.event)) pending = null;
      if (pending?.session === event.session && pending.reason === 'attention' && ['PreToolUse','PostToolUse'].includes(event.event)) pending = null;
      // The current display transaction will carry the latest aggregate state.
      if (coalesce) return;
      if (reason && !(pending?.user && now()-pending.at <= ttl)) {
        const next = { session: event.session, reason, mode, at: now() };
        // Keep at most one event; attention from another session has priority.
        if (!pending || now()-pending.at > ttl || pending.session === event.session || pending.reason !== 'attention' || reason === 'attention') pending = next;
      }
    },
    requestConnection(reason = 'connection') {
      if (!pending || now()-pending.at > ttl) pending = {reason, mode:'idle', at:now()};
    },
    clearConnection(reason) { if (pending?.reason === reason && !pending.user && !pending.session) pending = null; },
    // A direct user operation replaces any queued event and is not rate limited.
    requestUser(kind, operation) {
      pending = {reason: 'user', kind, operation, mode: null, user: true, at: now()};
    },
    take(enabled) {
      if (!enabled) { pending = null; return null; }
      if (pending && now()-pending.at > ttl) pending = null;
      if (!pending || (!pending.user && now()-lastLaunch < cooldown)) return null;
      const next = pending; pending = null; lastLaunch = now(); return next;
    },
    clear() { pending = null; },
    clearEvents() { if (pending?.session) pending = null; },
  };
}
