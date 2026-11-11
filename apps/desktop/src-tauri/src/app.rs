use crate::{
    commands, i18n, persistence,
    protocol::{Connection, RuntimeState},
    runtime::{self, RuntimeClient},
    services,
    state::{Session, Shared},
};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use tauri::{
    AppHandle, Manager,
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};
use tauri_plugin_autostart::ManagerExt;

pub struct TrayItems {
    status: MenuItem<tauri::Wry>,
    open: MenuItem<tauri::Wry>,
    wake: MenuItem<tauri::Wry>,
    pause: MenuItem<tauri::Wry>,
    disconnect: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

struct TrayRefresh {
    pending: AtomicBool,
    last_signature: Mutex<String>,
}

fn band_ready(connection: Connection) -> bool {
    matches!(
        connection,
        Connection::Connected | Connection::Waiting | Connection::Standby
    )
}

fn battery_percent(runtime: &RuntimeState) -> Option<u32> {
    runtime
        .fields
        .get("battery")
        .and_then(|v| v.as_f64())
        .or_else(|| {
            runtime
                .fields
                .get("device")
                .and_then(|v| v.get("battery"))
                .and_then(|v| v.as_f64())
        })
        .filter(|n| n.is_finite() && *n >= 0.0)
        .map(|n| n.round() as u32)
}

fn connection_key(connection: Connection) -> &'static str {
    match connection {
        Connection::Connected => "connected",
        Connection::Standby => "standby",
        Connection::Installing => "installing",
        Connection::Connecting => "connecting",
        Connection::Waiting => "waiting",
        Connection::Retrying => "retrying",
        Connection::Error => "error",
        Connection::Disconnected => "disconnected",
    }
}

fn device_name(s: &Session) -> String {
    s.prefs
        .selected
        .and_then(|index| s.credentials.as_ref().and_then(|c| c.devices.get(index)))
        .map(|d| d.name.clone())
        .unwrap_or_default()
}

/// Stable signature so unchanged runtime frames skip menu churn.
pub fn tray_signature(s: &Session) -> String {
    format!(
        "{}|{}|{}|{}|{}",
        connection_key(s.runtime.connection),
        s.runtime.paused,
        battery_percent(&s.runtime)
            .map(|n| n.to_string())
            .unwrap_or_default(),
        device_name(s),
        i18n::current(&s.prefs.language),
    )
}

fn status_text(s: &Session) -> String {
    let labels = i18n::labels(i18n::current(&s.prefs.language));
    let connection = match s.runtime.connection {
        Connection::Connected => labels.connected,
        Connection::Standby => labels.standby,
        Connection::Installing => labels.installing,
        Connection::Connecting | Connection::Waiting | Connection::Retrying => labels.connecting,
        _ => labels.disconnected,
    };
    let mut parts = Vec::new();
    if s.runtime.paused {
        parts.push(labels.paused.to_string());
    }
    parts.push(connection.to_string());
    let device = s
        .prefs
        .selected
        .and_then(|index| s.credentials.as_ref().and_then(|c| c.devices.get(index)));
    match device {
        Some(device) => parts.push(device.name.clone()),
        None => {
            if !matches!(
                s.runtime.connection,
                Connection::Connected
                    | Connection::Waiting
                    | Connection::Standby
                    | Connection::Installing
                    | Connection::Connecting
                    | Connection::Retrying
            ) {
                parts.push(labels.no_device.to_string());
            }
        }
    }
    if band_ready(s.runtime.connection) {
        if let Some(battery) = battery_percent(&s.runtime) {
            parts.push(format!("{battery}%"));
        }
    }
    parts.join(" · ")
}

fn apply_tray_items(app: &AppHandle) {
    let Some(items) = app.try_state::<TrayItems>() else {
        return;
    };
    let Some(refresh) = app.try_state::<TrayRefresh>() else {
        return;
    };
    let shared = app.state::<Shared>();
    let Ok(s) = shared.lock() else {
        return;
    };
    let signature = tray_signature(&s);
    {
        let Ok(mut last) = refresh.last_signature.lock() else {
            return;
        };
        if *last == signature {
            return;
        }
        *last = signature;
    }
    let labels = i18n::labels(i18n::current(&s.prefs.language));
    let ready = band_ready(s.runtime.connection);
    let _ = items.status.set_text(status_text(&s));
    let _ = items.open.set_text(labels.open);
    let _ = items.wake.set_text(labels.wake);
    let _ = items.wake.set_enabled(ready);
    let _ = items.pause.set_text(if s.runtime.paused {
        labels.resume
    } else {
        labels.pause
    });
    let _ = items.disconnect.set_text(labels.disconnect);
    let _ = items.disconnect.set_enabled(ready);
    let _ = items.quit.set_text(labels.quit);
}

/// Apply tray labels on the main thread immediately (menu callbacks / first paint).
pub fn refresh_tray_now(app: &AppHandle) {
    let app = app.clone();
    let _ = app
        .clone()
        .run_on_main_thread(move || apply_tray_items(&app));
}

/// Coalesce bursty runtime frames onto one main-thread tray update.
pub fn schedule_tray_refresh(app: &AppHandle) {
    let Some(refresh) = app.try_state::<TrayRefresh>() else {
        refresh_tray_now(app);
        return;
    };
    if refresh.pending.swap(true, Ordering::AcqRel) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(200));
        if let Some(state) = app.try_state::<TrayRefresh>() {
            state.pending.store(false, Ordering::Release);
        }
        let painted = app.clone();
        let _ = app
            .clone()
            .run_on_main_thread(move || apply_tray_items(&painted));
    });
}

/// Relabels the tray after the language preference changes.
pub fn apply_language(app: &AppHandle, _choice: &str) {
    if let Some(refresh) = app.try_state::<TrayRefresh>() {
        if let Ok(mut last) = refresh.last_signature.lock() {
            last.clear();
        }
    }
    refresh_tray_now(app);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let config = directory.join("preferences.json");
            let (prefs, credentials, login_error) = persistence::load(&config);
            let shared = Arc::new(Mutex::new(Session {
                credentials,
                busy: false,
                login_error,
                runtime: RuntimeState {
                    paused: !prefs.sync_enabled,
                    ..Default::default()
                },
                prefs,
                worker: RuntimeClient::default(),
                config,
            }));
            app.manage(shared.clone());
            app.manage(crate::updater::UpdateCache::default());
            app.manage(TrayRefresh {
                pending: AtomicBool::new(false),
                last_signature: Mutex::new(String::new()),
            });
            let autostart = app.autolaunch().is_enabled().unwrap_or(false);
            app.manage(crate::commands::AutostartCache(AtomicBool::new(autostart)));
            let language = shared.lock().unwrap().prefs.language.clone();
            runtime::start(shared, app.handle().clone());
            let labels = i18n::labels(i18n::current(&language));
            let status =
                MenuItem::with_id(app, "status", labels.disconnected, false, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", labels.open, true, None::<&str>)?;
            let wake = MenuItem::with_id(app, "wake", labels.wake, false, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", labels.pause, true, None::<&str>)?;
            let disconnect =
                MenuItem::with_id(app, "disconnect", labels.disconnect, false, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", labels.quit, true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[
                    &status,
                    &sep1,
                    &open,
                    &wake,
                    &pause,
                    &disconnect,
                    &sep2,
                    &quit,
                ],
            )?;
            app.manage(TrayItems {
                status: status.clone(),
                open: open.clone(),
                wake: wake.clone(),
                pause: pause.clone(),
                disconnect: disconnect.clone(),
                quit: quit.clone(),
            });
            let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-template.png"))
                .expect("tray template icon");
            TrayIconBuilder::new()
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    "wake" => {
                        let state = app.state::<Shared>();
                        let mut s = state.lock().unwrap();
                        let _ = services::perform(&mut s, crate::domain::Action::Wake);
                        drop(s);
                        refresh_tray_now(app);
                    }
                    "disconnect" => {
                        let state = app.state::<Shared>();
                        let mut s = state.lock().unwrap();
                        let _ = services::disconnect(&mut s);
                        drop(s);
                        refresh_tray_now(app);
                    }
                    "pause" => {
                        let state = app.state::<Shared>();
                        let mut s = state.lock().unwrap();
                        let paused = s.runtime.paused;
                        let _ = services::pause(&mut s, !paused);
                        drop(s);
                        refresh_tray_now(app);
                    }
                    _ => {}
                })
                .build(app)?;
            refresh_tray_now(app.handle());
            if std::env::args().any(|a| a == "--background") {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let s = window.state::<Shared>();
                    if s.lock().unwrap().prefs.background {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        window.app_handle().exit(0);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::open_login,
            commands::finish_login,
            commands::action
        ])
        .build(tauri::generate_context!())
        .expect("Unable to start MiBand Agent Buddy")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = &event {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<Shared>();
                let mut s = state.lock().unwrap();
                s.worker.shutdown();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::{band_ready, battery_percent, connection_key, tray_signature};
    use crate::{
        domain::Preferences,
        protocol::{Connection, RuntimeState},
        runtime::RuntimeClient,
        state::Session,
    };
    use serde_json::json;

    #[test]
    fn band_ready_matches_operation_gate() {
        assert!(band_ready(Connection::Connected));
        assert!(band_ready(Connection::Waiting));
        assert!(band_ready(Connection::Standby));
        assert!(!band_ready(Connection::Disconnected));
        assert!(!band_ready(Connection::Installing));
        let paused = RuntimeState {
            connection: Connection::Standby,
            paused: true,
            ..Default::default()
        };
        assert!(
            band_ready(paused.connection),
            "tray wake remains enabled with background sync off"
        );
    }

    #[test]
    fn battery_reads_top_level_or_device_field() {
        let mut runtime = RuntimeState::default();
        assert_eq!(battery_percent(&runtime), None);
        runtime.fields.insert("battery".into(), json!(76.4));
        assert_eq!(battery_percent(&runtime), Some(76));
        runtime
            .fields
            .insert("device".into(), json!({"battery": 41}));
        assert_eq!(battery_percent(&runtime), Some(76));
        runtime.fields.remove("battery");
        assert_eq!(battery_percent(&runtime), Some(41));
    }

    #[test]
    fn tray_signature_changes_with_connection_and_pause() {
        let mut s = Session {
            credentials: None,
            busy: false,
            login_error: None,
            prefs: Preferences::default(),
            runtime: RuntimeState::default(),
            worker: RuntimeClient::default(),
            config: std::env::temp_dir().join("buddy-tray-signature.json"),
        };
        let idle = tray_signature(&s);
        s.runtime.connection = Connection::Connected;
        let linked = tray_signature(&s);
        assert_ne!(idle, linked);
        assert!(linked.contains(connection_key(Connection::Connected)));
        s.runtime.paused = true;
        assert_ne!(linked, tray_signature(&s));
    }
}
