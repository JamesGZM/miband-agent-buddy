// Private desktop/runtime and runtime/transport JSON Lines boundaries.
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
function integer(value, min, max) {
  return typeof value === 'number' && isFinite(value) && value % 1 === 0 && value >= min && value <= max;
}
function optionalInteger(value, min, max) {
  return value === undefined || value === null || integer(value, min, max);
}
function validSettings(value) {
  return object(value) &&
    (value.buddyTheme === undefined || ['chatgpt', 'claude', 'deepseek'].indexOf(value.buddyTheme) >= 0) &&
    (value.wakeHoldMs === undefined || integer(value.wakeHoldMs, 5000, 1800000)) &&
    (value.keepScreen === undefined || typeof value.keepScreen === 'boolean') &&
    (value.revision === undefined || (typeof value.revision === 'number' && isFinite(value.revision) && value.revision >= 0 && value.revision % 1 === 0));
}
function validRequest(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);
}
function decodeRuntimeCommand(value) {
  if (!object(value)) throw new Error('Invalid command');
  switch (value.op) {
    case 'connect':
      if (typeof value.address !== 'string' || !value.address || value.address.length > 128 ||
          typeof value.key !== 'string' || !/^[a-fA-F0-9]{32}$/.test(value.key) ||
          (value.settings !== undefined && !validSettings(value.settings))) throw new Error('Invalid connection');
      break;
    case 'configure':
      if (!validSettings(value.settings) || (value.request !== undefined && !validRequest(value.request))) throw new Error('Invalid settings');
      break;
    case 'show_page':
      if (!validRequest(value.request) || [0, 1].indexOf(value.page) < 0) throw new Error('Invalid page');
      break;
    case 'wake':
      if (!validRequest(value.request)) throw new Error('Invalid wake');
      break;
    case 'pause':
      if (typeof value.value !== 'boolean') throw new Error('Invalid pause');
      break;
    case 'disconnect': case 'install': case 'refresh_device': break;
    case 'reset_activity':
      if (Object.keys(value).length !== 1) throw new Error('Invalid activity reset');
      break;
    default: throw new Error('Unknown command');
  }
  return value;
}
function decodeTransportEvent(value) {
  if (!object(value)) throw new Error('Invalid transport event');
  switch (value.event) {
    case 'transport': case 'authenticated': case 'conflict': break;
    case 'battery':
      if (typeof value.percent !== 'number' || !isFinite(value.percent) || value.percent < 0 || value.percent > 100) throw new Error('Invalid battery');
      break;
    case 'progress':
      if (typeof value.progress !== 'number' || !isFinite(value.progress)) throw new Error('Invalid progress');
      break;
    case 'ack':
      if (!object(value.ack)) throw new Error('Invalid ACK');
      break;
    case 'device':
      if (!optionalInteger(value.battery, 0, 100) ||
          (value.charging != null && typeof value.charging !== 'boolean') ||
          (value.firmware != null && (typeof value.firmware !== 'string' || value.firmware.length > 64)) ||
          (value.model != null && (typeof value.model !== 'string' || value.model.length > 64)) ||
          !optionalInteger(value.storageTotal, 0, 9007199254740991) ||
          !optionalInteger(value.storageFree, 0, 9007199254740991) ||
          (value.storageTotal != null && value.storageFree != null && value.storageFree > value.storageTotal)) throw new Error('Invalid device');
      break;
    case 'result':
      if ((typeof value.id !== 'string' && typeof value.id !== 'number') || typeof value.ok !== 'boolean' ||
          (value.code != null && typeof value.code !== 'string')) throw new Error('Invalid result');
      break;
    case 'error':
      if (typeof value.code !== 'string' || typeof value.message !== 'string') throw new Error('Invalid error');
      break;
    default: throw new Error('Unknown transport event');
  }
  return value;
}
module.exports = {decodeRuntimeCommand: decodeRuntimeCommand, decodeTransportEvent: decodeTransportEvent};
