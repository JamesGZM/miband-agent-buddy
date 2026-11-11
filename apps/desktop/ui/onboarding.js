import { t } from "./i18n.js";

export function setupSteps(state) {
  const linked = ["connected", "waiting", "standby"].includes(state.runtime?.connection);
  const selected = state.devices.some(device => device.supported && device.index === state.preferences.selected);
  const installed = linked && !!state.runtime?.ack?.appVersion;
  return [
    { id: "account", title: "登入小米帳號", detail: "使用與小米運動健康相同的帳號和服務地區。", done: state.loggedIn, page: "account" },
    { id: "device", title: "連線小米手環 9", detail: "保持手環在附近並確認藍牙授權；若其他 App 正連線，先中斷其連線。", done: selected && linked, page: "devices" },
    { id: "buddy", title: "安裝並開啟 Buddy", detail: "在手環頁安裝或更新，收到 Buddy 回應後即可同步。", done: installed, page: "devices" },
    { id: "hooks", title: "接入你的 AI", detail: "將專案 skill 交給 AI，完成配置後發起一個任務來驗證。", done: Number(state.runtime?.agent?.eventCount) > 0, page: "hooks" },
  ];
}

export function onboardingCard(state) {
  const steps = setupSteps(state);
  if (steps.every(step => step.done)) return "";
  const current = steps.find(step => !step.done);
  return `<section class="group onboarding"><div class="panel"><div class="onboarding-head"><div><h2>${t("開始使用 Buddy")}</h2><p>${t("從帳號到手環，再接上你的 AI。")}</p></div><span class="chip">${steps.filter(step => step.done).length} / ${steps.length}</span></div><ol class="setup-list">${steps.map((step, index) => `<li class="setup-step ${step.done ? "done" : step === current ? "current" : ""}"><span class="step-number">${index + 1}</span><div><strong>${t(step.title)}</strong><p>${t(step.detail)}</p></div><button class="button" data-page="${step.page}">${step.done ? t("查看") : t("前往")}</button></li>`).join("")}</ol></div></section>`;
}
