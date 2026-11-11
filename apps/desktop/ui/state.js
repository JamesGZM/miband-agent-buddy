export function initialState() {
  return {
    loggedIn: false,
    devices: [],
    preferences: {appTheme: 'claude', appearance: 'system', keepScreen: false, activityKeepAwake: false, powerSaving: false, syncEnabled: true, background: true, wakeHoldSeconds: 20},
    runtime: {},
  };
}
