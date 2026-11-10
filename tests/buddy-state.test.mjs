import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptAck,
  canRetryTransportError,
  confirmedSettings,
  reconnectDelay,
} from "../mac/buddy-state.mjs";
test("only the current pending snapshot can advance delivery", () => {
  const pending = { session: "new", seq: 5 },
    ack = {
      v: 1,
      type: "ack",
      session: "new",
      seq: 5,
      received: 1,
      keepScreen: "on",
    };
  assert.equal(acceptAck(ack, pending), true);
  assert.equal(acceptAck({ ...ack, session: "old" }, pending), false);
  assert.equal(acceptAck({ ...ack, seq: 4 }, pending), false);
  assert.equal(acceptAck(ack, null), false);
});
test("theme receipt requires matching revision, theme and storage confirmation", () => {
  const settings = { buddyTheme: "claude", revision: 5 };
  assert.equal(
    confirmedSettings(
      { settingsApplied: true, buddyTheme: "claude", settingsRevision: 5 },
      settings,
    ),
    true,
  );
  for (const a of [
    { settingsApplied: false, buddyTheme: "claude", settingsRevision: 5 },
    { settingsApplied: true, buddyTheme: "chatgpt", settingsRevision: 5 },
    { settingsApplied: true, buddyTheme: "claude", settingsRevision: 4 },
  ])
    assert.equal(confirmedSettings(a, settings), false);
});
test("reconnection is bounded and eventually requires manual intervention", () => {
  assert.equal(reconnectDelay(1), 2000);
  assert.equal(reconnectDelay(8), 30000);
  assert.equal(reconnectDelay(9), null);
});

test("invalid authentication and competing clients require user action rather than retries", () => {
  assert.equal(canRetryTransportError("auth_rejected"), false);
  assert.equal(canRetryTransportError("conflict"), false);
  assert.equal(canRetryTransportError("timeout"), true);
  assert.equal(canRetryTransportError(undefined), true);
});
