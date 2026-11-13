import protocol from "../../../../packages/buddy-shared/protocol/snapshot.js";
const { matchesAck } = protocol;
export function confirmedSettings(ack, settings) {
  return (
    ack?.settingsApplied === true &&
    ack.buddyTheme === settings.buddyTheme &&
    ack.settingsRevision === settings.revision
  );
}
export function acceptAck(ack, pending) {
  return !!pending && matchesAck(ack, pending);
}
export function reconnectDelay(attempt) {
  return attempt > 8 ? null : Math.min(30000, 1000 * 2 ** attempt);
}

export function canRetryTransportError(code) {
  return code !== "auth_rejected" && code !== "conflict";
}

export function channelEvidence(ack) {
  const value=ack?.capabilities?.channelLifecycle===true ? ack.channelLifecycle : null;
  if(!value || typeof value!=='object' || Array.isArray(value))return null;
  const result={};
  for(const key of ['opens','closes','errors','sendFailures','replays','readyChecks','openedAt','closedAt','firstAt'])
    if(Number.isSafeInteger(value[key])&&value[key]>=0)result[key]=value[key];
  if(['unknown','open','closed'].includes(value.state))result.state=value.state;
  if(['closed','error','send_failed','ready_timeout','ready_closed','ready_failed'].includes(value.firstReason))result.firstReason=value.firstReason;
  if(Number.isInteger(value.firstCode)&&value.firstCode>=0&&value.firstCode<=65535)result.firstCode=value.firstCode;
  for(const key of ['readySupported','reconnected'])if(typeof value[key]==='boolean')result[key]=value[key];
  return result;
}
