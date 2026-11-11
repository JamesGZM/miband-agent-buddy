/** Inventory supplies numeric codes; a live ACK can confirm the bundled version by name. */
export function initialBuddyState(available = null) {
  return {status: 'unknown', installed: null, installedVersionCode: null, installedVersion: null,
    availableVersion: available?.versionName ?? null, availableVersionCode: available?.versionCode ?? null,
    checkedAt: null, error: null};
}

export function checkedBuddyState(previous, {installed, versionCode}, at) {
  const installedVersion = installed && previous.installedVersionCode === versionCode ? previous.installedVersion : null;
  const status = installed ? installedStatus(previous, versionCode, installedVersion) : 'not_installed';
  return {...previous, installed, installedVersionCode: installed ? versionCode ?? null : null,
    installedVersion,
    status, checkedAt: at, error: null};
}

function installedStatus(previous, versionCode, versionName) {
  const matchesBundled = typeof versionName === 'string' && versionName.length > 0 && versionName === previous.availableVersion;
  if (Number.isInteger(versionCode) && Number.isInteger(previous.availableVersionCode)) {
    if (versionCode > previous.availableVersionCode) return 'newer';
    if (versionCode === previous.availableVersionCode || matchesBundled) return 'current';
    return 'update_available';
  }
  return matchesBundled ? 'current' : 'installed';
}

export function acknowledgedBuddyState(previous, versionName) {
  if (typeof versionName !== 'string' || !versionName.length) {
    return {...previous, installed: true,
      status: ['unknown', 'not_installed'].includes(previous.status) ? 'installed' : previous.status};
  }
  // An unchanged cached inventory must not undo a newer application receipt.
  // Keep its reported code; a display version does not establish a numeric code.
  const status = ['checking', 'installing'].includes(previous.status) ? previous.status
    : installedStatus(previous, previous.installedVersionCode, versionName);
  return {...previous, installed: true, installedVersion: versionName, status, error: null};
}
