import { createWakePolicy } from './wake-policy.mjs';
import { createCodexState } from './codex-state.mjs';
import { initialBuddyState, checkedBuddyState, acknowledgedBuddyState } from './band-package-state.mjs';
import { acceptAck, confirmedSettings, reconnectDelay, canRetryTransportError } from './buddy-state.mjs';
import wire from '../../../../packages/buddy-shared/protocol/runtime.js';
import activityRing from '../../../../packages/buddy-shared/presentation/activity-ring.js';
import { createBatteryAlert } from './battery-alert.mjs';
import { createCompletionQueue } from './completion-queue.mjs';

export const DEFAULT_TIMINGS = Object.freeze({
  sample: 2000, ack: 8000, probe: 30000, connect: 55000,
  wake: 15000, launch: 1000, failedSend: 10000, install: 310000,
  cooldown: 10000, ttl: 60000, operation: 25000, device: 300000, battery: 60000, buddy: 30000,
});
export function installationTimeout(sizeBytes) {
  if (!Number.isInteger(sizeBytes) || sizeBytes < 0 || sizeBytes >= 16 * 1024 * 1024) return DEFAULT_TIMINGS.install;
  // Match native install_timeout, with ten seconds to receive its final result.
  return (Math.max(300, Math.min(900, 120 + Math.ceil(sizeBytes / (12 * 1024)))) + 10) * 1000;
}
const LEGACY_WAKE_HOLD_MS = 30000;
const MAX_WAKE_HOLD_MS = 1800000;
const ACTIVITY_HOLD_MS = 15000;
const LINK_READY = ["connected", "waiting", "standby"];
const OPERATION_ACTIVE = ["waking", "applying"];

/**
 * One selected band and one in-flight snapshot. All platform effects are injected.
 * Transport handles implement start(credentials), write(command), kill(), stop().
 * Factory creation/import is inert; start owns sampling, stop releases all work.
 */
export function createRuntime({createTransport, sample, makeId, packagePath, bandPackage = null,
  now = Date.now, schedule = setTimeout, cancel = clearTimeout,
  emit = () => {}, timings: overrides = {}}) {
  const timings = {...DEFAULT_TIMINGS, install: installationTimeout(bandPackage?.sizeBytes), ...overrides};
  let timer = null, connectionDeadline = null, closing = false, started = false;
  let sampleFlight = null, sampleValue = null, sampleAt = null;
  const diagnostics = {starts:0,closes:0,ackTimeouts:0,pingTimeouts:0,phase:'idle',lastCode:null,exitCode:null,signal:null};
  const diagnosticCodes = ['auth_rejected','timeout','operation_failed','event_lagged','event_closed','transfer_session_reset','transfer_send_timeout','transfer_ack_timeout','transfer','app_missing'];
  function diagnose(phase, code) {
    diagnostics.phase = phase; diagnostics.at = now();
    if (code) diagnostics.lastCode = code;
  }
  let commands = Promise.resolve(), stopping = null;
  const wakePolicy = createWakePolicy({now, cooldown: timings.cooldown, ttl: timings.ttl});
  const batteryAlert=createBatteryAlert();
  let batteryAt=0,batteryDevice=null;
  const completions = createCompletionQueue({now,makeId});
  const agent = createCodexState({now,onEvent(event, previous) {
      if (desired && !paused && state.connection !== "installing") {
        wakePolicy.observe(event, previous);
        completions.observe(event,previous,settings.completionVibration);
      }
    }});
  let wakeFlight = null, wakeDeadline = null, pingDeadline = null;
  let operation = null, operationDeadline = null;
  let transport = null,
    credential = null,
    desired = false,
    failures = 0,
    retryTimer = null,
    deadline = null,
    installDeadline = null;
  let retryAt = 0, launchOnConnect = false;
  let capabilities = null, deviceAt = 0, buddyDeadline = null, buddyFromLaunch = false;
  let seq = 0,
    session = makeId(),
    pending = null,
    paused = false,
    metrics = null,
    settings = { buddyTheme: "chatgpt", revision: 0, keepScreen: false, wakeHoldMs: 20000, activityKeepAwake: false, powerSaving: false, buddyFps: 10, completionVibration: false, completionVibrationMode: 'short' };
  let state = {
    connection: "disconnected",
    ack: null,
    error: null,
    progress: null,
    installed: false,
    buddy: initialBuddyState(bandPackage),
  };
  const publish = () =>
    emit({
      event: "state",
      ...state,
      metrics,
      lowBattery:batteryAlert.snapshot(),
      agent: agent.status(),
      paused,
      settings,
      operation,
      diagnostics,
    });
  function operationActive() {
    return OPERATION_ACTIVE.includes(operation?.status);
  }
  function configureKind(value) {
    if (value.buddyTheme !== undefined) return "theme";
    if (value.activityKeepAwake !== undefined) return "activity_keep_awake";
    if (value.bandBrightness !== undefined) return "band_brightness";
    if (value.buddyFps !== undefined) return "buddy_fps";
    if (value.powerSaving !== undefined) return "power_saving";
    if (value.completionVibration !== undefined) return "completion_vibration";
    if (value.completionVibrationMode !== undefined) return "completion_vibration_mode";
    return "wake_hold";
  }
  function settleOperation(status, code = null) {
    if (!operationActive()) return;
    cancel(operationDeadline); operationDeadline = null;
    operation = {...operation, status, code, settledAt: now()};
  }
  function ownsWake(flight) {
    return operationActive() && !!flight && flight.operation === operation.id;
  }
  function beginOperation(request, kind, target) {
    settleOperation("cancelled", "superseded");
    operation = {id: request, kind, status: "waking", code: null, at: now(), target};
    if (!transport || !desired || !LINK_READY.includes(state.connection)) settleOperation("failed", "not_connected");
    else {
      wakePolicy.requestUser(kind, request);
      operationDeadline = schedule(() => { settleOperation("failed", "timeout"); publish(); }, timings.operation);
      // The user's launch supersedes an event wake; snapshots still carry the agent mode.
      if (wakeFlight) clearWake();
      launchPendingWake();
    }
    publish();
  }
  function launchPendingWake() {
    if (!transport || !desired || (paused && !operationActive()) || wakeFlight || pingDeadline || !LINK_READY.includes(state.connection)) return;
    const wake = wakePolicy.take(true);
    if (wake?.reason === "activity_reconnect" && (paused || !settings.activityKeepAwake || agent.status().activeSessions === 0)) return;
    if (wake) launchWake(wake);
  }
  function wakeForPreference() {
    // Changing an option is a user action, not periodic permission to reopen Buddy.
    if (transport && desired && !paused && LINK_READY.includes(state.connection) && !operationActive())
      beginOperation("settings-" + makeId(), "wake", {});
  }
  // Older Buddy builds reject leases above 30 s; newer ones advertise their own limit.
  function wakeHold() {
    const max = capabilities?.maxWakeHoldMs;
    const limit = Number.isInteger(max) && max >= 1000 ? Math.min(max, MAX_WAKE_HOLD_MS) : LEGACY_WAKE_HOLD_MS;
    return Math.min(settings.wakeHoldMs ?? 20000, limit);
  }
  function supportsTheme(theme) {
    return theme !== "deepseek" || (Array.isArray(capabilities?.themes) && capabilities.themes.includes(theme));
  }
  function requestDevice() {
    if (!transport || !LINK_READY.includes(state.connection)) return;
    deviceAt = now();
    write({op: "device_status", id: "device-status"});
  }
  function clearBuddyCheck() {
    cancel(buddyDeadline); buddyDeadline = null; buddyFromLaunch = false;
  }
  function beginBuddyCheck() {
    state.buddy = {...state.buddy, status: "checking", error: null};
    buddyDeadline = schedule(() => {
      buddyDeadline = null; buddyFromLaunch = false;
      state.buddy = {...state.buddy, status: "error", error: "timeout"};
      publish();
    }, timings.buddy);
  }
  function requestBuddy() {
    if (!transport || !LINK_READY.includes(state.connection) || buddyDeadline !== null) return;
    beginBuddyCheck();
    write({op: "buddy_status", id: "buddy-status"});
    publish();
  }
  function missingBuddy() {
    clearBuddyCheck();
    state.installed = false;
    state.buddy = checkedBuddyState(state.buddy, {installed: false, versionCode: null}, now());
  }
  function clearWake() {
    cancel(wakeDeadline); wakeDeadline = null; wakeFlight = null;
  }
  function launchWake(event) {
    clearPending();
    wakeFlight = { ...event, id: "wake-" + makeId(), queued: false };
    state.wake = { reason: event.reason, status: "sending", at: now() };
    write({op: "launch_buddy", id: wakeFlight.id});
    wakeDeadline = schedule(() => {
      const code = wakeFlight?.acknowledged ? "display_unconfirmed" : "no_response";
      state.wake = { ...state.wake, status: code === "no_response" ? "unconfirmed" : "display_unconfirmed" };
      if (ownsWake(wakeFlight)) settleOperation("failed", code);
      clearWake(); clearPending();
      state.connection = "standby";
      retryAt = now() + timings.probe;
      publish();
    }, timings.wake);
  }
  function clearPending() {
    cancel(deadline);
    deadline = null;
    pending = null;
  }
  async function stop() {
    completions.clear();
    diagnose('stopped');
    desired = false;
    launchOnConnect = false;
    settleOperation("cancelled", "disconnected");
    wakePolicy.clear();
    clearWake();
    cancel(pingDeadline); pingDeadline = null;
    cancel(retryTimer);
    cancel(connectionDeadline);
    cancel(installDeadline);
    clearBuddyCheck();
    clearPending();
    const child = transport;
    transport = null;
    credential = null;
    if (child) {
      await child.stop();
    }
    state = {
      connection: "disconnected",
      ack: null,
      error: null,
      progress: null,
      installed: false,
      buddy: initialBuddyState(bandPackage),
    };
  }
  function write(command) {
    return transport ? transport.write(command) : false;
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
    retryTimer = schedule(connect, reconnectDelay(failures));
  }
  function connect() {
    if (!desired || !credential) return;
    const child = createTransport({
      onEvent: handleEvent,
      onError: handleError,
      onClose: handleClose,
    });
    transport = child;
    diagnostics.starts++; diagnose('opening');
    session = makeId();
    seq = 0;
    clearPending();
    clearWake();
    cancel(pingDeadline); pingDeadline = null;
    retryAt = 0;
    state.connection = "connecting";
    state.ack = null;
    state.buddy = initialBuddyState(bandPackage);
    clearBuddyCheck();
    capabilities = null;
    state.error = null;
    publish();
    cancel(connectionDeadline);
    let watchdog = connectionDeadline = schedule(() => {diagnose('connect_timeout','connect_timeout');child.kill();}, timings.connect);
    let authenticated = false;
    function handleEvent(event) {
      if (child !== transport) return;
      try { wire.decodeTransportEvent(event); } catch { return; }
      if (event.event === 'transport') {diagnose('authenticating');publish();return;}
      if (event.event === "authenticated") {
        if (authenticated) return;
        authenticated = true;
        diagnose('waiting_buddy');
        cancel(watchdog);
        const restoreActivity = settings.activityKeepAwake && agent.status().activeSessions > 0;
        const checkFromLaunch = !paused && (launchOnConnect || restoreActivity);
        if (checkFromLaunch) wakePolicy.requestConnection(launchOnConnect ? "connection" : "activity_reconnect");
        launchOnConnect = false;
        state.connection = "waiting";
        state.error = null;
        batteryAt=now();requestDevice();
        // Launch already fetches this inventory. Do not put another query ahead of it.
        if (checkFromLaunch) {beginBuddyCheck(); buddyFromLaunch = true;}
        else requestBuddy();
        publish();
      }
      if (event.event === "battery") {
        state.battery = event.percent;
        batteryAt=now();batteryAlert.observe(event.percent);
        state.device = {...state.device, battery:event.percent, ...(typeof event.charging === "boolean" ? {charging:event.charging}: {})};
        publish();
      }
      if (event.event === "device") {
        const {battery, charging, firmware, model, storageTotal, storageFree} = event;
        state.device = {battery, charging, firmware, model, storageTotal, storageFree, at: now()};
        if (Number.isInteger(battery)){state.battery=battery;batteryAt=now();batteryAlert.observe(battery);}
        publish();
        return;
      }
      if (event.event === "result" && event.id === "device-status") return;
      if (event.event === "buddy") {
        if (state.connection === "installing") return;
        clearBuddyCheck();
        if (state.buddy.installed !== event.installed || state.buddy.installedVersionCode !== event.versionCode) {
          // An older in-flight application reply must not relabel a newly observed package.
          clearPending(); state.ack = null; state.lastAckAt = null; capabilities = null;
        }
        state.buddy = checkedBuddyState(state.buddy, event, now());
        state.installed = event.installed;
        if (operationActive() && operation.kind === "check_buddy" && operation.target.inventoryRequested)
          settleOperation("done");
        publish(); return;
      }
      if (event.event === "result" && event.id === "buddy-status") {
        if (state.connection === "installing") return;
        clearBuddyCheck();
        if (!event.ok || state.buddy.status === "checking") {
          state.buddy = {...state.buddy, status: "error", error: event.code || "operation_failed"};
          if (operationActive() && operation.kind === "check_buddy" && operation.target.inventoryRequested)
            settleOperation("failed", event.code || "operation_failed");
          publish();
        }
        return;
      }
      if (event.event === "progress") {
        state.progress = Math.max(0, Math.min(100, event.progress * 100));
        publish();
      }
      if (event.event === "ack" && pending && acceptAck(event.ack, pending)) {
        diagnose('connected');
        const ack = event.ack;
        if(pending.completion&&ack.completion?.id===pending.completion.id)completions.acknowledge(ack.completion);
        capabilities = ack.capabilities && typeof ack.capabilities === "object" ? ack.capabilities : null;
        if (wakeFlight?.queued && pending.wakeId === wakeFlight.id) {
          wakeFlight.acknowledged = true;
          const held = ack.wakeDisplay?.id === wakeFlight.id && ack.wakeDisplay?.remainingMs > 0;
          const owned = ownsWake(wakeFlight);
          if (held && ack.keepScreen === "on") {
            state.wake = {...state.wake, status: "confirmed"};
            if (owned) operation = {...operation, wakeConfirmed: true};
            clearWake();
          } else if (ack.keepScreen === "error") {
            state.wake = {...state.wake, status: "display_unconfirmed"};
            if (owned) settleOperation("failed", "display_unconfirmed");
            clearWake();
          }
          // A pre-show ACK can have no lease yet. Retry the same wake ID with
          // fresh sequence numbers until the original deadline, without relaunching.
        }
        // The first receipt can discover support before powerSaving was sent.
        // Keep a paused manual transaction alive until the saved choice is durable.
        const fpsApplied = capabilities?.buddyFps !== true ||
          (pending.buddyFps === settings.buddyFps && ack.buddyFps === settings.buddyFps && ack.settingsApplied === true);
        const powerApplied = capabilities?.powerSaving !== true ||
          (pending.powerSaving === settings.powerSaving && ack.powerSaving === settings.powerSaving && ack.settingsApplied === true);
        const brightnessRequired=capabilities?.bandBrightness===true;
        const brightnessApplied=!brightnessRequired || (ack.brightness?.status==='applied' && ack.brightness.value===(settings.powerSaving?25:(settings.bandBrightness??ack.bandBrightness)));
        if (operationActive() && operation.wakeConfirmed && brightnessRequired && ack.brightness?.status==='error') settleOperation("failed","brightness_failed");
        if (operationActive() && operation.wakeConfirmed && powerApplied && fpsApplied && brightnessApplied) {
          const target = operation.target;
          switch (operation.kind) {
            case "theme":
              if (confirmedSettings(ack, target)) settleOperation("done");
              else if (ack.settingsRevision == null) settleOperation("failed", "unsupported");
              break;
            case "page":
              if (pending.page === target.page) settleOperation(ack.page === target.page ? "done" : "failed", ack.page === target.page ? null : "unsupported");
              break;
            case "band_brightness":
              if(capabilities?.bandBrightness!==true)settleOperation("failed","unsupported");
              else if(pending.bandBrightness===target.bandBrightness&&ack.bandBrightness===target.bandBrightness&&ack.settingsApplied===true)settleOperation("done");
              break;
            case "buddy_fps":
              if (capabilities?.buddyFps !== true) settleOperation("failed", "unsupported");
              else if (pending.buddyFps === target.buddyFps && ack.buddyFps === target.buddyFps && ack.settingsApplied === true) settleOperation("done");
              break;
            case "power_saving":
              if (capabilities?.powerSaving !== true) settleOperation("failed", "unsupported");
              else if (pending.powerSaving === target.powerSaving && ack.powerSaving === target.powerSaving && ack.settingsApplied === true) settleOperation("done");
              break;
            case "completion_vibration":
              if(capabilities?.completionVibration!==true)settleOperation("failed","unsupported");
              else if(pending.completionVibration===target.completionVibration&&ack.completionVibration===target.completionVibration&&ack.settingsApplied===true)settleOperation("done");
              break;
            case "completion_vibration_mode":
              if(!Array.isArray(capabilities?.completionVibrationModes)||!capabilities.completionVibrationModes.includes(target.completionVibrationMode))settleOperation("failed","unsupported");
              else if(pending.completionVibrationMode===target.completionVibrationMode&&ack.completionVibrationMode===target.completionVibrationMode&&ack.settingsApplied===true)settleOperation("done");
              break;
            case "activity_keep_awake":
              if (capabilities?.activityHold !== true) settleOperation("failed", "unsupported");
              else if (pending.activityHoldMs != null && ack.wakeDisplay?.active === (pending.activityHoldMs > 0)) settleOperation("done");
              break;
            case "check_buddy":
              if (!target.inventoryRequested) {
                target.inventoryRequested = true;
                clearBuddyCheck();
                requestBuddy();
              }
              break;
            case "wake": case "wake_hold": case "reset_activity": case "install":
              settleOperation("done");
              break;
          }
        }
        clearPending();
        failures = 0;
        state = {
          ...state,
          connection: "connected",
          error: null,
          ack,
          lastAckAt: now(),
          installed: true,
          buddy: acknowledgedBuddyState(state.buddy, ack.appVersion),
        };
        publish();
      }
      if (event.event === "result" && event.id === "link-ping") {
        cancel(pingDeadline); pingDeadline = null;
        diagnose(event.ok?'link_alive':'link_failed',event.ok?null:'ping_failed');
        if (!event.ok) child.kill();
        return;
      }
      if (event.event === "result" && event.id === wakeFlight?.id) {
        if (event.ok) {
          wakeFlight.queued = true;
          if (ownsWake(wakeFlight)) operation = {...operation, status: "applying"};
          state.wake = {...state.wake, status: "awaiting_ack"};
          state.connection = "waiting";
          retryAt = now() + timings.launch;
        } else {
          state.wake = {...state.wake, status: "failed", code: event.code};
          if (ownsWake(wakeFlight)) {
            // A missing package is a valid inventory result, and cannot be woken.
            if (operation.kind === "check_buddy" && event.code === "app_missing") settleOperation("done");
            else settleOperation("failed", event.code || "launch_failed");
          }
          if (event.code === "app_missing") {
            missingBuddy();
          }
          clearWake();
        }
        publish(); return;
      }
      if (event.event === "result" && event.id === "install") {
        cancel(installDeadline);
        state.connection = "waiting";
        state.progress = null;
        if (event.ok) state.installed = true;
        state.installation = {
          ok: event.ok,
          code: event.code || null,
          at: now(),
        };
        state.ack = null;
        state.lastAckAt = null;
        capabilities = null;
        state.error = null;
        state.buddy = {...state.buddy, status: event.ok ? "unknown" : "error", error: event.ok ? null : event.code || "install_failed",
          ...(event.ok ? {installed: true, installedVersion: null, installedVersionCode: null} : {})};
        if (event.ok) {
          beginBuddyCheck(); buddyFromLaunch = true;
          beginOperation("install-" + makeId(), "install", {});
        }
        publish();
      } else if (event.event === "result" && !event.ok && event.id === pending?.seq) {
        clearPending();
        retryAt = now() + timings.failedSend;
        state.connection = "waiting";
        state.operationError = event.code;
        if (event.code === "app_missing") missingBuddy();
        else state.error = "Buddy 暫未回應，請稍後重試";
        publish();
      }
      if (event.event === "conflict") {
        desired = false;
        state.error = "裝置正被另一個客戶端使用，請中斷其他連線後重試";
        child.kill();
      }
      if (event.event === "error") {
        diagnose('native_error',diagnosticCodes.includes(event.code)?event.code:'operation_failed');
        state.operationError = event.code;
        state.error = event.message;
        if (!canRetryTransportError(event.code)) {
          desired = false;
          state.connection = "error";
          state.error = "手環拒絕認證，請重新登入小米帳號並確認手環綁定";
        }
        publish();
      }
    }
    function handleError() {
      if (child !== transport) return;
      state.error = "無法啟動傳輸程式，請先完成 native/transport 建置";
    }
    function handleClose(info) {
      cancel(watchdog);
      if (child !== transport) return;
      diagnostics.closes++;
      diagnostics.exitCode = Number.isInteger(info?.code) ? info.code : null;
      diagnostics.signal = ['SIGTERM','SIGKILL','SIGABRT','SIGSEGV','SIGBUS'].includes(info?.signal) ? info.signal : null;
      diagnose('transport_closed');
      transport = null;
      settleOperation("failed", "link_lost");
      cancel(installDeadline);
      clearBuddyCheck();
      clearWake();
      cancel(pingDeadline); pingDeadline = null;
      clearPending();
      state.progress = null;
      state.connection = !desired && state.error ? "error" : "disconnected";
      publish();
      retry();
    }
    child.start(credential);
  }
  async function command(c) {
    switch (c.op) {
      case "connect":
        await stop();
        if (closing) return;
        if(batteryDevice!==c.address){batteryAlert.reset();batteryDevice=c.address;}
        credential = { address: c.address, key: c.key };
        desired = true;
        launchOnConnect = true;
        failures = 0;
        settings = { ...settings, ...c.settings };
        connect();
        break;
      case "disconnect":
        await stop();
        publish();
        break;
      case "pause":
        if(c.value)completions.clear();
        const checkAfterPause = !!c.value && buddyFromLaunch && !operationActive();
        const resuming = paused && !c.value;
        paused = !!c.value;
        if (operationActive()) wakePolicy.clearEvents();
        else {wakePolicy.clear(); clearWake(); clearPending();}
        if (checkAfterPause) {clearBuddyCheck(); requestBuddy();}
        if (resuming && settings.activityKeepAwake && agent.status().activeSessions > 0) wakeForPreference();
        publish();
        break;
      case "reset_activity":
        completions.clear();
        agent.reset();
        wakePolicy.clearEvents();
        if (wakeFlight?.session) {
          state.wake = {...state.wake, status: "cancelled"};
          clearWake();
        }
        if (!operationActive()) clearPending();
        if (c.request) beginOperation(c.request, "reset_activity", {});
        else publish();
        break;
      case "configure":
        if (!supportsTheme(c.settings.buddyTheme)) {
          if (c.request) {
            settleOperation("cancelled", "superseded");
            operation = {id: c.request, kind: "theme", status: "failed", code: "unsupported", at: now(), settledAt: now(),
              target: {buddyTheme: c.settings.buddyTheme, revision: c.settings.revision}};
          }
          publish();
          break;
        }
        const enablingActivityHold = c.settings.activityKeepAwake === true && !settings.activityKeepAwake;
        settings = { ...settings, ...c.settings };
        if(!settings.completionVibration)completions.clear();
        if (c.request) beginOperation(c.request, configureKind(c.settings), {...c.settings});
        else {
          if (enablingActivityHold) wakeForPreference();
          publish();
        }
        break;
      case "show_page":
        beginOperation(c.request, "page", {page: c.page});
        break;
      case "wake":
        beginOperation(c.request, "wake", {});
        break;
      case "refresh_device":
        requestDevice();
        break;
      case "check_buddy":
        if (c.request) beginOperation(c.request, "check_buddy", {});
        else requestBuddy();
        break;
      case "install":
        completions.clear();
        if (!transport || !["connected", "waiting", "standby"].includes(state.connection)) {
          state.error = "請先連線手環";
          publish();
          break;
        }
        clearPending();
        settleOperation("cancelled", "install");
        wakePolicy.clear(); clearWake();
        cancel(pingDeadline); pingDeadline = null;
        clearBuddyCheck();
        state.connection = "installing";
        state.buddy = {...state.buddy, status: "installing", error: null};
        state.installation = null;
        state.operationError = null;
        state.progress = 0;
        state.error = null;
        publish();
        write({
          op: "install",
          id: "install",
          path: packagePath,
        });
        installDeadline = schedule(() => {
          state.installation = {ok: false, code: "timeout", at: now()};
          state.buddy = {...state.buddy, status: "error", error: "timeout"};
          transport?.kill();
        }, timings.install);
        break;
    }
  }
  async function tick() {
    // A slow filesystem must not block task/watchdog delivery. Keep one sampler
    // in flight and retire stale metrics while it finishes in the background.
    if (!sampleFlight) {
      try {
        const flight = Promise.resolve(sample());
        sampleFlight = flight;
        flight.then(value => {
          if (closing || sampleFlight !== flight) return;
          sampleValue = value; sampleAt = now(); sampleFlight = null;
        }, () => {
          if (closing || sampleFlight !== flight) return;
          sampleValue = null; sampleAt = null; sampleFlight = null;
        });
      } catch { sampleValue = null; sampleAt = null; }
    }
    await Promise.resolve();
    if (closing) return;
    metrics = sampleAt !== null && now() >= sampleAt && now() - sampleAt <= timings.sample * 2 ? sampleValue : null;
    if (!desired || (paused && !operationActive()) || state.connection === "installing") wakePolicy.clear();
    launchPendingWake();
    if (transport && !paused && LINK_READY.includes(state.connection) && now() - deviceAt >= timings.device) requestDevice();
    if(transport && !pingDeadline && !wakeFlight && !pending && LINK_READY.includes(state.connection) && now()-batteryAt>=timings.battery){batteryAt=now();write({op:"ping",id:"battery-poll"});}
    if (
      transport &&
      (!paused || operationActive()) &&
      !pending &&
      (!operationActive() || operation.wakeConfirmed || wakeFlight?.queued) &&
      (!wakeFlight || wakeFlight.queued) &&
      now() >= retryAt &&
      ["connected", "waiting", "standby"].includes(state.connection)
    ) {
      if (state.connection === "standby" && !pingDeadline) {
        write({op: "ping", id: "link-ping"});
        pingDeadline = schedule(() => {diagnostics.pingTimeouts++;diagnose('link_timeout','ping_timeout');transport?.kill();}, timings.ack);
      }
      const activity = agent.status();
      pending = {
        v: 1,
        type: "snapshot",
        session,
        seq: ++seq,
        text: "Mac monitor",
        value: metrics?.cpu ?? 0,
        cpu: metrics?.cpu ?? -1,
        memory: metrics?.memory,
        disk: metrics?.disk,
        character: settings.buddyTheme === "claude" ? "claude" : "codex",
        mode: activity.activeSessions > 0 ? activity.state : wakeFlight?.mode || activity.state,
        buddyTheme: settings.buddyTheme,
        settingsRevision: settings.revision,
        keepScreen: false,
      };
      if (wakeFlight) { pending.wakeId = wakeFlight.id; pending.wakeHoldMs = wakeHold(); }
      if (capabilities?.activityHold === true) {
        pending.activityHoldMs = !paused && settings.activityKeepAwake && activity.activeSessions > 0 ? ACTIVITY_HOLD_MS : 0;
        pending.idleHoldMs = settings.wakeHoldMs ?? 20000;
        if(capabilities?.activityRing!==true)pending.sessionCounts = {...activity.sessionCounts};
      }
      if(capabilities?.activityRing===true)pending.activityRing=activityRing.colors(settings.buddyTheme,pending.mode,activity.sessionCounts);
      if (capabilities?.bandBrightness===true && settings.bandBrightness!==undefined) pending.bandBrightness=settings.bandBrightness;
      if (capabilities?.buddyFps === true) pending.buddyFps = settings.buddyFps;
      if (capabilities?.powerSaving === true) pending.powerSaving = settings.powerSaving;
      if(capabilities?.completionVibration===true){
        pending.completionVibration=settings.completionVibration;
        if(Array.isArray(capabilities.completionVibrationModes)&&capabilities.completionVibrationModes.includes(settings.completionVibrationMode))pending.completionVibrationMode=settings.completionVibrationMode;
        const notice=!paused&&settings.completionVibration?completions.plan(true):null;
        if(notice)pending.completion=notice;
      }
      if (operationActive() && operation.kind === "page") pending.page = operation.target.page;
      const payload = {...pending};
      if (wakeFlight) pending.wakeId = wakeFlight.id;
      write({ op: "snapshot", id: seq, payload });
      deadline = schedule(() => {
        diagnostics.ackTimeouts++; diagnose('buddy_unresponsive','ack_timeout');
        clearPending();
        state.connection = "standby";
        state.error = null;
        // A user waiting on the band must not sit behind the idle probe interval.
        retryAt = now() + (operationActive() ? timings.launch : timings.probe);
        publish();

      }, timings.ack);
    }
    publish();
    if (!closing) timer = schedule(tick, timings.sample);
  }

  return {
    start() {
      if (started || closing) return;
      started = true;
      return tick();
    },
    dispatch(value) {
      if (closing) return Promise.resolve();
      commands = commands.then(() => {
        if (!closing) return command(wire.decodeRuntimeCommand(value));
      }).catch(() => {state.error = '操作無法完成'; publish();});
      return commands;
    },
    acceptHook(event) {
      if (!closing) agent.accept(event);
    },
    reportError(message) {state.error = message; publish();},
    stop() {
      if (stopping) return stopping;
      closing = true;
      cancel(timer);
      stopping = commands.then(stop);
      return stopping;
    },
  };
}
