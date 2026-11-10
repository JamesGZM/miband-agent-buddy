//! Tauri authorization and wire decoding; application behavior lives in services.
use crate::{domain::Action, login, persistence, services, state::Shared};
use serde_json::{Value, json};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, State, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;

/// Avoid calling LaunchAgent on every 1s get_state poll.
pub struct AutostartCache(pub AtomicBool);

fn local(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("此操作僅限本機視窗".into())
    }
}

// Async so preference polls never block the AppKit / webview main thread
// (Tauri runs sync commands on the main thread).
#[tauri::command]
pub async fn get_state(
    window: WebviewWindow,
    state: State<'_, Shared>,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    local(&window)?;
    let autostart = app
        .try_state::<AutostartCache>()
        .map(|c| c.0.load(Ordering::Relaxed))
        .unwrap_or(false);
    let s = state.lock().map_err(|_| "狀態不可用")?;
    serde_json::to_value(services::view(&s, autostart)).map_err(|_| "狀態編碼失敗".into())
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

// Disk + session work run on the blocking pool so the async UI path stays free.
#[tauri::command]
pub async fn action(
    window: WebviewWindow,
    state: State<'_, Shared>,
    app: tauri::AppHandle,
    operation: String,
    value: Value,
) -> Result<(), String> {
    local(&window)?;
    let action: Action = serde_json::from_value(json!({"operation":operation,"value":value}))
        .map_err(|_| "不支援的操作或設定")?;
    if let Action::Autostart(enabled) = action {
        let result = if enabled {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        }
        .map_err(|_| "無法更改登入啟動設定".to_string());
        if result.is_ok() {
            if let Some(cache) = app.try_state::<AutostartCache>() {
                cache.0.store(enabled, Ordering::Relaxed);
            }
        }
        return result;
    }
    let shared = state.inner().clone();
    let (logout, relabel, language, prefs_snapshot) =
        tauri::async_runtime::spawn_blocking(move || {
            let mut s = shared.lock().map_err(|_| "狀態不可用".to_string())?;
            if s.busy {
                return Err("請等待目前操作完成".into());
            }
            let logout = matches!(action, Action::Logout);
            let relabel = matches!(action, Action::Preferences(_));
            let needs_prefs_write = matches!(action, Action::Preferences(_));
            services::perform(&mut s, action)?;
            let language = s.prefs.language.clone();
            let prefs_snapshot = if needs_prefs_write {
                Some((s.config.clone(), s.prefs.clone()))
            } else {
                None
            };
            Ok::<_, String>((logout, relabel, language, prefs_snapshot))
        })
        .await
        .map_err(|_| "操作執行失敗".to_string())??;
    if let Some((path, prefs)) = prefs_snapshot {
        tauri::async_runtime::spawn_blocking(move || persistence::save_preferences(&path, &prefs))
            .await
            .map_err(|_| "設定保存失敗".to_string())??;
    }
    if relabel {
        crate::app::apply_language(&app, &language);
    }
    if logout {
        if let Some(w) = app.get_webview_window("xiaomi-login") {
            let _ = w.destroy();
        }
    }
    Ok(())
}
