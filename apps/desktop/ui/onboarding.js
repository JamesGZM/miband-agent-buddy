import { t } from "./i18n.js";

const linkedStates = ["connected", "waiting", "standby"];

function hasSelectedDevice(state) {
  return (state.devices || []).some(device => device.supported && device.index === state.preferences?.selected);
}

export function initialPage(state) {
  if (!state.loggedIn) return "welcome";
  return hasSelectedDevice(state) ? "buddy" : "devices";
}

export function setupStage(state) {
  if (!state.loggedIn) return "account";
  if (!hasSelectedDevice(state)) return "device";
  const runtime = state.runtime || {};
  if (runtime.connection === "installing") return "installing";
  if (!linkedStates.includes(runtime.connection)) return "connecting";
  if (runtime.buddy?.installed === false) return "install";
  return runtime.ack?.appVersion ? "ready" : "checking";
}

export function welcomePage(state, loginButton) {
  const regions = [
    ["cn", "中國大陸"], ["sg", "新加坡"], ["de", "歐洲"],
    ["us", "美國"], ["ru", "俄羅斯"], ["i2", "印度"],
  ].map(([value, label]) => `<option value="${value}" ${value === (state.region || "cn") ? "selected" : ""}>${t(label)}</option>`).join("");
  return `<section class="welcome-layout"><div class="welcome-intro"><img class="welcome-icon" src="assets/app-icon.png" alt=""><p class="welcome-eyebrow">MiBand Agent Buddy</p><h2>${t("讓 AI 的進度，出現在手腕上。")}</h2><p class="welcome-description">${t("連接手環，查看 AI 任務狀態與 Mac 資源用量。")}</p><p class="welcome-support">${t("支援小米手環 9 與小米手環 9 NFC 版。")}</p></div><div class="panel welcome-account"><h2>${t("先連接你的手環")}</h2><p>${t("使用與小米運動健康相同的小米帳號。登入後，選擇你要連線的手環。")}</p><label for="region">${t("服務地區")}</label><select id="region">${regions}</select><p class="welcome-region-hint">${t("請與小米運動健康中的服務地區保持一致。")}</p>${loginButton}<p class="welcome-privacy">${t("在小米官方頁面登入，App 不保存密碼。")}</p></div></section>`;
}

export function connectionGuide(state) {
  if (!state.loggedIn) return "";
  const firstPairing = !hasSelectedDevice(state);
  return `<details class="connection-guide panel" ${firstPairing ? "open" : ""}><summary>${t("首次連線與配對")}</summary><ol><li>${t("先在小米運動健康綁定手環，這裡登入相同的小米帳號，服務地區也要一致。")}</li><li>${t("在手環開啟「設定」→「連接新手機」，確認後停留在等待連線的畫面。")}</li><li>${t("回到此頁，點按你的手環旁的「連線」，再確認手環與 Mac 的配對提示。")}</li></ol><p>${t("日常重新連線不需要再次配對。若連不上，請先中斷其他 App 與手環的連線，並保持手環靠近 Mac。")}</p><p>${t("不需要解除帳號綁定或恢復原廠設定；選項位置可能隨手環韌體不同。")}</p></details>`;
}

export function onboardingCard(state) {
  const stage = setupStage(state);
  if (stage === "account") return `<section class="group"><div class="panel setup-prompt"><h2>${t("先登入小米帳號")}</h2><p>${t("登入後即可選擇帳號中的手環。")}</p><button class="button primary" data-page="welcome">${t("登入小米帳號")}</button></div></section>`;
  if (stage === "device") return `<section class="group"><div class="setup-intro"><h2>${t("選擇你的手環")}</h2><p>${t("首次連線前，請先完成下方的配對準備，再點按手環旁的「連線」。")}</p></div></section>`;
  if (stage === "install") return `<section class="group"><div class="panel setup-prompt"><h2>${t("在手環上啟用 Buddy")}</h2><p>${t("點按「安裝 Buddy」，完成後即可在手環查看任務與資源用量。")}</p></div></section>`;
  return "";
}

export function readyCard(state, { show = false } = {}) {
  if (!show || setupStage(state) !== "ready") return "";
  return `<section class="group"><div class="panel setup-ready"><div><span class="setup-ready-mark" aria-hidden="true">✓</span><h2>${t("Buddy 已就緒")}</h2><p>${t("手環已準備好。接入 AI 可顯示任務進度，也可以先使用 Buddy 查看 Mac 資源。")}</p></div><div class="button-pair"><button class="button primary" data-page="hooks">${t("接入 AI")}</button><button class="button" data-page="buddy">${t("前往 Buddy")}</button></div></div></section>`;
}
