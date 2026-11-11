// Platform access stays here; renderers and feature code use this small surface.
export function createBridge(invoke, {
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = timer => clearTimeout(timer),
  timeoutMs = 5000,
} = {}) {
  return {
    available: typeof invoke === 'function',
    getState: () => {
      let timer;
      const timeout = new Promise((resolve, reject) => {
        timer = schedule(() => reject(new Error('Local state read timed out')), timeoutMs);
      });
      // Race only the read; a late native response cannot replace a newer state.
      return Promise.race([
        Promise.resolve().then(() => invoke('get_state')),
        timeout,
      ]).finally(() => cancel(timer));
    },
    openLogin: region => invoke('open_login', {region}),
    finishLogin: region => invoke('finish_login', {region}),
    action: (operation, value) => invoke('action', {operation, value}),
    copyText: async text => {
      if (globalThis.navigator?.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(text); return; } catch {}
      }
      const field = document.createElement('textarea');
      field.value = text;
      field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(field);
      try {
        field.select();
        if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
      } finally { field.remove(); }
    },
  };
}
export const bridge = createBridge(globalThis.__TAURI__?.core?.invoke);
