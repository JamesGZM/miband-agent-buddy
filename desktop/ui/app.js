import bandUI from "./assets/native-ui.mjs";
import bandDisplay from "./assets/display.mjs";
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
const invoke = window.__TAURI__?.core.invoke;
let state = {
    loggedIn: false,
    devices: [],
    preferences: {
      appTheme: "claude",
      appearance: "system",
      keepScreen: true,
      background: true,
    },
    runtime: {},
  },
  page = "buddy",
  bandPage = 0,
  draftTheme = null,
  busy = false,
  signature = "",
  message = "",
  confirmLogout = false;
const icons = {
  buddy: '<path d="m5 6 6 6-6 6m9 0h6"/>',
  devices:
    '<rect x="6" y="5" width="12" height="14" rx="4"/><path d="M9 5V2h6v3m-6 14v3h6v-3"/>',
  account:
    '<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
};
const labels = {
  buddy: "Buddy",
  devices: "手環",
  account: "帳號",
  settings: "應用設定",
};
const connectionNames = {
  disconnected: "未連線",
  connecting: "連線中",
  authenticated: "已認證",
  waiting: "等待 Buddy",
  connected: "已連線",
  retrying: "重新連線中",
  installing: "正在安裝",
  error: "連線異常",
};
const modes = {
  idle: "Codex 待機中",
  thinking: "Codex 正在思考",
  working: "Codex 正在工作",
  attention: "Codex 等待確認",
  complete: "任務已完成",
  offline: "離線展示",
  error: "活動異常",
  sleep: "暫停中",
};
const button = (text, action, value = "", cls = "") =>
  `<button class="button ${cls}" data-action="${action}" data-value="${escape(value)}">${text}</button>`;
const selectedDevice = () =>
  state.devices.find((d) => d.index === state.preferences.selected);
const online = () => state.runtime.connection === "connected";
const appliedTheme = () => state.runtime.ack?.settingsApplied === true ? state.runtime.ack.buddyTheme : null;
const previewTheme = () => draftTheme || appliedTheme() || "chatgpt";
function render() {
  const p = state.preferences,
    r = state.runtime,
    device = selectedDevice();
  document.documentElement.dataset.theme = p.appTheme;
  document.documentElement.dataset.dark = String(
    p.appearance === "dark" ||
      (p.appearance === "system" &&
        matchMedia("(prefers-color-scheme: dark)").matches),
  );
  $("#navigation").innerHTML = ["buddy", "devices", "account"]
    .map(
      (k) =>
        `<button class="nav ${page === k ? "active" : ""}" data-page="${k}"><svg viewBox="0 0 24 24">${icons[k]}</svg>${labels[k]}</button>`,
    )
    .join("");
  $(".settings").classList.toggle("active", page === "settings");
  $("#device-summary").innerHTML =
    `<div class="device-mini"><strong>${escape(device?.name || "尚未選擇手環")}</strong><small><i class="dot ${online() ? "online" : ""}"></i>${connectionNames[r.connection] || "未連線"}</small></div>`;
  $("#title").textContent = labels[page];
  $("#subtitle").textContent = {
    buddy: "讓手環成為你的桌面伙伴",
    devices: "連線裝置與管理 Buddy",
    account: "你的帳號，你的裝置",
    settings: "讓 Buddy 更符合你的習慣",
  }[page];
  $("#connection").innerHTML =
    `${Number.isFinite(r.battery) ? r.battery + "% · " : ""}<i class="dot ${online() ? "online" : ""}"></i>${connectionNames[r.connection] || "未連線"}`;
  $("#notice").textContent =
    message ||
    state.loginError ||
    (state.busy ? "正在取得小米裝置…" : null) ||
    r.error ||
    (!invoke ? "介面預覽 · 未連接原生客戶端" : "");
  if (page === "buddy") {
    $("#content").innerHTML =
      `<div class="section-head"><h2>手環預覽</h2><span class="eyebrow">${online() ? "即時資料" : "離線預覽"}</span></div><div class="preview-stage"><div class="band"><canvas id="band" width="490" height="192" aria-label="Buddy 手環畫面預覽"></canvas></div><div class="segments"><button data-view="0" class="${bandPage === 0 ? "active" : ""}">角色</button><button data-view="1" class="${bandPage === 1 ? "active" : ""}">資源</button></div><div class="activity"><i class="pulse"></i><span id="activity"></span></div></div><section class="themes-section"><div class="section-head"><h2>Buddy 主題</h2><span class="eyebrow">手動套用</span></div><div class="theme-grid">${["chatgpt", "claude"].map((theme) => `<button class="theme-tile ${previewTheme() === theme ? "selected" : ""}" data-theme-choice="${theme}"><div class="theme-top"><strong>${theme === "claude" ? "Claude" : "ChatGPT"}</strong>${online() && appliedTheme() === theme ? '<span class="badge">使用中</span>' : ""}</div><img class="mini-band" alt="${theme} 主題" src="assets/${theme}-preview.png"></button>`).join("")}</div><div class="apply-row"><p class="hint">只變更手環畫面，不影響 Mac 外觀</p><button class="button primary" data-action="theme" ${!online() || previewTheme() === appliedTheme() || busy ? "disabled" : ""}>套用至手環</button></div></section>`;
  } else if (page === "devices") {
    $("#content").innerHTML = !state.loggedIn
      ? `<div class="empty"><div class="empty-symbol">⌁</div><h2>連上你的第一個 Buddy</h2><p>登入小米帳號，選擇小米手環 9。認證安全保存在這台 Mac 的 App 私有資料目錄。</p><button class="button primary" data-page="account">前往登入</button></div>`
      : `<div class="section-head"><h2>我的手環</h2><span class="eyebrow">${state.devices.length} 個裝置</span></div>${!state.devices.length ? '<p class="section-copy">這個帳號沒有可用裝置。請確認服務地區，或先在小米運動健康完成綁定後重新登入。</p>' : ""}<div class="panel">${state.devices.map((d) => `<div class="row"><div><strong>${escape(d.name)}</strong><p>${escape(d.address)}${!d.supported ? " · 此型號尚未支援" : ""}</p></div><button class="button" data-action="${d.index === p.selected ? "disconnect" : "connect"}" data-value="${d.index}" ${!d.supported ? "disabled" : ""}>${d.index === p.selected ? "中斷連線" : "連線"}</button></div>`).join("")}</div><div class="section-head"><h2>手環上的 Buddy</h2><span class="eyebrow">單一應用 · 專注陪伴</span></div><div class="panel"><div class="row"><div><strong>${r.ack?.appVersion ? "Buddy " + escape(r.ack.appVersion) : "尚未確認應用版本"}</strong><p>${r.installation?.ok ? "安裝已確認。請在手環重新打開 Buddy。" : r.installation?.ok === false ? "安裝未確認：" + escape(({install_receipt_missing:"未收到裝置安裝結果，請重新連線檢查版本",install_rejected:"裝置拒絕安裝包",install_prepare:"裝置未準備好接收",transfer:"安裝包傳輸失敗",timeout:"安裝逾時"})[r.installation.code] || "請重新連線後重試") : "安裝後請在手環打開 Buddy，才能同步資料。"}</p></div><button class="button" data-action="install" ${!["connected", "waiting"].includes(r.connection) ? "disabled" : ""}>安裝／更新</button></div>${r.connection === "installing" ? `<div class="row"><progress class="progress" max="100" value="${Number(r.progress) || 0}"></progress><span>${Number(r.progress) >= 100 ? "傳送完成，等待裝置安裝結果…" : "正在傳送 " + Math.floor(Number(r.progress) || 0) + "%"}</span></div>` : ""}</div><p class="hint">支援目標：小米手環 9 普通版與 NFC 版。其他型號暫不支援。</p>`;
  } else if (page === "account") {
    $("#content").innerHTML = state.loggedIn
      ? `<div class="empty"><div class="empty-symbol">✓</div><h2>小米帳號已登入</h2><p>認證已保存至 App 私有資料目錄。服務地區：${escape(state.region)}，已取得 ${state.devices.length} 個裝置。切換帳號前需先登出。</p>${button("前往手環", "navigate", "devices", "primary")} ${button(confirmLogout ? "確定登出並清除認證" : "登出帳號", "logout", "", "danger")}</div><p class="hint">登出會中斷手環連線並清除這個帳號的本機認證。App 外觀設定不受影響。</p>`
      : `<div class="empty"><div class="empty-symbol">◌</div><h2>讓 Mac 與手環相遇</h2><p>使用小米官方頁面登入。我們不保存密碼；手環認證只存放於App 私有資料目錄。</p><label>服務地區 <select id="region"><option value="cn">中國大陸</option><option value="sg">新加坡</option><option value="de">歐洲</option><option value="us">美國</option><option value="ru">俄羅斯</option><option value="i2">印度</option></select></label><div class="actions">${button("開啟小米官方登入", "login", "", "primary")}</div><p class="hint">登入完成後會自動返回並載入你的手環。</p></div>`;
  } else {
    $("#content").innerHTML =
      `<div class="section-head"><h2>Mac 外觀</h2><span class="eyebrow">與手環主題獨立</span></div><div class="panel"><div class="row"><div><strong>應用主題</strong><p>選擇 Mac 介面的色彩風格</p></div><select id="app-theme">${["claude", "chatgpt", "deepseek"].map((t) => `<option value="${t}" ${p.appTheme === t ? "selected" : ""}>${{ claude: "Claude", chatgpt: "ChatGPT", deepseek: "DeepSeek" }[t]}</option>`).join("")}</select></div><div class="row"><strong>顯示模式</strong><select id="appearance">${Object.entries(
        { system: "跟隨系統", light: "淺色", dark: "深色" },
      )
        .map(
          ([v, t]) =>
            `<option value="${v}" ${p.appearance === v ? "selected" : ""}>${t}</option>`,
        )
        .join(
          "",
        )}</select></div></div><div class="section-head"><h2>日常使用</h2></div><div class="panel">${[
        ["autostart", "登入 Mac 時啟動", state.autostart],
        ["background", "關閉視窗後繼續同步", p.background],
        ["keep-screen", "Buddy 前景保持亮屏", p.keepScreen],
      ]
        .map(
          ([id, text, checked]) =>
            `<label class="row"><strong>${text}</strong><input id="${id}" type="checkbox" ${checked ? "checked" : ""}></label>`,
        )
        .join(
          "",
        )}<div class="row"><div><strong>同步 Mac 資源與 Codex 活動</strong><p>約每 2 秒更新 · CPU、記憶體、磁碟</p></div>${button(r.paused ? "恢復" : "暫停", "pause")}</div></div><div class="section-head"><h2>關於與診斷</h2></div><p class="section-copy">MiBand Agent Buddy · AGPL-3.0<br>獨立的社群開源專案，非 Xiaomi、OpenAI 或 Anthropic 官方產品。通訊基於 AstralSightStudios 的 AstroBox Core、Bluetooth 與 BtClassicSpp，帳號流程基於 AstroBox Account。<br>來源：github.com/AstralSightStudios<br>完整倉庫、固定版本與修改說明見 THIRD_PARTY_NOTICES.md。</p><details><summary>連線診斷</summary><pre>${escape(JSON.stringify({ connection: r.connection, version: r.ack?.appVersion, keepScreen: r.ack?.keepDiagnostics, settingsApplied: r.ack?.settingsApplied }, null, 2))}</pre></details>`;
  }
  updateLive();
}
function updateLive() {
  const r = state.runtime;
  $("#last-sync").textContent = r.lastAckAt
    ? `${Math.max(0, Math.floor((Date.now() - r.lastAckAt) / 1000))} 秒前同步`
    : "尚未同步";
  if ($("#activity"))
    $("#activity").textContent = r.paused
      ? "同步已暫停"
      : online()
        ? modes[r.agent?.state] || "Codex 待機中"
        : "離線展示 · 連線後顯示即時狀態";
}
async function refresh() {
  if (!invoke) return;
  try {
    const wasLoggedIn = state.loggedIn;
    state = await invoke("get_state");
    const ack = state.runtime.ack;
    if (message === "已送出主題設定，等待手環確認" &&
        ack?.settingsApplied === true &&
        ack.settingsRevision === state.runtime.settings?.revision &&
        ack.buddyTheme === state.runtime.settings?.buddyTheme) {
      message = "主題已套用至手環";
    }
    if (!wasLoggedIn && state.loggedIn && page === "account") page = "devices";
    const next = JSON.stringify([
      page,
      state.loggedIn,
      state.loginError,
      state.busy,
      state.devices,
      state.preferences,
      state.runtime.connection,
      state.runtime.error,
      state.runtime.ack?.buddyTheme,
      state.runtime.ack?.settingsApplied,
      state.runtime.installation,
      message,
      state.runtime.progress,
      state.runtime.paused,
      state.autostart,
    ]);
    if (
      next !== signature &&
      !busy &&
      !["SELECT", "INPUT"].includes(document.activeElement?.tagName)
    ) {
      signature = next;
      render();
    } else updateLive();
  } catch {
    message = "無法讀取本機服務狀態";
    $("#notice").textContent = message;
  }
}
async function perform(op, value) {
  if (!invoke) {
    message = "請在原生 Mac App 中操作";
    render();
    return;
  }
  busy = true;
  message = "";
  $("#notice").textContent = "處理中…";
  try {
    if (op === "login")
      await invoke("open_login", { region: $("#region")?.value || "cn" });
    else if (op === "finish")
      await invoke("finish_login", { region: $("#region")?.value || "cn" });
    else await invoke("action", { operation: op, value });
    if (op === "theme") message = "已送出主題設定，等待手環確認";
    if (op === "logout") {
      draftTheme = null;
      page = "account";
    }
    if (op === "finish") page = "devices";
  } catch (e) {
    message = String(e);
  } finally {
    busy = false;
    await refresh();
    render();
  }
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || busy || b.disabled) return;
  if (b.dataset.page) {
    page = b.dataset.page;
    message = "";
    render();
    return;
  }
  if (b.dataset.view) {
    bandPage = Number(b.dataset.view);
    render();
    return;
  }
  if (b.dataset.themeChoice) {
    draftTheme = b.dataset.themeChoice;
    render();
    return;
  }
  let op = b.dataset.action;
  if (!op) return;
  if (op === "navigate") {
    page = b.dataset.value;
    render();
    return;
  }
  if (op === "logout" && !confirmLogout) {
    confirmLogout = true;
    render();
    return;
  }
  confirmLogout = false;
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
document.addEventListener("change", (e) => {
  if (e.target.id === "region") return;
  if (e.target.id === "autostart") {
    perform("autostart", e.target.checked);
    return;
  }
  if (page === "settings")
    perform("preferences", {
      appTheme: $("#app-theme").value,
      appearance: $("#appearance").value,
      keepScreen: $("#keep-screen").checked,
      background: $("#background").checked,
    });
});
const previewRings = {
  cpu: bandUI.createRingTransition(),
  memory: bandUI.createRingTransition(),
  disk: bandUI.createRingTransition(),
};
let previewStamp = null;
const images = new Map();
function image(path) {
  if (!images.has(path)) {
    const im = new Image();
    im.src = "assets/capsule/" + path;
    images.set(path, im);
  }
  return images.get(path);
}
function draw() {
  const canvas = $("#band");
  if (canvas) {
    const ctx = canvas.getContext("2d"),
      r = state.runtime,
      t = performance.now() / 1000,
      theme = previewTheme(),
      mode = online() ? r.agent?.state || "idle" : "idle";
    ctx.clearRect(0, 0, 490, 192);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 490, 192);
    function layer(name, alpha = 1, offset = 0) {
      const im = image(name);
      if (!im.complete || !im.naturalWidth) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(offset, 192);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(im, 0, 0, 192, 490);
      ctx.restore();
    }
    if (bandPage === 0) {
      const motion = bandUI.motion(mode, t, theme);
      layer("face-track.png");
      layer(motion.ringSource.split("/").pop(), motion.ringOpacity);
      layer(motion.loadingSource.split("/").pop(), motion.loadingOpacity);
      layer(motion.symbolSource.split("/").pop(), 1, motion.symbolLeft);
    } else {
      layer("resource-tracks.png");
      const m =
        online() && Date.now() - (r.lastAckAt || 0) < 10000 ? r.metrics : null;
      const stamp = m?.sampledAt || 0;
      if (previewStamp !== stamp) {
        const fields = bandDisplay.fields(m, !m);
        for (const name of ["disk", "memory", "cpu"])
          bandUI.retargetRing(
            previewRings[name],
            fields[name + "Width"],
            performance.now(),
            previewStamp === null || !m,
          );
        previewStamp = stamp;
      }
      const entries = [
        ["disk", m?.disk?.percent, "#647fff"],
        ["memory", m?.memory?.percent, "#a192ff"],
        ["cpu", m?.cpu, "#78edff"],
      ];
      entries.forEach(([name, val, color], i) => {
        layer(
          bandUI
            .ringSource(
              name,
              bandUI.ringValue(previewRings[name], performance.now()),
            )
            .split("/")
            .pop(),
        );
        ctx.textAlign = "center";
        ctx.fillStyle = color;
        ctx.font = "15px -apple-system";
        ctx.fillText(
          name === "memory" ? "MEM" : name.toUpperCase(),
          139 + i * 106,
          76,
        );
        ctx.fillStyle = "#f0f4f0";
        ctx.font = "32px -apple-system";
        ctx.fillText(
          val == null ? "—" : Math.round(val) + "%",
          139 + i * 106,
          114,
        );
        ctx.fillStyle = "#b9c5c0";
        ctx.font = "11px -apple-system";
        const metric = m?.[name];
        ctx.fillText(
          metric
            ? `${(metric.usedBytes / (name === "memory" ? 1073741824 : 1e9)).toFixed(1)} / ${(metric.totalBytes / (name === "memory" ? 1073741824 : 1e9)).toFixed(1)}`
            : name === "cpu"
              ? "TOTAL LOAD"
              : "—",
          139 + i * 106,
          139,
        );
      });
    }
  }
  setTimeout(draw, document.hidden ? 1000 : 100);
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
render();
refresh();
setInterval(refresh, 1000);
draw();
