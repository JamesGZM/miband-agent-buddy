import { t, formatTime } from "./i18n.js";

export const SKILL_URL = "https://github.com/JamesGZM/miband-agent-buddy/blob/main/skills/buddy-hooks/SKILL.md";
export const HOOK_SOURCES = [
  { id: "codex", name: "ChatGPT / Codex", detail: "本機 Codex 工作階段；專案 Hooks 需在宿主中信任後才會執行。", kind: "專案 Hooks" },
  { id: "claude-code", name: "Claude Code", detail: "在目前專案加入 Hooks，保留你原有的設定。", kind: "專案 Hooks" },
  { id: "claude-desktop", name: "Claude Desktop", detail: "本機 Code 分頁沿用 Claude Code 設定；一般聊天不代表已支援生命週期 Hooks。", kind: "Code 分頁" },
  { id: "deepseek", name: "DeepSeek harness", detail: "由執行 DeepSeek 的工具回報任務開始、等待、完成；模型名稱本身不提供 Hooks。", kind: "自訂接入" },
  { id: "custom", name: "Custom harness", detail: "接入能執行本機命令的 AI 工具，每個工作階段使用獨立識別碼。", kind: "自訂接入" },
];

export function setupRequest(provider) {
  const source = HOOK_SOURCES.find(item => item.id === provider);
  if (!source) return null;
  return t("請閱讀 {url}，為我目前的專案接入 MiBand Agent Buddy Hooks。宿主：{provider}。先確認宿主能力與本機 Buddy checkout 路徑，再依 skill 保留原設定、預覽修改、安裝專案級 Hooks 並驗證事件；不要讀取或傳送對話內容。", { url: SKILL_URL, provider: source.name });
}

export function integrationsPage(agent, escape) {
  const received = Number(agent?.eventCount) > 0;
  const staleNotice = `<p class="footnote">${t("超過 15 分鐘沒有事件會提示狀態待確認，長任務仍保持亮屏。若任務已停止但沒有結束事件，可在設定中清除活動。")}</p>`;
  const cards = HOOK_SOURCES.map(source => `<article class="hook-source"><div class="hook-source-head"><h3>${source.name}</h3><span class="chip">${t(source.kind)}</span></div><p>${t(source.detail)}</p><button class="button" data-copy-provider="${source.id}">${t("複製接入指令")}</button><details><summary>${t("查看接入指令")}</summary><textarea readonly aria-label="${t("接入指令")}">${escape(setupRequest(source.id))}</textarea></details></article>`).join("") + staleNotice;
  return `<section class="group"><div class="panel hook-intro"><h2>${t("讓 AI 的進度出現在手環上")}</h2><p>${t("把專案 skill 連結交給你的 AI，它會檢查目前專案並加入對應的 Hooks。每位同事在自己的 Mac 上接入自己的手環。")}</p><div class="hook-link"><input aria-label="${t("專案 skill 連結")}" readonly value="${SKILL_URL}"><button class="button primary" data-copy-skill="true">${t("複製連結")}</button></div><ol class="hook-steps"><li>${t("在目標專案的 AI 對話中貼上接入指令。")}</li><li>${t("檢查變更並在 AI 工具中信任 Hooks，然後開啟新的工作階段。")}</li><li>${t("保持本 App 開啟，發起一個任務並確認下方收到事件。")}</li></ol></div></section><section class="group"><div class="section-head"><h2>${t("選擇你的 AI 工具")}</h2></div><div class="hook-grid">${cards}</div></section><section class="group"><div class="panel hook-status"><div><h2>${received ? t("已收到 Hooks 事件") : t("等待第一個事件")}</h2><p id="hook-receipt">${received ? t("已收到 {n} 個事件，最後更新 {time}", { n: agent.eventCount, time: formatTime(agent.lastEventAt) }) : t("複製連結不代表已接入。完成配置後，請在 AI 工具發起一個任務。")}</p></div><span class="chip">127.0.0.1:10731</span></div><p class="footnote">${t("只接收事件、匿名工作階段識別碼與時間；不讀取提示詞、工具參數或對話。")}</p></section><section class="group"><div class="panel hook-intro"><h2>${t("多個 AI 一起工作")}</h2><p>${t("Buddy 優先顯示等待確認，其次是執行與思考，並顯示活躍與等待數。只有所有任務結束後才回到待機；手動選擇的角色主題保持不變。")}</p><p>${t("一般網頁聊天或遠端容器無法直接連到這台 Mac 的本機接收器；需要由具備本機事件能力的宿主接入。")}</p></div></section>`;
}
