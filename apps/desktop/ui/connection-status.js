// A queued launch is not proof that Buddy has opened or accepted its display lease.
export function wakeProgress(runtime) {
  if (!["waiting", "standby", "connected"].includes(runtime.connection)) return "";
  const recovery = ["activity_reconnect", "activity_unresponsive", "activity_prepare_retry"].includes(runtime.wake?.reason);
  if (runtime.wake?.status === "sending") return recovery ? "正在恢復喚醒 Buddy…" : "正在喚醒 Buddy…";
  if (runtime.wake?.status === "awaiting_ack") return "喚醒指令已送出，等待 Buddy 確認";
  return "";
}
