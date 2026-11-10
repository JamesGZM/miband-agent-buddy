//! Tauri authorization and wire decoding; application behavior lives in services.
use crate::{domain::Action, login, services, state::Shared};
use serde_json::{Value, json};
use tauri::{Manager, State, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;

fn local(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("此操作僅限本機視窗".into())
    }
}
#[tauri::command]
pub fn get_state(
    window: WebviewWindow,
    state: State<Shared>,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    local(&window)?;
    let s = state.lock().map_err(|_| "狀態不可用")?;
    serde_json::to_value(services::view(
        &s,
        app.autolaunch().is_enabled().unwrap_or(false),
    ))
    .map_err(|_| "狀態編碼失敗".into())
}
#[tauri::command]
pub async fn open_login(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, Shared>,
    region: String,
) -> Result<(), String> {
    local(&window)?;
    login::open_login(app, state.inner().clone(), region).await
}
#[tauri::command]
pub async fn finish_login(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, Shared>,
    region: String,
) -> Result<(), String> {
    local(&window)?;
    login::finish_login(app, state.inner().clone(), region).await
}
#[tauri::command]
pub fn action(
    window: WebviewWindow,
    state: State<Shared>,
    app: tauri::AppHandle,
    operation: String,
    value: Value,
) -> Result<(), String> {
    local(&window)?;
    let action: Action = serde_json::from_value(json!({"operation":operation,"value":value}))
        .map_err(|_| "不支援的操作或設定")?;
    let mut s = state.lock().map_err(|_| "狀態不可用")?;
    if s.busy {
        return Err("請等待目前操作完成".into());
    }
    match action {
        Action::Autostart(enabled) => if enabled {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        }
        .map_err(|_| "無法更改登入啟動設定".into()),
        action => {
            let logout = matches!(action, Action::Logout);
            services::perform(&mut s, action)?;
            if logout {
                if let Some(w) = app.get_webview_window("xiaomi-login") {
                    let _ = w.destroy();
                }
            }
            Ok(())
        }
    }
}
