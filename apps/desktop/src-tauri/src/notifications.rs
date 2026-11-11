//! macOS owns delivery/authorization; the runtime owns the battery threshold and deduplication.
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub fn low_battery(app: &AppHandle, language: &str, percent: u64) -> Result<(), String> {
    let (title, body) = match language {
        "zh-Hans" => ("手环电量低", format!("手环电量为 {percent}%，请及时充电。")),
        "zh-Hant" => ("手環電量低", format!("手環電量為 {percent}%，請及時充電。")),
        _ => (
            "Band battery is low",
            format!("Your band battery is at {percent}%. Please charge it soon."),
        ),
    };
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|_| "notification_failed".to_string())
}
