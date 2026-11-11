// Installed-app inventory is authoritative; a sleeping app can have no ACK.
export function buddyPackageView(runtime) {
  const buddy = runtime.buddy || {};
  const linked = ["connected", "waiting", "standby"].includes(runtime.connection);
  const installing = runtime.connection === "installing" || buddy.status === "installing";
  const status = installing ? "installing" : linked ? buddy.status || "unknown" : "disconnected";
  const labels = {
    disconnected: "連線後可檢查",
    unknown: "尚未檢查",
    checking: "正在檢查…",
    not_installed: "尚未安裝",
    installed: "已安裝，版本待確認",
    update_available: "有可用更新",
    current: "已是最新版",
    newer: "已安裝較新版本",
    error: "檢查未完成",
    installing: "正在安裝",
  };
  return {
    status,
    label: labels[status] || labels.unknown,
    installedVersion: buddy.installed === false ? null : buddy.installedVersion || (!runtime.buddy && linked ? runtime.ack?.appVersion : null),
    installedVersionCode: buddy.installedVersionCode,
    availableVersion: buddy.availableVersion,
    canCheck: linked && !installing && status !== "checking",
    installLabel: status === "not_installed" ? "安裝 Buddy" : status === "update_available" ? "更新 Buddy" : null,
    canReinstall: linked && !installing && !["checking", "newer"].includes(status) && buddy.installed === true,
  };
}

// Buddy management errors belong on the Band page, including older runtime messages.
export function bandOnlyError(message) {
  return typeof message === "string" && (/Buddy.*(?:安裝|版本|更新)/.test(message) || /安裝.*(?:Buddy|逾時)/.test(message));
}
