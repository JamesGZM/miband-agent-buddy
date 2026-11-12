export const PROJECT_URL = "https://github.com/JamesGZM/miband-agent-buddy";
const errors = {
  checksum_mismatch: "更新包校驗失敗，請重新檢查並下載。",
  checksum_missing: "發布包缺少校驗資訊，暫時無法安裝。",
  download_invalid: "更新包不完整，請重新檢查並下載。",
  install_failed: "無法啟動更新安裝，請重試。",
  install_location: "請將 App 放在可寫入的 Applications 資料夾後再更新。",
  network_error: "無法連接 GitHub，請檢查網路後重試。",
  open_failed: "無法開啟瀏覽器，請手動開啟專案連結。",
  package_invalid: "更新包未通過驗證，請在 GitHub 查看發布資訊。",
  platform_unsupported: "此平台暫不支援 App 內更新，請前往 GitHub 下載。",
  rate_limited: "GitHub 請求次數已達上限，請稍後重試。",
  release_invalid: "GitHub 發布資訊無效，請稍後重試。",
  storage_error: "無法儲存更新包，請檢查可用空間及檔案權限。",
  update_busy: "正在處理更新，請稍候。",
  update_not_ready: "請先檢查並下載更新。",
};
export const updateErrorMessage = code => errors[code] || code;

export function desktopUpdateView(update = {}) {
  const labels = {
    idle: "從 GitHub 檢查此 Mac 的可用版本。",
    checking: "正在檢查 GitHub 版本…",
    current: "目前已是最新版。",
    available: "有新版本可下載。",
    downloading: "正在下載並驗證更新包…",
    ready: "更新包已驗證，安裝後會重新啟動 App。",
    installing: "正在安裝，即將重新啟動…",
    error: "更新未完成，請重試。",
    unpublished: "目前尚未發布正式版本。",
    unavailable: "此版本尚未提供適用於這台 Mac 的更新包。",
  };
  const status = update.status || "idle";
  return {
    label: status === "error" ? errors[update.error] || labels.error : labels[status] || labels.error,
    canCheck: !["checking", "downloading", "installing"].includes(status),
    canDownload: status === "available",
    canInstall: status === "ready" && update.canInstall === true,
    hasUpdate: ["available", "downloading", "ready"].includes(status),
    progress: status === "downloading" && Number.isFinite(update.progress) ? Math.max(0, Math.min(100, update.progress)) : null,
  };
}
