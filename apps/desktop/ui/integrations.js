import { t, formatTime } from "./i18n.js";

export function setupRequest(config) {
  if (!config?.application?.name || !config?.guide) return t("請先開啟 Buddy 桌面 App，以取得內建接入方式。");
  return t("請為目前 AI 宿主建立 MiBand Agent Buddy 使用者全域的持續自動狀態回報，涵蓋跨專案、新主對話及後續輪次。以下已附完整接入說明，請直接閱讀並完成設定。確認實際宿主版本與能力，選擇支援的自動觸發機制，再由內建 CLI 投遞；Hooks 只是其中一種。完成本輪可做的持久設定與載入檢查，不要只測通 CLI 就結束，不得自行改成專案級接入。單次上報成功不代表自動接入完成；不要只靠模型每次記住呼叫工具。優先採用非阻塞觀察機制，維持事件順序及有界處理；只在宿主必須同步時保留最小接收動作。不預設建立安裝工具，不依賴臨時專案或其他 App 的私有執行環境。請以不同專案的新對話及後續一般輪次驗證自動開始與結束。需要原生審核、信任、重載或使用者後續測試時，列出已完成設定與待完成項目，不可繞過。不支援全域可靠機制時，明確回報「自動接入未完成」及具體限制。以 MiBand Agent Buddy 應用身分定位，不要假設安裝目錄或掃描家目錄；不需要下載原始碼或安裝額外環境。保留原設定並預覽變更，避免重複回報。只回報匿名狀態，不讀取或傳送對話內容，失敗時繼續原任務。") + "\n\n" + config.guide;
}

export function integrationCopy(kind, config) {
  return kind === 'request' && config?.application?.name && config?.guide ? setupRequest(config) : null;
}

export function integrationsPage(agent, escape, config) {
  const received = Number(agent?.eventCount) > 0;
  const disabled = config?.application?.name && config?.guide ? '' : ' disabled';
  const request = setupRequest(config);
  return `<section class="group"><div class="panel hook-intro"><h2>${t("讓 AI 的進度出現在手環上")}</h2><p>${t("讓 AI 為目前工具建立使用者全域自動回報，涵蓋不同專案與新對話。自動觸發機制依宿主能力選擇，內建 CLI 負責投遞。")}</p><button class="button primary" data-copy-integration="request"${disabled}>${t("複製接入說明")}</button><details><summary>${t("查看接入說明")}</summary><textarea readonly aria-label="${t("接入指令")}">${escape(request)}</textarea></details><ol class="hook-steps"><li>${t("在要接入的 AI 工具中貼上說明，設定使用者全域自動回報。")}</li><li>${t("讓 AI 保留原設定並完成全域接入，確認已載入或列出必要的信任與重載操作。")}</li><li>${t("用不同專案的新對話及後續輪次驗證，不另外要求上報。")}</li></ol></div></section>
<section class="group"><div class="panel hook-intro"><h2>${t("內建 CLI")}</h2><p>${t("讓 AI 以 MiBand Agent Buddy 應用名稱辨識本機接入能力，由宿主支援的自動機制呼叫內建 CLI，交給 Buddy runtime，不需要提供安裝目錄或另外安裝環境。")}</p><p class="footnote">${t("設定格式與載入方式由 AI 工具決定。回報只等待本機接收，不等待手環；工具呼叫的排程與授權由宿主管理。")}</p></div></section>
<section class="group"><div class="panel hook-status"><div><h2>${received ? t("已收到活動事件") : t("等待第一個事件")}</h2><p id="hook-receipt">${received ? t("已收到 {n} 個事件，最後更新 {time}", {n: agent.eventCount, time: formatTime(agent.lastEventAt)}) : t("複製指令或測試回報不代表自動接入完成。請在 AI 工具發起真實任務。")}</p></div></div><p class="footnote">${t("只接收狀態與匿名識別資訊，不讀取提示詞、工具參數或對話。")}</p></section>
<section class="group"><div class="panel hook-intro"><h2>${t("多個 AI 一起工作")}</h2><p>${t("不同主對話各自追蹤，單一任務結束不會清除其他活動。等待使用者優先顯示，其次是執行與思考。")}</p><p>${t("每個對話只使用一個主要回報機制。僅由模型自行回報時，強制停止可能漏報；沒有結束事件的任務會保持活動並提示狀態待確認。")}</p><p class="footnote">${t("本機入口必須能連到執行 Buddy 的電腦。一般網頁聊天或遠端環境需由客戶端提供本機橋接。")}</p></div></section>`;
}
