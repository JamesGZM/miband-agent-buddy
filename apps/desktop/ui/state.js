export function initialState() {
  return {
    loggedIn: false,
    devices: [],
    preferences: {appTheme: 'claude', appearance: 'system', keepScreen: false, background: true, wakeHoldSeconds: 20},
    runtime: {},
  };
}
