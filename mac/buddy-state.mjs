import { matchesAck } from "./cpu.mjs";
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
