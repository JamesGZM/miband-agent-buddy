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
test("power saving defaults off, persists, and absent legacy fields preserve the saved choice", () => {
  let saved, seen;
  const store = createSettings({get:c=>c.success(JSON.stringify(config)),set:c=>{saved=JSON.parse(c.value);c.success();}},v=>{seen=v;});
  store.load();assert.equal(seen.powerSaving,false);
  store.apply({...config,powerSaving:true});assert.equal(saved.powerSaving,true);
  assert.equal(store.snapshot({...config,powerSaving:true}).powerSaving,true);
  assert.equal(store.snapshot({...config,powerSaving:true}).settingsApplied,true);
  store.apply({...config,settingsRevision:5});assert.equal(saved.powerSaving,true);
  const reloaded=createSettings({get:c=>c.success(JSON.stringify(saved)),set:()=>{}},v=>{seen=v;});
  reloaded.load();assert.equal(seen.powerSaving,true);
  const base=require('../../packages/buddy-shared/fixtures/v1.json').snapshot;
  for(const value of [0,1,'true',null,[],{}]) assert.throws(()=>decodeMessage(JSON.stringify({...base,powerSaving:value})));
  for(const powerSaving of [false,true]) assert.equal(decodeMessage(JSON.stringify({...base,powerSaving})).powerSaving,powerSaving);
});
test("latest power choice survives an in-flight write and legacy fields cannot erase it", () => {
  const writes=[];
  const store=createSettings({get:c=>c.fail(),set:c=>writes.push(c)},()=>{});
  store.load();store.apply({...config,powerSaving:true});
  store.apply({...config,buddyTheme:'deepseek',settingsRevision:5});
  assert.equal(writes.length,1);
  writes[0].success();assert.equal(writes.length,2);
  assert.equal(JSON.parse(writes[1].value).powerSaving,true);
  store.apply({...config,buddyTheme:'deepseek',settingsRevision:5,powerSaving:false});
  writes[1].success();assert.equal(writes.length,3);
  writes[2].success();
  const receipt=store.snapshot({...config,buddyTheme:'deepseek',settingsRevision:5,powerSaving:false});
  assert.equal(receipt.powerSaving,false);assert.equal(receipt.settingsApplied,true);
  store.close();
});
test('frame-rate choices are durable, bounded and preserved by legacy and power updates',()=>{
 let saved,seen,write;
 const store=createSettings({get:c=>c.fail(),set:c=>{write=c;}},v=>{seen=v;});store.load();
 assert.equal(seen.buddyFps,10);
 store.apply({...config,buddyFps:30});assert.equal(store.snapshot({...config,buddyFps:30}).settingsApplied,false);
 saved=JSON.parse(write.value);write.success();assert.equal(seen.buddyFps,30);
 store.apply({...config,powerSaving:true});saved=JSON.parse(write.value);write.success();assert.equal(saved.buddyFps,30);
 assert.equal(store.snapshot({...config,powerSaving:true}).buddyFps,30);
 store.apply({...config,powerSaving:false});write.success();assert.equal(seen.buddyFps,30);
 const reloaded=createSettings({get:c=>c.success(JSON.stringify(saved)),set:()=>assert.fail()},v=>{seen=v;});reloaded.load();assert.equal(seen.buddyFps,30);
 const base=require('../../packages/buddy-shared/fixtures/v1.json').snapshot;
 for(const buddyFps of [9,31,10.5,'20',null,{},true])assert.throws(()=>decodeMessage(JSON.stringify({...base,buddyFps})));
 for(let buddyFps=10;buddyFps<=30;buddyFps++)assert.equal(decodeMessage(JSON.stringify({...base,buddyFps})).buddyFps,buddyFps);
 store.close();reloaded.close();
});
test('completion vibration defaults off and is durable without legacy messages erasing it',()=>{
 let saved,seen;
 const store=createSettings({get:c=>c.fail(),set:c=>{saved=JSON.parse(c.value);c.success();}},v=>{seen=v;});store.load();
 assert.equal(seen.completionVibration,false);store.apply({...config,completionVibration:true});
 assert.equal(seen.completionVibration,true);assert.equal(store.snapshot({...config,completionVibration:true}).settingsApplied,true);
 store.apply({...config,powerSaving:true});assert.equal(saved.completionVibration,true);
 const reload=createSettings({get:c=>c.success(JSON.stringify(saved)),set:()=>assert.fail()},v=>{seen=v;});reload.load();assert.equal(seen.completionVibration,true);
 store.apply({...config,completionVibration:false});assert.equal(seen.completionVibration,false);store.close();reload.close();
});
test('short/long mode defaults short, is durable and survives toggle and legacy updates',()=>{
 let saved,seen;
 const store=createSettings({get:c=>c.success(JSON.stringify(config)),set:c=>{saved=JSON.parse(c.value);c.success();}},v=>{seen=v;});store.load();
 assert.equal(seen.completionVibrationMode,'short');store.apply({...config,completionVibrationMode:'long'});assert.equal(seen.completionVibrationMode,'long');
 for(const completionVibration of [true,false]){store.apply({...config,completionVibration});assert.equal(seen.completionVibrationMode,'long');}
 const reloaded=createSettings({get:c=>c.success(JSON.stringify(saved)),set:()=>assert.fail()},v=>{seen=v;});reloaded.load();assert.equal(seen.completionVibrationMode,'long');
 store.apply({...config,completionVibrationMode:'short'});assert.equal(store.snapshot({...config,completionVibrationMode:'short'}).settingsApplied,true);
 assert.equal(store.snapshot({...config,completionVibrationMode:'long'}).settingsApplied,false);store.close();reloaded.close();
});

test('native brightness baseline is durable, legacy-safe and never overwrites a newer choice',()=>{
  let write;const changed=[];
  const store=createSettings({get:c=>c.fail(),set:c=>{write=c;}},v=>changed.push(v));
  store.load();store.rememberBrightness(0);write.success();
  assert.equal(store.snapshot(config).bandBrightness,0);
  store.apply({...config,bandBrightness:255});
  store.rememberBrightness(100);write.success();
  assert.equal(store.snapshot({...config,bandBrightness:255}).settingsApplied,true);
  store.apply({...config,powerSaving:true});write.success();
  assert.equal(store.snapshot(config).bandBrightness,255);
  assert.equal(changed.at(-1).powerSaving,true);store.close();
});

test('unreleased unverified baseline is not migrated into a user brightness choice',()=>{
  const store=createSettings({get:c=>c.success(JSON.stringify({...config,bandBrightness:0})),set:c=>c.success()},()=>{});
  store.load();assert.equal(store.snapshot(config).bandBrightness,null);
  store.apply({...config,bandBrightness:0});assert.equal(store.snapshot({...config,bandBrightness:0}).bandBrightness,0);
  store.close();
});

test('auto brightness is durable and legacy/power updates retain the selected mode',()=>{
  let saved;const store=createSettings({get:c=>c.fail(),set:c=>{saved=JSON.parse(c.value);c.success();}},()=>{});
  store.load();assert.equal(store.snapshot(config).bandAutoBrightness,null);
  store.apply({...config,bandAutoBrightness:true,bandBrightness:200});
  assert.equal(store.snapshot({...config,bandAutoBrightness:true}).settingsApplied,true);
  store.apply({...config,powerSaving:true});assert.equal(saved.bandAutoBrightness,true);assert.equal(saved.bandBrightness,200);
  store.close();
});
