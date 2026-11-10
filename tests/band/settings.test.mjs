import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { createSettings } = require("../../apps/band/src/common/settings.js"),
  { decodeMessage } = require("../../packages/buddy-shared/protocol/snapshot.js");
const config = { buddyTheme: "claude", settingsRevision: 4, keepScreen: true };
test("theme is acknowledged only after successful durable write", () => {
  let write, seen;
  const store = createSettings(
    { get: (c) => c.fail(), set: (c) => (write = c) },
    (v) => (seen = v),
  );
  store.load();
  store.apply(config);
  assert.equal(store.snapshot(config).settingsApplied, false);
  write.success();
  assert.equal(store.snapshot(config).settingsApplied, true);
  assert.equal(seen.buddyTheme, "claude");
});
test("failed write preserves previous theme and allows retry", () => {
  let write;
  const store = createSettings(
    { get: (c) => c.fail(), set: (c) => (write = c) },
    () => {},
  );
  store.load();
  store.apply(config);
  write.fail();
  assert.equal(store.snapshot(config).buddyTheme, "chatgpt");
  assert.equal(store.snapshot(config).settingsApplied, false);
  store.apply(config);
  write.success();
  assert.equal(store.snapshot(config).settingsApplied, true);
});
test("late startup load cannot overwrite a newly applied theme; teardown ignores writes", () => {
  let read, write;
  const store = createSettings(
    { get: (c) => (read = c), set: (c) => (write = c) },
    () => {},
  );
  store.load();
  store.apply(config);
  write.success();
  read.success(JSON.stringify({ ...config, buddyTheme: "chatgpt" }));
  assert.equal(store.snapshot(config).buddyTheme, "claude");
  store.apply({ ...config, buddyTheme: "chatgpt", settingsRevision: 5 });
  store.close();
  write.success();
  assert.equal(store.snapshot(config).buddyTheme, "claude");
});
test("unchanged settings do not write every metrics packet", () => {
  let writes = 0;
  const store = createSettings(
    { get: (c) => c.success(JSON.stringify(config)), set: () => writes++ },
    () => {},
  );
  store.load();
  for (let i = 0; i < 100; i++) store.apply(config);
  assert.equal(writes, 0);
});
test("theme settings validation rejects incomplete or unsupported updates", () => {
  const base = {
    v: 1,
    type: "snapshot",
    session: "test",
    seq: 1,
    text: "Mac",
    value: 0,
    cpu: 0,
  };
  for (const fields of [
    { buddyTheme: "deepseek" },
    { ...config, settingsRevision: -1 },
    { ...config, keepScreen: "yes" },
  ])
    assert.throws(() => decodeMessage(JSON.stringify({ ...base, ...fields })));
  assert.equal(
    decodeMessage(JSON.stringify({ ...base, ...config })).buddyTheme,
    "claude",
  );
});
test("a missing storage callback times out and can be retried", () => {
  let expire,
    writes = 0,
    last;
  const store = createSettings(
    {
      get: (c) => c.fail(),
      set: (c) => {
        writes++;
        last = c;
      },
    },
    () => {},
    (f) => {
      expire = f;
      return 1;
    },
    () => {},
  );
  store.load();
  store.apply(config);
  const old = last;
  expire();
  store.apply(config);
  assert.equal(writes, 2);
  old.success();
  assert.equal(store.snapshot(config).settingsApplied, false);
  last.success();
  assert.equal(store.snapshot(config).settingsApplied, true);
});
test("DeepSeek theme and half-hour wake lease pass the band decoder", () => {
  let write, seen;
  const store = createSettings({ get: (c) => c.fail(), set: (c) => (write = c) }, (v) => (seen = v));
  store.load();
  const deepseek = { ...config, buddyTheme: "deepseek" };
  store.apply(deepseek);
  write.success();
  assert.equal(seen.buddyTheme, "deepseek");
  const base = { ...require("../../packages/buddy-shared/fixtures/v1.json").snapshot, buddyTheme: "deepseek", wakeId: "w-1" };
  assert.equal(decodeMessage(JSON.stringify({ ...base, wakeHoldMs: 1800000 })).wakeHoldMs, 1800000);
  assert.throws(() => decodeMessage(JSON.stringify({ ...base, wakeHoldMs: 1800001 })));
});
