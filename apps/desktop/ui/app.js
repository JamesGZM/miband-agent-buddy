import { bridge } from "./bridge.js";
import { wakeProgress } from "./connection-status.js";
import { initialState } from "./state.js";
import { startPreview } from "./preview.js";
import { createToast } from "./toast.js";
import { integrationsPage, integrationCopy } from "./integrations.js";
import { initialPage, setupStage, welcomePage, onboardingCard, connectionGuide, readyCard } from "./onboarding.js";
import { buddyPackageView, bandOnlyError } from "./band-package.js";
import { desktopUpdateView, updateErrorMessage, PROJECT_URL } from "./desktop-update.js";
import { t, formatTime, resolveLanguage, setLanguage } from "./i18n.js";
const $ = (s) => document.querySelector(s),
  escape = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state = initialState(),
  page = initialPage(state),
  setupSession = page !== "buddy",
  initialDeviceCheck = false,
  bandPage = 0,
  ackPage = null,
  draftTheme = null,
  busyAction = null,
  signature = "",
  confirmLogout = false,
  updateExpanded = false,
  updateChecked = false,
  refreshingSince = 0,
  settledOperation = undefined,
  hydrated = !bridge.available,
  refreshing = null,
  stateEpoch = 0;
const pendingPreferences = new Map();
let pendingAutostart = null;
const toast = createToast(() => $("#toast"));
const icons = {
  hooks: '<path d="M8 7V4m8 3V4M6 7h12v4a6 6 0 0 1-6 6v4m-6-10V7"/>',
  buddy: '<circle cx="12" cy="12" r="8"/><path d="M9 10h.01M15 10h.01M9 14.5c1.6 1.4 4.4 1.4 6 0"/>',
  devices:
    '<rect x="8" y="3" width="8" height="18" rx="4"/><path d="M12 8v4"/>',
  account:
    '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-3.6 3.8-5.5 7-5.5s6 1.9 7 5.5"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4L17 7M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6"/>',
};
const glyphs = {
  activity: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9M4 13a8 8 0 0 0 14.3 4.9"/><path d="M5 3v4h4M19 21v-4h-4"/>',
  hold: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
};
const svg = (paths, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
// Band themes in display order; capability-gated themes need a Buddy that advertises them.
const THEMES = [
  { id: "chatgpt", name: "ChatGPT" },
  { id: "claude", name: "Claude" },
  { id: "deepseek", name: "DeepSeek" },
];
const labels = {
  welcome: "歡迎使用 Buddy",
  buddy: "Buddy",
  devices: "手環",
  account: "帳號",
  settings: "設定",
  hooks: "AI 接入",
};
const connectionNames = {
  disconnected: "未連線",
  connecting: "連線中",
  authenticated: "已認證",
  waiting: "等待 Buddy 回應",
  standby: "Buddy 暫未回應",
  connected: "已連線",
  retrying: "重新連線中",
  installing: "正在安裝",
  error: "連線異常",
};
const modes = {
  idle: "待機",
  thinking: "思考中",
  working: "工作中",
  attention: "等待確認",
  complete: "已完成",
  offline: "離線",
  error: "異常",
  sleep: "已暫停",
};
const operationDone = {
  theme: "主題已套用到手環",
  page: "手環已切換頁面",
  wake: "手環已喚醒",
  wake_hold: "亮屏時長已套用到手環",
  activity_keep_awake: "亮屏設定已套用到手環",
  power_saving: "省電設定已套用到手環",
  completion_vibration: "震動設定已套用到手環",
  band_brightness: "亮度已套用到手環",
  band_auto_brightness: "自動亮度設定已套用到手環",
  completion_vibration_mode: "震動模式已套用到手環",
  reset_activity: "任務顯示已重設",
  check_buddy: "Buddy 檢查完成",
  install: "Buddy 已安裝並開啟",
};
const dotStates = {
  idle: "idle",
  sleep: "idle",
  thinking: "busy",
  working: "busy",
  attention: "alert",
  error: "alert",
  complete: "done",
};
const operationErrors = {
  timeout: "手環沒有回應，請確認手環在附近",
  no_response: "手環沒有回應，請確認手環在附近",
  app_missing: "無法開啟手環上的 Buddy",
  unsupported: "手環暫不支援此操作",
  superseded: "操作已被新的操作取代",
  not_connected: "手環未連線",
  paused: "同步已暫停，請先恢復同步",
  link_lost: "與手環的連線中斷",
  display_unconfirmed: "手環未確認亮屏",
  brightness_failed: "手環未能套用亮度，請重試",
  launch_failed: "無法開啟手環上的 Buddy",
  app_query_failed: "無法查詢手環應用，請稍後重試",
  app_sync_failed: "無法同步 Buddy 連線，請稍後重試",
  app_launch_failed: "手環未接受 Buddy 開啟指令，請稍後重試",
};
const operationCancelled = {
  paused: "同步已暫停，操作已取消",
  disconnected: "已中斷連線，操作已取消",
  install: "已開始安裝，操作已取消",
};
const operationProgress = {
  waking: "喚醒手環中…",
  applying: "套用中…",
};
const linkReady = () =>
  ["connected", "waiting", "standby"].includes(state.runtime.connection);
const operation = () => state.runtime.operation || null;
const operationActive = () =>
  ["waking", "applying"].includes(operation()?.status);
const selectedDevice = () =>
  state.devices.find((d) => d.index === state.preferences.selected);
const online = () => state.runtime.connection === "connected";
const appliedTheme = () =>
  state.runtime.ack?.settingsApplied === true
    ? state.runtime.ack.buddyTheme
    : null;
// The saved theme is updated only by a durable current-revision receipt.
const previewTheme = () => draftTheme || state.preferences.buddyTheme || appliedTheme() || "chatgpt";
const capabilities = () => state.runtime.ack?.capabilities || null;
const themeSupported = (id) =>
  id !== "deepseek" || !!capabilities()?.themes?.includes(id);
const holdSeconds = () => state.preferences.wakeHoldSeconds ?? 20;
// Match runtime wakeHold(): advertise max when present, else legacy 30s while linked.
const effectiveHold = () => {
  const hold = holdSeconds();
  const maxMs = capabilities()?.maxWakeHoldMs;
  if (Number.isInteger(maxMs) && maxMs >= 1000)
    return Math.min(hold, Math.floor(maxMs / 1000));
  return linkReady() ? Math.min(hold, 30) : hold;
};
function duration(seconds) {
  if (seconds < 60) return t("{n} 秒", { n: seconds });
  const m = Math.floor(seconds / 60),
    s = seconds % 60;
  return s ? t("{m} 分 {s} 秒", { m, s }) : t("{m} 分鐘", { m });
}
function holdMessage(seconds) {
  return seconds <= 30
    ? t("亮屏時長已儲存為 {n} 秒", { n: seconds })
    : t("已儲存為 {duration}，較長的亮屏時間會增加手環耗電", { duration: duration(seconds) });
}
function holdLimitMessage() {
  // No current-session ACK means capabilities are unknown, not legacy.
  if (!linkReady() || !state.runtime.ack) return "";
  return holdSeconds() > effectiveHold()
    ? t("此版本的 Buddy 最多亮屏 {duration}，更新 Buddy 可使用設定時長。", { duration: duration(effectiveHold()) })
    : "";
}
function screenRemaining() {
  const r = state.runtime;
  if (r.ack?.keepScreen !== "on" || !r.lastAckAt) return 0;
  return Math.max(0, (Number(r.ack.wakeDisplay?.remainingMs) || 0) - (Date.now() - r.lastAckAt));
}
function screenText(ms) {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? t("亮屏 {n} 秒", { n: s }) : t("亮屏 {time}", { time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` });
}
function dotState() {
  const r = state.runtime;
  if (!["connected", "waiting", "standby"].includes(r.connection)) return "offline";
  if (r.paused) return "idle";
  return dotStates[r.agent?.state] || "idle";
}
function batteryIcon(percent, charging) {
  const level = Math.max(0, Math.min(100, percent));
  return `<span class="battery ${level < 20 ? "low" : ""}" title="${t("電量 {n}%", { n: level })}"><svg viewBox="0 0 26 12" aria-hidden="true"><rect class="shell" x=".5" y=".5" width="22" height="11" rx="3"/><rect class="cap" x="23.5" y="3.5" width="2" height="5" rx="1"/><rect class="level" x="2.5" y="2.5" width="${((18 * level) / 100).toFixed(1)}" height="7" rx="1.5"/></svg>${charging ? svg(glyphs.bolt, "bolt") : ""}<span>${level}%</span>${charging ? `<span class="charging-label">${t("充電中")}</span>` : ""}</span>`;
}
function bytes(value) {
  if (!Number.isFinite(value)) return "—";
  return value >= 1e9 ? (value / 1e9).toFixed(1) + " GB" : (value / 1e6).toFixed(value >= 1e8 ? 0 : 1) + " MB";
}
const spinner = '<span class="spinner" aria-hidden="true"></span>';
const bandActions = new Set(["theme", "page", "wake", "wake_hold", "activity_keep_awake", "power_saving", "buddy_fps", "band_brightness", "band_auto_brightness", "completion_vibration", "completion_vibration_mode", "reset_activity", "check_buddy", "install"]);
function actionProgress(action) {
  if (action === "install" && state.runtime.connection === "installing") return t("安裝中…");
  if (operationActive() && operation().kind === action)
    return t(operationProgress[operation().status]);
  if (busyAction === action)
    return t(bandActions.has(action) && linkReady() ? "喚醒手環中…" : "儲存中…");
  return "";
}
function actionButton(text, action, value = "", cls = "", disabled = false) {
  const progress = actionProgress(action);
  const loading = !!progress;
  return `<button class="button ${cls} ${loading ? "loading" : ""}" data-action="${action}" data-value="${escape(value)}" ${disabled || loading || busyAction || (bandActions.has(action) && operationActive()) ? "disabled" : ""}>${loading ? spinner : ""}${bandActions.has(action) && progress ? progress : text}</button>`;
}
// The band-facing button shows the worker's progress; everything else waits.
function bandButton(kind, text, cls = "", disabled = false) {
  const op = operation();
  const running = operationActive() && op.kind === kind;
  const mine = running || busyAction === kind;
  const label = running
    ? operationProgress[op.status] ? t(operationProgress[op.status]) : text
    : mine
      ? t(operationProgress.waking)
      : text;
  return `<button class="button ${cls} ${mine ? "loading" : ""}" data-action="${kind}" ${disabled || operationActive() || busyAction || !linkReady() ? "disabled" : ""}>${mine ? spinner : ""}${label}</button>`;
}
const row = (label, detail, control = "") =>
  `<div class="row"><div class="row-text"><span class="row-label">${label}</span>${detail ? `<span class="row-detail">${detail}</span>` : ""}</div>${control ? `<div class="row-control">${control}</div>` : ""}</div>`;
const group = (title, rows, footnote = "") =>
  `<section class="group">${title ? `<h2>${title}</h2>` : ""}<div class="panel">${rows}</div>${footnote ? `<p class="footnote">${footnote}</p>` : ""}</section>`;
function syncText() {
  const r = state.runtime;
  return r.lastAckAt ? formatTime(r.lastAckAt) : t("尚未同步");
}
function activityText() {
  const r = state.runtime;
  if (r.paused) return t("同步已暫停");
  if (r.connection === "waiting") return t("等待 Buddy 回應");
  if (!online() && r.connection !== "standby") return t("未連線");
  return (
    "AI " +
    t(modes[r.agent?.state] || "待機") +
    (r.agent?.activeSessions > 0 ? " · " + t("{n} 個任務", { n: r.agent.activeSessions }) : "") +
    (r.agent?.stale ? t("（較久沒有更新）") : "")
  );
}
function sessionsText() {
  const counts = state.runtime.agent?.sessionCounts;
  if (!counts || !state.runtime.agent.activeSessions) return "";
  return t("{working} 執行 · {thinking} 思考 · {attention} 等待確認", counts) +
    (state.runtime.agent.staleSessions ? " · " + t("{n} 個任務狀態待確認", { n: state.runtime.agent.staleSessions }) : "");
}
function buddyPage() {
  const op = operation();
  const pageBusy = operationActive() && op.kind === "page";
  const progress = operationActive() ? t(operationProgress[op.status]) : bandActions.has(busyAction) ? actionProgress(busyAction) : "";
  const segment = (index, text) =>
    `<button data-view="${index}" class="${bandPage === index ? "active" : ""} ${pageBusy && bandPage === index ? "loading" : ""}" ${operationActive() || busyAction ? "disabled" : ""}>${pageBusy && bandPage === index ? spinner : ""}${text}</button>`;
  const ready = linkReady();
  const screen = `<button class="screen" data-action="wake" title="${ready ? t("點按喚醒手環") : t("連線手環後可點按喚醒")}" ${!ready || operationActive() || busyAction ? "disabled" : ""}><canvas id="band" width="490" height="192" aria-label="${t("手環畫面預覽")}"></canvas><span id="preview-loading" class="screen-overlay" role="status">${spinner}${t("載入中…")}</span><span id="preview-error" class="screen-overlay" role="status" hidden>${t("預覽暫時無法載入")}</span>${progress ? `<span class="screen-overlay" role="status">${spinner}${progress}</span>` : ""}</button>`;
  const top = `<div class="hero-top"><span class="chip status-chip" title="${t("活動")}"><i id="buddy-dot" class="buddy-dot"></i><span id="activity">${escape(activityText())}</span></span><span id="screen-badge" class="chip screen-badge"></span></div>`;
  const bottom = `<div class="hero-bottom"><div class="segments" role="group" aria-label="${t("手環頁面")}">${segment(0, t("角色"))}${segment(1, t("資源"))}</div><div class="hero-meta"><span class="meta" title="${t("最後同步")}">${svg(glyphs.sync)}<span id="last-sync">${syncText()}</span></span><span class="meta" title="${t("喚醒後亮屏時長")}">${svg(glyphs.hold)}<span id="hold-duration">${duration(holdSeconds())}</span></span></div></div>`;
  const cards = THEMES.map(({ id, name }) => {
    const supported = themeSupported(id);
    return `<button class="theme-card ${previewTheme() === id ? "selected" : ""}" data-theme-choice="${id}" ${operationActive() ? "disabled" : ""}><span class="theme-thumb"><img alt="" src="assets/${id}-preview.png"></span><span class="theme-name">${name}</span>${!supported ? `<span class="theme-note">${t("僅預覽")}</span>` : appliedTheme() === id ? `<span class="theme-note">${t("使用中")}</span>` : ""}</button>`;
  }).join("");
  const selected = previewTheme();
  const themeTip = t("只影響手環畫面。");
  return `<section class="group"><div class="panel preview-panel">${top}${screen}${bottom}</div><p id="session-summary" class="footnote">${sessionsText()}</p>${ready ? "" : `<p class="footnote">${t("未連線時只切換預覽。")}</p>`}</section><section class="group"><div class="section-head"><div class="section-titles"><h2>${t("手環主題")}</h2><p class="section-sub">${themeTip}</p></div>${bandButton("theme", t("套用主題"), "primary", selected === appliedTheme() || !themeSupported(selected))}</div><div class="theme-strip" role="listbox" aria-label="${t("手環主題")}">${cards}</div></section>`;
}
function devicesPage() {
  const r = state.runtime,
    p = state.preferences;
  if (!state.loggedIn)
    return onboardingCard(state) + connectionGuide(state);
  const current = selectedDevice()?.supported ? selectedDevice() : null;
  const deviceRow = (d) =>
    row(
      escape(d.name),
      escape(d.address) + (!d.supported ? t("，暫不支援此型號") : ""),
      actionButton(
        d.index === p.selected ? t("中斷連線") : t("連線"),
        d.index === p.selected ? "disconnect" : "connect",
        d.index,
        "",
        !d.supported,
      ),
    );
  const others = state.devices.filter((d) => d !== current);
  const list = others.length
    ? group(current ? t("其他手環") : t("我的手環"), others.map(deviceRow).join(""), t("支援小米手環 9 與小米手環 9 NFC 版。"))
    : current
      ? `<p class="footnote">${t("支援小米手環 9 與小米手環 9 NFC 版。")}</p>`
      : group(t("我的手環"), row(t("沒有可用的手環"), t("請確認服務地區，或先在小米運動健康綁定手環後重新登入。"), `<button class="button" data-page="account">${t("檢查帳號與服務地區")}</button>`));
  if (!current) return onboardingCard(state) + connectionGuide(state) + list;
  const installCodes = {
    install_receipt_missing: "沒有收到手環的安裝結果，請重新連線檢查版本",
    install_rejected: "手環拒絕了安裝包",
    install_prepare: "手環尚未準備好接收",
    transfer: "安裝包傳輸失敗",
    transfer_ack_timeout: "手環未在時限內確認傳輸封包",
    transfer_session_reset: "傳輸連線狀態已重設，安裝未完成",
    transfer_send_timeout: "藍牙資料寫入逾時",
    timeout: "安裝逾時",
  };
  const installDetail = r.installation?.ok
    ? operation()?.kind === "install" && operation()?.status === "done" ? t("Buddy 已安裝並開啟") : t("安裝完成")
    : r.installation?.ok === false
      ? t("安裝失敗：") + escape(t(installCodes[r.installation.code] || "請重新連線後重試"))
      : "";
  const buddy = buddyPackageView(r);
  const versionText = buddy.installedVersion
    ? t("已安裝 {version}", { version: escape(buddy.installedVersion) })
    : Number.isInteger(buddy.installedVersionCode)
      ? t("已安裝版本代碼 {code}", { code: buddy.installedVersionCode })
      : "";
  const packageDetail = [
    escape(t(buddy.label)),
    versionText,
    buddy.availableVersion ? t("此 App 隨附 Buddy {version}", { version: escape(buddy.availableVersion) }) : "",
    buddy.status === "error" ? t("請保持手環連線後重試；沒有回應不代表未安裝。") : "",
    installDetail,
  ].filter(Boolean).join(" · ");
  const progress =
    r.connection === "installing"
      ? `<div class="row"><progress class="progress" max="100" value="${Number(r.progress) || 0}"></progress><span class="row-detail">${Number(r.progress) >= 100 ? t("等待手環完成安裝…") : t("傳送中 {n}%", { n: Math.floor(Number(r.progress) || 0) })}</span></div>`
      : "";
  const ready = ["connected", "waiting", "standby"].includes(r.connection);
  const info = ready ? r.device || {} : {};
  const battery = ready ? (Number.isFinite(info.battery) ? info.battery : r.battery) : undefined;
  const badge =
    r.connection === "connected"
      ? ["online", t("已連線")]
      : r.connection === "standby"
        ? ["standby", t("Buddy 暫未回應")]
        : r.connection === "installing"
          ? ["standby", t("安裝中")]
          : ["connecting", "waiting", "retrying"].includes(r.connection)
            ? ["standby", t("連線中")]
            : ["", t("未連線")];
  const tile = (label, value, extra = "") =>
    `<div class="tile"><span class="tile-label">${label}</span><span class="tile-value">${value}</span>${extra}</div>`;
  const used = Number.isFinite(info.storageTotal) && info.storageTotal > 0 && Number.isFinite(info.storageFree) && info.storageFree >= 0 && info.storageFree <= info.storageTotal ? info.storageTotal - info.storageFree : null;
  const storage =
    used === null
      ? tile(t("儲存空間"), "—")
      : tile(
          t("儲存空間"),
          `${bytes(used)} / ${bytes(info.storageTotal)}`,
          `<progress class="storage-meter" max="${info.storageTotal}" value="${used}" aria-label="${t("儲存空間已用 {n}%", { n: Math.round((used / info.storageTotal) * 100) })}"></progress>`,
        );
  const card = `<section class="group"><div class="panel device-card"><div class="device-head"><div class="device-title"><span class="device-card-name">${escape(current.name)}</span><span class="badge ${badge[0]}"><i class="dot ${badge[0]}"></i>${badge[1]}</span></div><button class="icon-button ${refreshingSince ? "spinning" : ""}" data-action="refresh_device" title="${t("重新整理")}" aria-label="${t("重新整理")}" ${!ready || refreshingSince || busyAction ? "disabled" : ""}>${svg(glyphs.sync)}</button></div><div class="tiles">${tile(
    t("電量"),
    Number.isFinite(battery) ? `${battery}%${info.charging ? `<span class="charging">${svg(glyphs.bolt, "bolt")}${t("充電中")}</span>` : ""}` : "—",
  )}${tile(t("韌體"), escape(info.firmware || "—"))}${tile(t("型號"), escape(info.model || "—"))}${storage}${tile(t("Buddy 版本"), escape(buddy.installedVersion || "—"))}${tile(t("最後同步"), `<span id="device-sync">${syncText()}</span>`)}</div></div></section>`;
  const actions = group(
    "",
    row(
      t("手環連線"),
      escape(current.address),
      ["disconnected", "error"].includes(r.connection)
        ? actionButton(t("重新連線"), "connect", current.index, "primary")
        : actionButton(t("中斷連線"), "disconnect", current.index),
    ) +
      row(
        t("手環上的 Buddy"),
        packageDetail,
        `<div class="button-pair">${actionButton(buddy.status === "checking" ? t("正在檢查…") : t("檢查更新"), "check_buddy", "", "", !buddy.canCheck)}${buddy.installLabel || buddy.status === "installing" ? actionButton(t(buddy.installLabel || "正在安裝"), "install", "", "primary", !buddy.canCheck) : ""}</div>`,
      ) +
      progress,
  );
  const repair = buddy.canReinstall ? `<details class="package-repair"><summary>${t("重新安裝 Buddy")}</summary><p>${t("若手環上的 Buddy 無法開啟，可重新安裝此 App 隨附的版本。")}</p>${actionButton(t("重新安裝"), "install")}</details>` : "";
  return readyCard(state, {show:setupSession}) + card + actions + (holdLimitMessage() ? `<p class="footnote">${holdLimitMessage()}</p>` : "") + repair + list + onboardingCard(state) + connectionGuide(state);
}
function accountPage() {
  if (state.loggedIn)
    return (
      group(
        t("小米帳號"),
        row(t("小米帳號已登入"), t("認證存放在這台 Mac 的 App 私有資料目錄。")) +
          row(t("服務地區"), "", `<span class="value">${escape(state.region)}</span>`) +
          row(t("手環數量"), "", `<span class="value">${state.devices.length}</span>`),
      ) +
      group(
        "",
        row(t("重新同步裝置"), t("新增手環或裝置清單有誤時，可重新登入小米帳號以取得最新清單。"), actionButton(t("重新登入"), "login")) +
        row(
          t("登出"),
          t("會中斷手環連線並刪除本機認證，外觀設定會保留。"),
          actionButton(confirmLogout ? t("確定登出") : t("登出"), "logout", "", "danger"),
        ),
      )
    );
  const regions = [
    ["cn", "中國大陸"],
    ["sg", "新加坡"],
    ["de", "歐洲"],
    ["us", "美國"],
    ["ru", "俄羅斯"],
    ["i2", "印度"],
  ]
    .map(([v, text]) => `<option value="${v}">${t(text)}</option>`)
    .join("");
  return group(
    t("小米帳號"),
    row(t("服務地區"), "", `<select id="region">${regions}</select>`) +
      row(
        t("登入"),
        t("在小米官方頁面登入，App 不保存密碼。"),
        actionButton(t("登入小米帳號"), "login", "", "primary"),
      ),
    t("登入完成後會自動返回並載入手環。"),
  );
}
function settingsPage() {
  const p = state.preferences,
    r = state.runtime;
  const update = state.desktopUpdate || {},
    updateView = desktopUpdateView(update);
  const updateDetail = [t(updateView.label), update.latestVersion ? t("最新版本 {version}", { version: escape(update.latestVersion) }) : ""].filter(Boolean).join(" · ");
  const updateControls = `<div class="button-pair">${actionButton(t("檢查更新"), "check_update", "", "", !updateView.canCheck)}${updateView.canDownload ? actionButton(t("下載更新"), "download_update", "", "primary") : ""}${updateView.canInstall ? actionButton(t("安裝並重新啟動"), "install_update", "", "primary") : ""}</div>`;
  const version = escape(state.appVersion || update.currentVersion || "—");
  const versionButton = `<button class="version-button" data-action="update_details" aria-expanded="${updateExpanded}" aria-controls="desktop-update" aria-label="${t(updateView.hasUpdate ? "版本 {version}，有可用更新" : "版本 {version}，檢查更新", { version })}">${version}${updateView.hasUpdate ? '<span class="update-dot" aria-hidden="true"></span>' : ""}${["checking", "downloading"].includes(update.status) ? spinner : ""}</button>`;
  const updatePanel = updateExpanded ? `<div id="desktop-update" class="update-panel" role="region" aria-label="${t("版本更新")}"><p role="status">${updateDetail}</p>${updateView.progress !== null ? `<progress class="progress" max="100" value="${updateView.progress}" aria-label="${t("下載進度")}"></progress>` : ""}<div class="update-actions">${updateControls}${update.releaseUrl ? actionButton(t("版本說明"), "open_release") : ""}</div></div>` : "";
  const automaticBrightness = p.bandAutoBrightness ?? r.ack?.bandAutoBrightness ?? (r.ack?.brightness?.mode === 1);
  const vibrationProgress = actionProgress("completion_vibration_mode");
  const options = (pairs, current) =>
    pairs
      .map(
        ([v, text]) =>
          `<option value="${v}" ${current === v ? "selected" : ""}>${text}</option>`,
      )
      .join("");
  const toggle = (id, checked, label, action = id, disabled = false) => {
    const progress = actionProgress(action);
    return `<span class="toggle-control">${progress ? `<span class="control-status" role="status">${spinner}${progress}</span>` : ""}<input id="${id}" class="switch" type="checkbox" aria-label="${escape(label)}" ${checked ? "checked" : ""}${disabled || busyAction || (bandActions.has(action) && operationActive()) ? ' disabled' : ''}${progress ? ' aria-busy="true"' : ''}></span>`;
  };
  return (
    group(
      t("外觀"),
      row(
        t("語言"),
        "",
        `<select id="language">${options(
          [
            ["system", t("跟隨系統")],
            ["zh-Hans", "简体中文"],
            ["zh-Hant", "繁體中文"],
            ["en", "English"],
          ],
          p.language || "system",
        )}</select>`,
      ) +
      row(
        t("主題"),
        "",
        `<select id="app-theme">${options(
          [
            ["claude", "Claude"],
            ["chatgpt", "ChatGPT"],
            ["deepseek", "DeepSeek"],
          ],
          p.appTheme,
        )}</select>`,
      ) +
        row(
          t("外觀"),
          "",
          `<select id="appearance">${options(
            [
              ["system", t("跟隨系統")],
              ["light", t("淺色")],
              ["dark", t("深色")],
            ],
            p.appearance,
          )}</select>`,
        ),
      t("只影響 Mac 介面，不影響手環主題。"),
    ) +
    group(
      t("執行與同步"),
      row(t("登入 Mac 時啟動"), "", toggle("autostart", state.autostart, t("登入 Mac 時啟動"))) +
        row(t("關閉視窗後繼續同步"), "", toggle("background", p.background, t("關閉視窗後繼續同步"))) +
        row(
          t("活動同步"),
          t("同步 AI 狀態與 Mac 資源用量，並在任務事件發生時喚醒手環。"),
          toggle("activity-sync", p.syncEnabled ?? !r.paused, t("活動同步"), "pause"),
        ) +
        row(
          t("重設任務顯示"),
          t("若已結束的任務仍顯示進行中，可清除本機記錄。不會停止 AI 任務，下一個事件會重新更新。"),
          actionButton(t("重設"), "reset_activity"),
        ),
    ) +
    group(
      t("手環顯示"),
      row(
          t("任務期間保持亮屏"),
          p.syncEnabled === false ? t("活動同步已關閉，此設定會在恢復同步後生效。") : t("預設關閉。開啟後，思考、執行及等待確認時持續亮屏，全部任務結束後才開始息屏倒數。"),
          toggle("activity-keep-awake", p.activityKeepAwake === true, t("任務期間保持亮屏"), "activity_keep_awake"),
        ) +
        row(
          t("自動息屏延遲"),
          p.activityKeepAwake ? t("全部任務結束後開始倒數；待機時手動喚醒也使用此時間。5 到 1800 秒。") : t("每次事件或手動喚醒後的亮屏時間，5 到 1800 秒。"),
          `<span class="hold-field"><input id="wake-hold" class="number" type="number" inputmode="numeric" min="5" max="1800" step="1" value="${holdSeconds()}"><span class="unit">${t("秒")}</span>${actionButton(t("儲存"), "wake_hold")}</span>`,
        ) +
        row(
          t("省電模式"),
          t("開啟後，Buddy 與 App 預覽固定為 10 FPS，手環亮度固定為 25；關閉後恢復選定值。"),
          toggle("power-saving", p.powerSaving === true, t("省電模式"), "power_saving"),
        ) +
        row(
          t("自動亮度"),
          t("開啟後由手環調整亮度，停用手動滑桿。省電時暫時關閉，結束後恢復。"),
          toggle("band-auto-brightness", p.powerSaving ? false : automaticBrightness, t("自動亮度"), "band_auto_brightness", p.powerSaving === true),
        ) +
        row(
          t("手環亮度"),
          t("範圍 0–255。省電模式固定為 25，關閉後恢復選定亮度。") + (r.ack?.brightness?.status === "error" ? " " + t("手環未能套用亮度，請重試") : ""),
          `<span class="brightness-control"><input id="band-brightness" type="range" min="0" max="255" step="1" aria-label="${t("手環亮度")}" value="${p.powerSaving ? 25 : p.bandBrightness ?? r.ack?.bandBrightness ?? 128}" ${p.powerSaving || automaticBrightness || busyAction || operationActive() ? "disabled" : ""}><output id="brightness-value" for="band-brightness">${p.powerSaving ? 25 : automaticBrightness ? t("自動") : p.bandBrightness ?? r.ack?.bandBrightness ?? "—"}</output>${actionProgress("band_brightness") ? `<span class="control-status" role="status">${spinner}${actionProgress("band_brightness")}</span>` : ""}</span>`,
        ) +
        row(
          t("Buddy 幀率"),
          t("手環與 App 預覽使用相同目標幀率，10–30 FPS；實際流暢度取決於手環負載。"),
          `<span class="hold-field"><input id="buddy-fps" aria-label="${t("Buddy 幀率")}" class="number" type="number" inputmode="numeric" min="10" max="30" step="1" value="${p.powerSaving ? 10 : p.buddyFps ?? 10}" ${p.powerSaving || busyAction || operationActive() ? "disabled" : ""}><span class="unit">FPS</span>${actionButton(t("儲存"), "buddy_fps", "", "", p.powerSaving === true)}</span>`,
        ),
    ) +
    group(
      t("任務通知"),
      row(
        t("任務完成震動"),
        t("預設關閉。每個 AI 任務完成時震動一次；多個任務分別通知。取消、工具結束或等待確認不會觸發。"),
        toggle("completion-vibration", p.completionVibration === true, t("任務完成震動"), "completion_vibration"),
      ) +
        row(
          t("震動模式"),
          t("預設短震，震動時長由手環系統決定。"),
          `<span class="toggle-control">${vibrationProgress ? `<span class="control-status" role="status">${spinner}${vibrationProgress}</span>` : ""}<select id="completion-vibration-mode" aria-label="${t("震動模式")}" ${busyAction || operationActive() ? "disabled" : ""}${vibrationProgress ? ' aria-busy="true"' : ''}>${options([["short", t("短震")], ["long", t("長震")]], p.completionVibrationMode || "short")}</select></span>`,
        ),
    ) +
    group(
      t("關於"),
      row(`<a class="project-link" href="${PROJECT_URL}" target="_blank" rel="noopener noreferrer" data-action="open_project">MiBand Agent Buddy</a>`, "", versionButton) +
        updatePanel +
        row(t("授權"), "", '<span class="value">AGPL-3.0</span>'),
      t("社群開源專案，與 Xiaomi、OpenAI、Anthropic、DeepSeek 無關。通訊基於 AstralSightStudios 的 AstroBox Core、Bluetooth 與 BtClassicSpp，帳號流程基於 AstroBox Account（github.com/AstralSightStudios）。固定版本與修改說明見 THIRD_PARTY_NOTICES.md。"),
    ) +
    `<details class="diagnostics"><summary>${t("連線診斷")}</summary><pre>${escape(JSON.stringify({ connection: r.connection, transport: r.diagnostics, version: r.ack?.appVersion, wake: r.wake, operation: r.operation, keepScreen: r.ack?.keepDiagnostics, pageLifecycle: r.ack?.pageLifecycle, drawing: r.ack?.drawing, settingsApplied: r.ack?.settingsApplied, brightness: r.ack?.brightness, bandBrightness: r.ack?.bandBrightness, capabilities: r.ack?.capabilities }, null, 2))}</pre></details>`
  );
}
function applyChrome() {
  const p = state.preferences;
  document.documentElement.lang = setLanguage(
    resolveLanguage(p.language, globalThis.navigator?.languages),
  );
  document.documentElement.dataset.theme = ["claude", "chatgpt", "deepseek"].includes(p.appTheme)
    ? p.appTheme
    : "claude";
  document.documentElement.dataset.dark = String(
    p.appearance === "dark" ||
      (p.appearance === "system" && matchMedia("(prefers-color-scheme: dark)").matches),
  );
}
// Theme/appearance only flip CSS variables; persist in the background.
function setPendingPreferences(next) {
  const revision = ++stateEpoch;
  for (const [key, value] of Object.entries(next)) {
    pendingPreferences.set(key, { value, revision, previous: state.preferences[key] });
    state.preferences[key] = value;
  }
  return revision;
}
function rollbackPreferences(revision) {
  for (const [key, pending] of pendingPreferences) {
    if (pending.revision !== revision) continue;
    state.preferences[key] = pending.previous;
    pendingPreferences.delete(key);
  }
}
function savePreferences(next, { relayout = false } = {}) {
  const revision = setPendingPreferences(next);
  applyChrome();
  if (relayout) render();
  if (!bridge.available) return;
  bridge
    .action("preferences", {
      appTheme: state.preferences.appTheme,
      appearance: state.preferences.appearance,
      language: state.preferences.language,
      keepScreen: false,
      background: state.preferences.background,
    })
    .catch((e) => {
      rollbackPreferences(revision);
      render();
      toast.show("error", t(String(e)));
    })
    .finally(() => { stateEpoch++; refresh({ fresh: true }); });
}
function render() {
  if (!hydrated) return;
  const p = state.preferences,
    r = state.runtime,
    device = selectedDevice();
  applyChrome();
  document.documentElement.dataset.loading = "false";
  $("#app").ariaBusy = "false";
  $("#navigation").innerHTML = ["buddy", "devices", "hooks", "account", "settings"]
    .map(
      (k) =>
        `<button class="nav ${page === k ? "active" : ""}" data-page="${k}" data-label="${t(labels[k])}" aria-label="${t(labels[k])}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[k]}</svg><span class="nav-label">${t(labels[k])}</span></button>`,
    )
    .join("");
  const status = t(wakeProgress(r) || connectionNames[r.connection] || "未連線");
  const deviceName = device?.name || t("尚未選擇手環");
  const ready = ["connected", "waiting", "standby"].includes(r.connection);
  const battery = Number.isFinite(r.device?.battery) ? r.device.battery : r.battery;
  $("#device-summary").innerHTML =
    `<div class="device-mini" title="${escape(t("{name}：{status}", { name: deviceName, status }))}"><i class="dot ${online() ? "online" : r.connection === "standby" ? "standby" : ""}"></i><div class="device-text"><span class="device-name">${escape(deviceName)}</span><span class="device-status">${status}</span></div>${ready && Number.isFinite(battery) ? batteryIcon(battery, r.device?.charging) : ""}</div>`;
  $("#title").textContent = t(labels[page]);
  $("#notice").textContent =
    (state.loginError && t(state.loginError)) ||
    (state.busy ? t("正在取得小米裝置…") : null) ||
    (r.error && !operationActive() && (page === "devices" || !bandOnlyError(r.error)) ? t(r.error) : null) ||
    (ready && Number.isFinite(battery) && battery < 20 ? t("手環電量低於 20%，請及時充電。") : null) ||
    (!bridge.available ? t("介面預覽，未連接原生 App") : "");
  const previousCanvas = $("#band");
  $("#content").innerHTML =
    page === "welcome"
      ? welcomePage(state, actionButton(t("登入小米帳號"), "login", "", "primary"))
      : page === "buddy"
        ? buddyPage()
      : page === "devices"
        ? devicesPage()
        : page === "hooks"
          ? integrationsPage(state.runtime.agent, escape, state.integration)
        : page === "account"
          ? accountPage()
          : settingsPage();
  const nextCanvas = $("#band");
  if (previousCanvas && nextCanvas) {
    previousCanvas.setAttribute("aria-label", nextCanvas.getAttribute("aria-label"));
    nextCanvas.replaceWith(previousCanvas);
  }
  updateLive();
  preview.draw();
}
function renderLoading(error = false) {
  applyChrome();
  document.documentElement.dataset.loading = "true";
  $("#app").ariaBusy = "true";
  $("#startup").innerHTML = `<img class="startup-icon" src="assets/app-icon.png" alt=""><p>${error ? t("無法讀取本機服務狀態") : t("載入中…")}</p>${error ? `<button class="button" data-action="retry">${t("重新載入")}</button>` : spinner}`;
}
function updateLive() {
  const progress = operationActive() ? t(operationProgress[operation().status]) : bandActions.has(busyAction) ? actionProgress(busyAction) : t(wakeProgress(state.runtime));
  $("#operation-status").innerHTML = progress ? `${spinner}<span>${progress}</span>` : "";
  if ($("#last-sync")) $("#last-sync").textContent = syncText();
  if ($("#device-sync")) $("#device-sync").textContent = syncText();
  if ($("#hold-duration")) $("#hold-duration").textContent = duration(holdSeconds());
  if ($("#activity")) $("#activity").textContent = activityText();
  if ($("#session-summary")) $("#session-summary").textContent = sessionsText();
  if (page === "hooks" && state.runtime.agent?.eventCount && $("#hook-receipt"))
    $("#hook-receipt").textContent = t("已收到 {n} 個事件，最後更新 {time}", { n: state.runtime.agent.eventCount, time: formatTime(state.runtime.agent.lastEventAt) });
  const dot = $("#buddy-dot");
  if (dot) {
    const kind = dotState();
    dot.className = `buddy-dot ${kind}`;
  }
  const badge = $("#screen-badge");
  if (badge) {
    const remaining = screenRemaining(),
      ready = linkReady(),
      unknown = state.runtime.connection !== "connected" || !state.runtime.ack;
    badge.textContent = !ready ? "" : progress || (unknown ? t("亮屏狀態待確認") : remaining > 0 ? state.runtime.ack?.wakeDisplay?.active ? t("任務中保持亮屏") : screenText(remaining) : t("息屏"));
    badge.className = `chip screen-badge ${!ready ? "hidden" : progress || unknown ? "busy" : remaining > 0 ? "on" : "off"}`;
    const screen = $(".screen");
    if (screen) screen.classList.toggle("asleep", ready && !unknown && remaining <= 0);
  }
}
// Each settled operation is announced once; the first state only seeds history.
function announceOperation() {
  const op = operation();
  if (!op || ["waking", "applying"].includes(op.status)) return;
  if (settledOperation === undefined || settledOperation === op.id) {
    settledOperation = op.id;
    return;
  }
  settledOperation = op.id;
  if (op.status === "done") {
    toast.show("success", t(operationDone[op.kind] || "完成"));
    if (op.kind === "theme") draftTheme = null;
  } else if (op.status === "cancelled") {
    if (op.code !== "superseded")
      toast.show("error", t(operationCancelled[op.code] || "操作已取消"));
  } else {
    toast.show(
      "error",
      operationErrors[op.code] ? t(operationErrors[op.code]) : t("操作失敗（{code}）", { code: op.code || t("未知原因") }),
    );
  }
  if (op.kind === "page" && op.status !== "done" && ackPage !== null)
    bandPage = ackPage;
}
// The spinner follows the device's answer, not the bridge call, which returns at once.
function settleRefresh() {
  if (!refreshingSince) return;
  if ((state.runtime.device?.at || 0) >= refreshingSince) refreshingSince = 0;
  else if (Date.now() - refreshingSince >= 10000) {
    refreshingSince = 0;
    toast.show("error", t("手環沒有回應，請確認手環在附近"));
  }
}
async function refresh({ fresh = false } = {}) {
  if (!bridge.available) return;
  if (refreshing) {
    if (!fresh) return refreshing;
    while (refreshing) await refreshing;
  }
  refreshing = readState();
  try { return await refreshing; }
  finally { refreshing = null; }
}
async function readState() {
  const epoch = stateEpoch;
  try {
    const firstLoad = !hydrated;
    const wasLoggedIn = state.loggedIn;
    const wasOperating = operationActive();
    const selected = state.preferences.selected;
    const incoming = await bridge.getState();
    // A read begun before a mutation must never undo the user's newer choice.
    if (epoch !== stateEpoch) return false;
    state = incoming;
    for (const [key, pending] of pendingPreferences) {
      if (state.preferences[key] === pending.value) pendingPreferences.delete(key);
      else state.preferences[key] = pending.value;
    }
    if (pendingAutostart) {
      if (state.autostart === pendingAutostart.value) pendingAutostart = null;
      else state.autostart = pendingAutostart.value;
    }
    hydrated = true;
    if (firstLoad) {
      page = initialPage(state);
      setupSession = page !== "buddy";
      initialDeviceCheck = page === "buddy";
    }
    if (initialDeviceCheck) {
      if (state.runtime.buddy?.installed === false) {
        page = "devices";
        setupSession = true;
        initialDeviceCheck = false;
      } else if (state.runtime.buddy?.installed === true || state.runtime.ack?.appVersion) {
        initialDeviceCheck = false;
      }
    }
    if (selected !== state.preferences.selected) draftTheme = null;
    const reported = state.runtime.ack?.page;
    if (typeof reported === "number" && (reported !== ackPage || (wasOperating && !operationActive()))) {
      ackPage = reported;
      if (!operationActive()) bandPage = reported;
    }
    if (settledOperation === undefined && (!operation() || operationActive()))
      settledOperation = null;
    announceOperation();
    settleRefresh();
    if (!wasLoggedIn && state.loggedIn && ["welcome", "account"].includes(page)) page = "devices";
    const op = operation();
    const next = JSON.stringify([
      page,
      setupSession,
      bandPage,
      state.loggedIn,
      state.loginError,
      state.busy,
      state.devices,
      state.preferences,
      state.runtime.connection,
      state.runtime.error,
      state.runtime.ack?.buddyTheme,
      state.runtime.ack?.settingsApplied,
      state.runtime.ack?.appVersion,
      state.runtime.ack?.capabilities,
      state.runtime.device,
      state.runtime.battery,
      state.runtime.installation,
      state.runtime.buddy,
      state.runtime.progress,
      state.runtime.paused,
      Number(state.runtime.agent?.eventCount) > 0,
      op?.id,
      op?.status,
      state.autostart,
      state.appVersion,
      state.desktopUpdate,
      refreshingSince,
    ]);
    if (next !== signature) {
      if (
        !busyAction &&
        !["SELECT", "INPUT"].includes(document.activeElement?.tagName)
      ) {
        signature = next;
        render();
      } else updateLive();
    } else updateLive();
    return true;
  } catch {
    if (epoch !== stateEpoch) return false;
    if (hydrated) $("#notice").textContent = t("無法讀取本機服務狀態");
    else renderLoading(true);
    return false;
  }
}
async function perform(op, value, success = "") {
  if (!bridge.available) {
    toast.show("error", t("請在 Mac App 中操作"));
    return;
  }
  const region = $("#region")?.value || state.region || "cn";
  const preference = { activity_keep_awake: "activityKeepAwake", power_saving: "powerSaving", buddy_fps: "buddyFps", band_brightness: "bandBrightness", band_auto_brightness: "bandAutoBrightness", completion_vibration: "completionVibration", completion_vibration_mode: "completionVibrationMode", wake_hold: "wakeHoldSeconds", pause: "syncEnabled" }[op];
  const revision = preference ? setPendingPreferences({ [preference]: op === "pause" ? !value : value }) : ++stateEpoch;
  if (op === "autostart") {
    pendingAutostart = { value, previous: state.autostart };
    state.autostart = value;
  }
  busyAction = op;
  render();
  try {
    if (op === "login") await bridge.openLogin(region);
    else if (op === "finish")
      await bridge.finishLogin(region);
    else await bridge.action(op, value);
    if (success && (op === "wake_hold" || !(bandActions.has(op) && linkReady()))) toast.show("success", success);
    if (op === "logout") {
      draftTheme = null;
      page = "account";
    }
    if (op === "finish") page = "devices";
  } catch (e) {
    rollbackPreferences(revision);
    if (op === "autostart" && pendingAutostart) {
      state.autostart = pendingAutostart.previous;
      pendingAutostart = null;
    }
    toast.show("error", t(updateErrorMessage(String(e))));
    if (op === "refresh_device") refreshingSince = 0;
    if (op === "page" && ackPage !== null) bandPage = ackPage;
  } finally {
    stateEpoch++;
    await refresh({ fresh: true });
    busyAction = null;
    render();
  }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button, a[data-action]");
  if (!b) return;
  if (b.tagName === "A") {
    if (!bridge.available) return;
    e.preventDefault();
  }
  if (busyAction || b.disabled) return;
  if (b.dataset.action === "retry") {
    renderLoading();
    refresh();
    return;
  }
  if (!hydrated) return;
  if (b.dataset.copyIntegration) {
    const text = integrationCopy(b.dataset.copyIntegration, state.integration);
    if (text) bridge.copyText(text)
      .then(() => toast.show("success", t("已複製，可貼到要接入的 AI 工具")))
      .catch(() => toast.show("error", t("無法複製，請手動選取下方文字")));
    return;
  }
  if (b.dataset.page) {
    page = b.dataset.page;
    initialDeviceCheck = false;
    if (["buddy", "hooks"].includes(page) && setupStage(state) === "ready") setupSession = false;
    confirmLogout = false;
    updateExpanded = false;
    render();
    if (page === "settings") checkUpdatesOnce();
    return;
  }
  if (b.dataset.view) {
    const next = Number(b.dataset.view);
    if (next === bandPage) return;
    bandPage = next;
    if (linkReady()) perform("page", next);
    else render();
    return;
  }
  if (b.dataset.themeChoice) {
    draftTheme = b.dataset.themeChoice;
    render();
    return;
  }
  let op = b.dataset.action;
  if (!op) return;
  if (op === "update_details") {
    updateExpanded = !updateExpanded;
    render();
    checkUpdatesOnce();
    return;
  }
  if (op === "logout" && !confirmLogout) {
    confirmLogout = true;
    render();
    return;
  }
  confirmLogout = false;
  if (op === "wake_hold") {
    saveHold();
    return;
  }
  if (op === "buddy_fps") {
    saveFps();
    return;
  }
  if (op === "reset_activity") {
    perform(op, null, t("任務顯示已重設"));
    return;
  }
  if (op === "refresh_device") refreshingSince = Date.now();
  perform(
    op,
    op === "theme"
      ? previewTheme()
      : op === "connect"
        ? Number(b.dataset.value)
        : op === "pause"
          ? !state.runtime.paused
          : null,
  );
});
function checkUpdatesOnce() {
  if (!bridge.available || updateChecked || state.desktopUpdate?.status && state.desktopUpdate.status !== "idle") return;
  updateChecked = true;
  bridge.action("check_update", null).then(() => refresh()).catch(() => { updateChecked = false; });
}
function saveFps() {
  if (state.preferences.powerSaving || operationActive()) return;
  const text = String($("#buddy-fps")?.value ?? "").trim();
  const fps = Number(text);
  if (!/^\d+$/.test(text) || fps < 10 || fps > 30) {
    toast.show("error", t("請輸入 10 到 30 之間的整數幀率"));
    return;
  }
  perform("buddy_fps", fps);
}
function saveHold() {
  const text = String($("#wake-hold")?.value ?? "").trim();
  const seconds = Number(text);
  if (!/^\d+$/.test(text) || seconds < 5 || seconds > 1800) {
    toast.show("error", t("請輸入 5 到 1800 之間的整數秒數"));
    return;
  }
  perform("wake_hold", seconds, holdMessage(seconds));
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target?.id === "wake-hold" && !busyAction) saveHold();
  if (e.key === "Enter" && e.target?.id === "buddy-fps" && !busyAction) saveFps();
});
document.addEventListener("input", (e) => {
  if(e.target.id==="band-brightness")$("#brightness-value").textContent=e.target.value;
});
document.addEventListener("change", (e) => {
  if (busyAction || e.target.disabled) return;
  if(e.target.id === "band-auto-brightness"){
    if(!state.preferences.powerSaving)perform("band_auto_brightness",e.target.checked);
    return;
  }
  if (e.target.id === "band-brightness") {
    const value=Number(e.target.value);
    if(!state.preferences.powerSaving && !(state.preferences.bandAutoBrightness ?? state.runtime.ack?.bandAutoBrightness ?? (state.runtime.ack?.brightness?.mode===1)) && !operationActive() && Number.isInteger(value) && value>=0 && value<=255)perform("band_brightness",value);
    return;
  }
  if (e.target.id === "region" || e.target.id === "wake-hold") return;
  if (e.target.id === "autostart") {
    perform("autostart", e.target.checked);
    return;
  }
  if (e.target.id === "activity-keep-awake") {
    perform("activity_keep_awake", e.target.checked);
    return;
  }
  if (e.target.id === "completion-vibration") {
    perform("completion_vibration", e.target.checked);
    return;
  }
  if (e.target.id === "completion-vibration-mode") {
    perform("completion_vibration_mode", e.target.value);
    return;
  }
  if (e.target.id === "activity-sync") {
    perform("pause", !e.target.checked);
    return;
  }
  if (e.target.id === "buddy-fps") return;
  if (e.target.id === "power-saving") {
    perform("power_saving", e.target.checked);
    return;
  }
  if (page !== "settings") return;
  const languageChanged = $("#language").value !== state.preferences.language;
  savePreferences(
    {
      appTheme: $("#app-theme").value,
      appearance: $("#appearance").value,
      language: $("#language").value,
      background: $("#background").checked,
    },
    { relayout: languageChanged || e.target.id === "language" },
  );
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
const preview = startPreview(() => ({
  runtime: state.runtime,
  theme: previewTheme(),
  online: online(),
  bandPage,
  powerSaving: state.preferences.powerSaving === true,
  buddyFps: state.preferences.buddyFps ?? 10,
}));
if (hydrated) render();
else renderLoading();
refresh();
const refreshTimer = setInterval(refresh, 1000);
window.addEventListener("pagehide", () => {
  clearInterval(refreshTimer);
  preview.stop();
}, { once: true });
