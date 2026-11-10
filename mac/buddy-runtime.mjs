// Private stdio control channel; only sanitized state leaves this process.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createHookServer } from "./hook-server.mjs";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createSampler } from "./metrics.mjs";
import { createCodexState } from "./codex-state.mjs";
import { acceptAck, reconnectDelay, canRetryTransportError } from "./buddy-state.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const sample = createSampler(),
  agent = createCodexState();
let transport = null,
  credential = null,
  desired = false,
  failures = 0,
  retryTimer = null,
  deadline = null,
  installDeadline = null;
let retryAt = 0;
let seq = 0,
  session = randomUUID(),
  pending = null,
  paused = false,
  metrics = null,
  settings = { buddyTheme: "chatgpt", revision: 0, keepScreen: true };
let state = {
  connection: "disconnected",
  ack: null,
  error: null,
  progress: null,
  installed: false,
};
const emit = (v) => process.stdout.write(JSON.stringify(v) + "\n");
const publish = () =>
  emit({
    event: "state",
    ...state,
    metrics,
    agent: agent.status(),
    paused,
    settings,
  });
function clearPending() {
  clearTimeout(deadline);
  deadline = null;
  pending = null;
}
async function stop() {
  desired = false;
  clearTimeout(retryTimer);
  clearTimeout(installDeadline);
  clearPending();
  const child = transport;
  transport = null;
  credential = null;
  if (child && child.exitCode === null) {
    const closed = once(child, "close").catch(() => {});
    child.stdin.end();
    child.kill("SIGTERM");
    const force = setTimeout(() => child.kill("SIGKILL"), 1500);
    await closed;
    clearTimeout(force);
  }
  state = {
    connection: "disconnected",
    ack: null,
    error: null,
    progress: null,
    installed: false,
  };
}
function write(command) {
  if (!transport?.stdin.writable) return false;
  transport.stdin.write(JSON.stringify(command) + "\n");
  return true;
}
function retry() {
  if (!desired || !credential) return;
  failures++;
  if (failures > 8) {
    desired = false;
    state.connection = "error";
    state.error = "多次連線失敗，請檢查手環後手動重試";
    publish();
    return;
  }
  state.connection = "retrying";
  publish();
  retryTimer = setTimeout(connect, reconnectDelay(failures));
}
function connect() {
  if (!desired || !credential) return;
  const child = spawn(
    root + "native/transport/target/debug/buddy-transport",
    [],
    { stdio: ["pipe", "pipe", "ignore"] },
  );
  transport = child;
  session = randomUUID();
  seq = 0;
  clearPending();
  state.connection = "connecting";
  state.ack = null;
  state.error = null;
  publish();
  child.stdin.on("error", () => {});
  child.stdin.write(JSON.stringify(credential) + "\n");
  const lines = createInterface({ input: child.stdout });
  let watchdog = setTimeout(() => child.kill(), 55000);
  lines.on("line", (line) => {
    if (child !== transport) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (event.event === "authenticated") {
      clearTimeout(watchdog);
      state.connection = "waiting";
      state.error = null;
      publish();
    }
    if (event.event === "battery") {
      state.battery = event.percent;
      publish();
    }
    if (event.event === "progress") {
      state.progress = Math.max(0, Math.min(100, event.progress * 100));
      publish();
    }
    if (event.event === "ack" && pending && acceptAck(event.ack, pending)) {
      const ack = event.ack;
      clearPending();
      failures = 0;
      state = {
        ...state,
        connection: "connected",
        error: null,
        ack,
        lastAckAt: Date.now(),
        installed: true,
      };
      publish();
    }
    if (event.event === "result" && event.id === "install") {
      clearTimeout(installDeadline);
      state.connection = "waiting";
      state.progress = null;
      state.installed = event.ok;
      state.installation = {
        ok: event.ok,
        code: event.code || null,
        at: Date.now(),
      };
      state.ack = null;
      state.lastAckAt = null;
      state.error = event.ok ? null : "Buddy 安裝失敗，請保持手環連線後重試";
      publish();
    } else if (event.event === "result" && !event.ok) {
      clearPending();
      retryAt = Date.now() + 10000;
      state.connection = "waiting";
      state.operationError = event.code;
      state.error = "請安裝並在手環打開 Buddy";
      publish();
    }
    if (event.event === "conflict") {
      desired = false;
      state.error = "裝置正被另一個客戶端使用，請中斷其他連線後重試";
      child.kill();
    }
    if (event.event === "error") {
      state.operationError = event.code;
      state.error = event.message;
      if (!canRetryTransportError(event.code)) {
        desired = false;
        state.connection = "error";
        state.error = "手環拒絕認證，請重新登入小米帳號並確認手環綁定";
      }
      publish();
    }
  });
  child.once("error", () => {
    state.error = "無法啟動傳輸程式，請先完成 native/transport 建置";
  });
  child.once("close", () => {
    clearTimeout(watchdog);
    lines.close();
    if (child !== transport) return;
    transport = null;
    clearTimeout(installDeadline);
    clearPending();
    state.progress = null;
    state.connection = !desired && state.error ? "error" : "disconnected";
    publish();
    retry();
  });
}
async function command(c) {
  switch (c.op) {
    case "connect":
      await stop();
      credential = { address: c.address, key: c.key };
      desired = true;
      failures = 0;
      settings = { ...settings, ...c.settings };
      connect();
      break;
    case "disconnect":
      await stop();
      publish();
      break;
    case "pause":
      paused = !!c.value;
      publish();
      break;
    case "configure":
      settings = { ...settings, ...c.settings };
      publish();
      break;
    case "install":
      if (!transport || !["connected", "waiting"].includes(state.connection)) {
        state.error = "請先連線手環";
        publish();
        break;
      }
      clearPending();
      state.connection = "installing";
      state.installation = null;
      state.operationError = null;
      state.progress = 0;
      state.error = null;
      publish();
      write({
        op: "install",
        id: "install",
        path: root + "dist/buddy.debug.rpk",
      });
      installDeadline = setTimeout(() => {
        state.error = "安裝逾時，請重連後檢查版本";
        transport?.kill();
      }, 310000);
      break;
  }
}
let commands = Promise.resolve();
const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  if (line.length > 32768) return;
  commands = commands
    .then(() => command(JSON.parse(line)))
    .catch(() => {
      state.error = "操作無法完成";
      publish();
    });
});
input.on("close", () => shutdown());
const server = createHookServer(agent);
server.on("error", () => {
  state.error = "本機活動端口已被使用；請關閉重複執行的 Buddy";
  publish();
  shutdown(1);
});
server.listen(10731, "127.0.0.1");
let timer;
async function tick() {
  try {
    metrics = await sample();
  } catch {
    metrics = null;
  }
  if (
    transport &&
    !paused &&
    !pending &&
    Date.now() >= retryAt &&
    ["connected", "waiting"].includes(state.connection) &&
    metrics
  ) {
    pending = {
      v: 1,
      type: "snapshot",
      session,
      seq: ++seq,
      text: "Mac monitor",
      value: metrics.cpu ?? 0,
      cpu: metrics.cpu ?? -1,
      memory: metrics.memory,
      disk: metrics.disk,
      character: settings.buddyTheme === "claude" ? "claude" : "codex",
      mode: agent.status().state,
      buddyTheme: settings.buddyTheme,
      settingsRevision: settings.revision,
      keepScreen: settings.keepScreen,
    };
    write({ op: "snapshot", id: seq, payload: pending });
    deadline = setTimeout(() => {
      clearPending();
      failures++;
      state.connection = "waiting";
      state.error = "未收到 Buddy 回覆，請在手環開啟應用";
      retryAt = Date.now() + 10000;
      publish();
      if (failures >= 3) transport?.kill();
    }, 8000);
  }
  publish();
  if (!closing) timer = setTimeout(tick, 2000);
}
let closing = false;
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  clearTimeout(timer);
  await stop();
  server.close();
  process.exit(code);
}
process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());
tick();
