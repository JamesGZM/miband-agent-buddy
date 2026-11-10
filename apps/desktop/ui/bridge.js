// Platform access stays here; renderers and feature code use this small surface.
export function createBridge(invoke) {
  return {
    available: typeof invoke === 'function',
    getState: () => invoke('get_state'),
    openLogin: region => invoke('open_login', {region}),
    finishLogin: region => invoke('finish_login', {region}),
    action: (operation, value) => invoke('action', {operation, value}),
  };
}
export const bridge = createBridge(globalThis.__TAURI__?.core?.invoke);
