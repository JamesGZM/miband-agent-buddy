import { bridge } from "./bridge.js";
import { initialState } from "./state.js";
import { startPreview } from "./preview.js";
import { createToast } from "./toast.js";
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
  page = "buddy",
  bandPage = 0,
  ackPage = null,
  draftTheme = null,
  busyAction = null,
  signature = "",
  confirmLogout = false,
  refreshingSince = 0,
  settledOperation = undefined;
const toast = createToast(() => $("#toast"));
const icons = {
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
  buddy: "Buddy",
  devices: "手環",
  account: "帳號",
  settings: "設定",
};
const connectionNames = {
  disconnected: "未連線",
  connecting: "連線中",
  authenticated: "已認證",
  waiting: "等待 Buddy 回應",
  standby: "已連線，手環休眠中",
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
  app_missing: "手環尚未安裝 Buddy，請到「手環」頁安裝",
  unsupported: "手環上的 Buddy 版本過舊，請先更新",
  superseded: "操作已被新的操作取代",
  not_connected: "手環未連線",
  paused: "同步已暫停，請先恢復同步",
  link_lost: "與手環的連線中斷",
  display_unconfirmed: "手環未確認亮屏",
  launch_failed: "無法開啟手環上的 Buddy",
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
  ["connected", "waiting", "standby"].includes(state.runtime.connection) &&
  !state.runtime.paused;
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
const previewTheme = () => draftTheme || appliedTheme() || "chatgpt";
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
  return `<span class="battery ${level <= 20 ? "low" : ""}" title="${t("電量 {n}%", { n: level })}"><svg viewBox="0 0 26 12" aria-hidden="true"><rect class="shell" x=".5" y=".5" width="22" height="11" rx="3"/><rect class="cap" x="23.5" y="3.5" width="2" height="5" rx="1"/><rect class="level" x="2.5" y="2.5" width="${((18 * level) / 100).toFixed(1)}" height="7" rx="1.5"/></svg>${charging ? svg(glyphs.bolt, "bolt") : ""}<span>${level}%</span></span>`;
}
function bytes(value) {
  if (!Number.isFinite(value)) return "—";
  return value >= 1e9 ? (value / 1e9).toFixed(1) + " GB" : (value / 1e6).toFixed(value >= 1e8 ? 0 : 1) + " MB";
}
const spinner = '<span class="spinner" aria-hidden="true"></span>';
function actionButton(text, action, value = "", cls = "", disabled = false) {
  const loading = busyAction === action;
  return `<button class="button ${cls} ${loading ? "loading" : ""}" data-action="${action}" data-value="${escape(value)}" ${disabled || loading || busyAction ? "disabled" : ""}>${loading ? spinner : ""}${text}</button>`;
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
  if (!online() && r.connection !== "standby") return t("未連線");
  return (
    "Codex " +
    t(modes[r.agent?.state] || "待機") +
    (r.agent?.stale ? t("（較久沒有更新）") : "")
  );
}
function buddyPage() {
  const op = operation();
  const pageBusy = operationActive() && op.kind === "page";
  const waking = (operationActive() && op.kind === "wake") || busyAction === "wake";
  const segment = (index, text) =>
    `<button data-view="${index}" class="${bandPage === index ? "active" : ""} ${pageBusy && bandPage === index ? "loading" : ""}" ${operationActive() || busyAction ? "disabled" : ""}>${pageBusy && bandPage === index ? spinner : ""}${text}</button>`;
  const ready = linkReady();
  const screen = `<button class="screen" data-action="wake" title="${ready ? t("點按喚醒手環") : t("連線手環後可點按喚醒")}" ${!ready || operationActive() || busyAction ? "disabled" : ""}><canvas id="band" width="490" height="192" aria-label="${t("手環畫面預覽")}"></canvas>${waking ? `<span class="screen-overlay">${spinner}${t("喚醒手環中…")}</span>` : ""}</button>`;
  const top = `<div class="hero-top"><span class="chip status-chip" title="${t("活動")}"><i id="buddy-dot" class="buddy-dot"></i><span id="activity">${escape(activityText())}</span></span><span id="screen-badge" class="chip screen-badge"></span></div>`;
  const bottom = `<div class="hero-bottom"><div class="segments" role="group" aria-label="${t("手環頁面")}">${segment(0, t("角色"))}${segment(1, t("資源"))}</div><div class="hero-meta"><span class="meta" title="${t("最後同步")}">${svg(glyphs.sync)}<span id="last-sync">${syncText()}</span></span><span class="meta" title="${t("喚醒後亮屏時長")}">${svg(glyphs.hold)}<span id="hold-duration">${duration(effectiveHold())}</span></span></div></div>`;
  const cards = THEMES.map(({ id, name }) => {
    const supported = themeSupported(id);
    return `<button class="theme-card ${previewTheme() === id ? "selected" : ""}" data-theme-choice="${id}" ${operationActive() ? "disabled" : ""}><span class="theme-thumb"><img alt="" src="assets/${id}-preview.png"></span><span class="theme-name">${name}</span>${!supported ? `<span class="theme-note">${t("需要更新 Buddy")}</span>` : appliedTheme() === id ? `<span class="theme-note">${t("使用中")}</span>` : ""}</button>`;
  }).join("");
  const selected = previewTheme();
  return `<section class="group"><div class="panel preview-panel">${top}${screen}${bottom}</div>${ready ? "" : `<p class="footnote">${t("未連線時只切換預覽。")}</p>`}</section><section class="group"><div class="section-head"><h2>${t("手環主題")}</h2>${bandButton("theme", t("套用主題"), "primary", selected === appliedTheme() || !themeSupported(selected))}</div><div class="theme-strip" role="listbox" aria-label="${t("手環主題")}">${cards}</div><p class="footnote">${themeSupported(selected) ? t("只影響手環畫面。") : t("手環上的 Buddy 需要更新才能使用此主題。")}</p></section>`;
}
function devicesPage() {
  const r = state.runtime,
    p = state.preferences;
  if (!state.loggedIn)
    return `<div class="empty"><p>${t("登入小米帳號後，這裡會列出你綁定的小米手環 9。")}</p><button class="button primary" data-page="account">${t("登入")}</button></div>`;
  const current = selectedDevice();
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
      : group(t("我的手環"), row(t("沒有可用的手環"), t("請確認服務地區，或先在小米運動健康綁定手環後重新登入。")));
  if (!current) return list;
  const installCodes = {
    install_receipt_missing: "沒有收到手環的安裝結果，請重新連線檢查版本",
    install_rejected: "手環拒絕了安裝包",
    install_prepare: "手環尚未準備好接收",
    transfer: "安裝包傳輸失敗",
    timeout: "安裝逾時",
  };
  const installDetail = r.installation?.ok
    ? t("安裝完成，手環會自動開啟 Buddy。")
    : r.installation?.ok === false
      ? t("安裝失敗：") + escape(t(installCodes[r.installation.code] || "請重新連線後重試"))
      : t("連線後會自動檢查版本並開啟 Buddy。");
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
        ? ["standby", t("休眠中")]
        : r.connection === "installing"
          ? ["standby", t("安裝中")]
          : ["connecting", "waiting", "retrying"].includes(r.connection)
            ? ["standby", t("連線中")]
            : ["", t("未連線")];
  const tile = (label, value, extra = "") =>
    `<div class="tile"><span class="tile-label">${label}</span><span class="tile-value">${value}</span>${extra}</div>`;
  const used = Number.isFinite(info.storageTotal) && Number.isFinite(info.storageFree) ? info.storageTotal - info.storageFree : null;
  const storage =
    used === null
      ? tile(t("儲存空間"), "—")
      : tile(
          t("儲存空間"),
          `${bytes(used)} / ${bytes(info.storageTotal)}`,
          `<span class="meter"><span style="width:${info.storageTotal ? Math.round((used / info.storageTotal) * 100) : 0}%"></span></span>`,
        );
  const card = `<section class="group"><div class="panel device-card"><div class="device-head"><div class="device-title"><span class="device-card-name">${escape(current.name)}</span><span class="badge ${badge[0]}"><i class="dot ${badge[0]}"></i>${badge[1]}</span></div><button class="icon-button ${refreshingSince ? "spinning" : ""}" data-action="refresh_device" title="${t("重新整理")}" aria-label="${t("重新整理")}" ${!ready || refreshingSince || busyAction ? "disabled" : ""}>${svg(glyphs.sync)}</button></div><div class="tiles">${tile(
    t("電量"),
    Number.isFinite(battery) ? `${battery}%${info.charging ? `<span class="charging">${svg(glyphs.bolt, "bolt")}${t("充電中")}</span>` : ""}` : "—",
  )}${tile(t("韌體"), escape(info.firmware || "—"))}${tile(t("型號"), escape(info.model || "—"))}${storage}${tile(t("Buddy 版本"), escape(r.ack?.appVersion || "—"))}${tile(t("最後同步"), `<span id="device-sync">${syncText()}</span>`)}</div></div></section>`;
  const actions = group(
    "",
    row(
      t("手環連線"),
      escape(current.address),
      actionButton(t("中斷連線"), "disconnect", current.index),
    ) +
      row(
        t("手環上的 Buddy"),
        installDetail,
        actionButton(t("安裝或更新"), "install", "", "", !ready),
      ) +
      progress,
  );
  return card + actions + list;
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
  const options = (pairs, current) =>
    pairs
      .map(
        ([v, text]) =>
          `<option value="${v}" ${current === v ? "selected" : ""}>${text}</option>`,
      )
      .join("");
  const toggle = (id, checked) =>
    `<input id="${id}" class="switch" type="checkbox" ${checked ? "checked" : ""}>`;
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
        t("強調色"),
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
      t("一般"),
      row(t("登入 Mac 時啟動"), "", toggle("autostart", state.autostart)) +
        row(t("關閉視窗後繼續同步"), "", toggle("background", p.background)) +
        row(
          t("同步與事件喚醒"),
          t("新任務、需要確認、任務完成時亮屏約 {duration}。", { duration: duration(effectiveHold()) }),
          actionButton(r.paused ? t("恢復") : t("暫停"), "pause"),
        ) +
        row(
          t("亮屏時長"),
          holdSeconds() > effectiveHold()
            ? t("目前手環上的 Buddy 最多亮屏 30 秒，更新後會使用 {duration}。", { duration: duration(holdSeconds()) })
            : t("喚醒手環後保持亮屏的時間，5 到 1800 秒。"),
          `<span class="hold-field"><input id="wake-hold" class="number" type="number" inputmode="numeric" min="5" max="1800" step="1" value="${holdSeconds()}"><span class="unit">${t("秒")}</span>${actionButton(t("儲存"), "wake_hold")}</span>`,
        ),
    ) +
    group(
      t("關於"),
      row("MiBand Agent Buddy", "", '<span class="value">0.5.0</span>') +
        row(t("授權"), "", '<span class="value">AGPL-3.0</span>'),
      t("社群開源專案，與 Xiaomi、OpenAI、Anthropic、DeepSeek 無關。通訊基於 AstralSightStudios 的 AstroBox Core、Bluetooth 與 BtClassicSpp，帳號流程基於 AstroBox Account（github.com/AstralSightStudios）。固定版本與修改說明見 THIRD_PARTY_NOTICES.md。"),
    ) +
    `<details class="diagnostics"><summary>${t("連線診斷")}</summary><pre>${escape(JSON.stringify({ connection: r.connection, version: r.ack?.appVersion, wake: r.wake, operation: r.operation, keepScreen: r.ack?.keepDiagnostics, settingsApplied: r.ack?.settingsApplied, capabilities: r.ack?.capabilities }, null, 2))}</pre></details>`
  );
}
function render() {
  const p = state.preferences,
    r = state.runtime,
    device = selectedDevice();
  document.documentElement.lang = setLanguage(resolveLanguage(p.language, globalThis.navigator?.languages));
  document.documentElement.dataset.theme = p.appTheme;
  document.documentElement.dataset.dark = String(
    p.appearance === "dark" ||
      (p.appearance === "system" &&
        matchMedia("(prefers-color-scheme: dark)").matches),
  );
  $("#navigation").innerHTML = ["buddy", "devices", "account", "settings"]
    .map(
      (k) =>
        `<button class="nav ${page === k ? "active" : ""}" data-page="${k}" data-label="${t(labels[k])}" aria-label="${t(labels[k])}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[k]}</svg><span class="nav-label">${t(labels[k])}</span></button>`,
    )
    .join("");
  const status = t(connectionNames[r.connection] || "未連線");
  const deviceName = device?.name || t("尚未選擇手環");
  const ready = ["connected", "waiting", "standby"].includes(r.connection);
  const battery = Number.isFinite(r.device?.battery) ? r.device.battery : r.battery;
  $("#device-summary").innerHTML =
    `<div class="device-mini" title="${escape(t("{name}：{status}", { name: deviceName, status }))}"><i class="dot ${online() ? "online" : r.connection === "standby" ? "standby" : ""}"></i><div class="device-text"><span class="device-name">${escape(deviceName)}</span><span class="device-status">${status}</span></div>${ready && Number.isFinite(battery) ? batteryIcon(battery, r.device?.charging) : ""}</div>`;
  $("#title").textContent = t(labels[page]);
  $("#notice").textContent =
    (state.loginError && t(state.loginError)) ||
    (state.busy ? t("正在取得小米裝置…") : null) ||
    (r.error && !operationActive() ? t(r.error) : null) ||
    (!bridge.available ? t("介面預覽，未連接原生 App") : "");
  $("#content").innerHTML =
    page === "buddy"
      ? buddyPage()
      : page === "devices"
        ? devicesPage()
        : page === "account"
          ? accountPage()
          : settingsPage();
  updateLive();
}
function updateLive() {
  if ($("#last-sync")) $("#last-sync").textContent = syncText();
  if ($("#device-sync")) $("#device-sync").textContent = syncText();
  if ($("#hold-duration")) $("#hold-duration").textContent = duration(effectiveHold());
  if ($("#activity")) $("#activity").textContent = activityText();
  const dot = $("#buddy-dot");
  if (dot) {
    const kind = dotState();
    dot.className = `buddy-dot ${kind}`;
  }
  const badge = $("#screen-badge");
  if (badge) {
    const remaining = screenRemaining(),
      ready = linkReady();
    badge.textContent = !ready ? "" : remaining > 0 ? screenText(remaining) : t("息屏");
    badge.className = `chip screen-badge ${!ready ? "hidden" : remaining > 0 ? "on" : "off"}`;
    const screen = $(".screen");
    if (screen) screen.classList.toggle("asleep", ready && remaining <= 0);
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
async function refresh() {
  if (!bridge.available) return;
  try {
    const wasLoggedIn = state.loggedIn;
    state = await bridge.getState();
    const reported = state.runtime.ack?.page;
    if (typeof reported === "number" && reported !== ackPage) {
      ackPage = reported;
      if (!operationActive()) bandPage = reported;
    }
    if (settledOperation === undefined && (!operation() || operationActive()))
      settledOperation = null;
    announceOperation();
    settleRefresh();
    if (!wasLoggedIn && state.loggedIn && page === "account") page = "devices";
    const op = operation();
    const next = JSON.stringify([
      page,
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
      state.runtime.progress,
      state.runtime.paused,
      op?.id,
      op?.status,
      state.autostart,
      refreshingSince,
    ]);
    if (
      next !== signature &&
      !busyAction &&
      !["SELECT", "INPUT"].includes(document.activeElement?.tagName)
    ) {
      signature = next;
      render();
    } else updateLive();
  } catch {
    $("#notice").textContent = t("無法讀取本機服務狀態");
  }
}
async function perform(op, value, success = "") {
  if (!bridge.available) {
    toast.show("error", t("請在 Mac App 中操作"));
    return;
  }
  busyAction = op;
  render();
  try {
    if (op === "login") await bridge.openLogin($("#region")?.value || "cn");
    else if (op === "finish")
      await bridge.finishLogin($("#region")?.value || "cn");
    else await bridge.action(op, value);
    if (success) toast.show("success", success);
    if (op === "logout") {
      draftTheme = null;
      page = "account";
    }
    if (op === "finish") page = "devices";
  } catch (e) {
    toast.show("error", t(String(e)));
    if (op === "refresh_device") refreshingSince = 0;
    if (op === "page" && ackPage !== null) bandPage = ackPage;
  } finally {
    busyAction = null;
    await refresh();
    render();
  }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || busyAction || b.disabled) return;
  if (b.dataset.page) {
    page = b.dataset.page;
    confirmLogout = false;
    render();
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
});
document.addEventListener("change", (e) => {
  if (e.target.id === "region" || e.target.id === "wake-hold") return;
  if (e.target.id === "autostart") {
    perform("autostart", e.target.checked);
    return;
  }
  if (page === "settings")
    perform("preferences", {
      appTheme: $("#app-theme").value,
      appearance: $("#appearance").value,
      language: $("#language").value,
      keepScreen: false,
      background: $("#background").checked,
    });
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
render();
refresh();
setInterval(refresh, 1000);
const stopPreview = startPreview(() => ({
  runtime: state.runtime,
  theme: previewTheme(),
  online: online(),
  bandPage,
}));
window.addEventListener("pagehide", stopPreview, { once: true });
