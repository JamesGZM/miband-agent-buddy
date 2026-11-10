// Small ES5-compatible protocol shared with the host-side tests.
function validMetric(m) {
  return m == null || (typeof m === 'object' && typeof m.usedBytes === 'number' && isFinite(m.usedBytes) && m.usedBytes >= 0 && typeof m.totalBytes === 'number' && isFinite(m.totalBytes) && m.totalBytes > 0 && m.usedBytes <= m.totalBytes && typeof m.percent === 'number' && isFinite(m.percent) && m.percent >= 0 && m.percent <= 100 && Math.abs(m.percent-m.usedBytes/m.totalBytes*100)<0.1);
}
function decodeMessage(raw) {
  if (typeof raw !== 'string' || raw.length > 1024) throw new Error('Invalid payload');
  var msg = JSON.parse(raw);
  if (!msg || msg.v !== 1 || msg.type !== 'snapshot' ||
      typeof msg.session !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(msg.session) ||
      typeof msg.seq !== 'number' || msg.seq < 1 || msg.seq > 2147483647 || msg.seq % 1 !== 0 ||
      typeof msg.text !== 'string' || msg.text.length > 32 ||
      typeof msg.value !== 'number' || !isFinite(msg.value) || Math.abs(msg.value) > 999999 ||
      typeof msg.cpu !== 'number' || !isFinite(msg.cpu) || msg.cpu < -1 || msg.cpu > 100 || !validMetric(msg.memory) || !validMetric(msg.disk) ||
      (msg.character !== undefined && msg.character !== null && ['codex','claude'].indexOf(msg.character) < 0) ||
      (msg.buddyTheme != null && (['chatgpt','claude'].indexOf(msg.buddyTheme)<0 || typeof msg.settingsRevision!=='number' || !isFinite(msg.settingsRevision) || msg.settingsRevision<0 || msg.settingsRevision>2147483647 || msg.settingsRevision%1!==0 || typeof msg.keepScreen!=='boolean')) ||
      (msg.command != null && msg.command !== 'exit') ||
      (msg.mode !== undefined && msg.mode !== null && ['idle','thinking','working','attention','complete','sleep','offline','error'].indexOf(msg.mode) < 0)) {
    throw new Error('Invalid snapshot');
  }
  return msg;
}

function acceptMessage(raw, previous) {
  var msg = decodeMessage(raw);
  if (previous && msg.session === previous.session && msg.seq <= previous.seq) return null;
  return msg;
}

function makeAck(msg, keepScreen, received) {
  return { v: 1, type: 'ack', session: msg.session, seq: msg.seq,
    keepScreen: keepScreen, received: received };
}

module.exports = { decodeMessage: decodeMessage, acceptMessage: acceptMessage, makeAck: makeAck };
