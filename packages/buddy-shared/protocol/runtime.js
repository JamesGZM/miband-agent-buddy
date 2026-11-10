// Private desktop/runtime and runtime/transport JSON Lines boundaries.
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
function validSettings(value) {
  return object(value) &&
    (value.buddyTheme === undefined || ['chatgpt', 'claude'].indexOf(value.buddyTheme) >= 0) &&
    (value.keepScreen === undefined || typeof value.keepScreen === 'boolean') &&
    (value.revision === undefined || (typeof value.revision === 'number' && isFinite(value.revision) && value.revision >= 0 && value.revision % 1 === 0));
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
      if (!validSettings(value.settings)) throw new Error('Invalid settings');
      break;
    case 'pause':
      if (typeof value.value !== 'boolean') throw new Error('Invalid pause');
      break;
    case 'disconnect': case 'install': break;
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
