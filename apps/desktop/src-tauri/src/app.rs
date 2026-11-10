use crate::{
    commands, i18n, persistence,
    protocol::{Connection, RuntimeState},
    runtime::{self, RuntimeClient},
    services,
    state::{Session, Shared},
};
use std::sync::{Arc, Mutex};
use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

pub struct TrayItems {
    status: MenuItem<tauri::Wry>,
    open: MenuItem<tauri::Wry>,
    wake: MenuItem<tauri::Wry>,
    pause: MenuItem<tauri::Wry>,
    disconnect: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
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

/// Relabels the tray after language or runtime state changes.
pub fn refresh_tray(app: &AppHandle) {
    let Some(items) = app.try_state::<TrayItems>() else {
        return;
    };
    let shared = app.state::<Shared>();
    let Ok(s) = shared.lock() else {
        return;
    };
    let labels = i18n::labels(i18n::current(&s.prefs.language));
    let ready = band_ready(s.runtime.connection);
    let _ = items.status.set_text(status_text(&s));
    let _ = items.open.set_text(labels.open);
    let _ = items.wake.set_text(labels.wake);
    let _ = items.wake.set_enabled(ready);
    let _ = items
        .pause
        .set_text(if s.runtime.paused {
            labels.resume
        } else {
            labels.pause
        });
    let _ = items.disconnect.set_text(labels.disconnect);
    let _ = items.disconnect.set_enabled(ready);
    let _ = items.quit.set_text(labels.quit);
}

/// Relabels the tray after the language preference changes.
pub fn apply_language(app: &AppHandle, _choice: &str) {
    refresh_tray(app);
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
                prefs,
                runtime: RuntimeState::default(),
                worker: RuntimeClient::default(),
                config,
            }));
            app.manage(shared.clone());
            let language = shared.lock().unwrap().prefs.language.clone();
            runtime::start(shared, app.handle().clone());
            let labels = i18n::labels(i18n::current(&language));
            let status = MenuItem::with_id(app, "status", labels.disconnected, false, None::<&str>)?;
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
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
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
                            refresh_tray(app);
                        }
                        "disconnect" => {
                            let state = app.state::<Shared>();
                            let mut s = state.lock().unwrap();
                            let _ = services::disconnect(&mut s);
                            drop(s);
                            refresh_tray(app);
                        }
                        "pause" => {
                            let state = app.state::<Shared>();
                            let mut s = state.lock().unwrap();
                            let paused = s.runtime.paused;
                            let _ = services::pause(&mut s, !paused);
                            drop(s);
                            refresh_tray(app);
                        }
                        _ => {}
                    }
                })
                .build(app)?;
            refresh_tray(app.handle());
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
    use super::{band_ready, battery_percent};
    use crate::protocol::{Connection, RuntimeState};
    use serde_json::json;

    #[test]
    fn band_ready_matches_operation_gate() {
        assert!(band_ready(Connection::Connected));
        assert!(band_ready(Connection::Standby));
        assert!(!band_ready(Connection::Disconnected));
        assert!(!band_ready(Connection::Installing));
    }

    #[test]
    fn battery_reads_top_level_or_device_field() {
        let mut runtime = RuntimeState::default();
        assert_eq!(battery_percent(&runtime), None);
        runtime.fields.insert("battery".into(), json!(76.4));
        assert_eq!(battery_percent(&runtime), Some(76));
        runtime.fields.insert("device".into(), json!({"battery": 41}));
        assert_eq!(battery_percent(&runtime), Some(76));
        runtime.fields.remove("battery");
        assert_eq!(battery_percent(&runtime), Some(41));
    }
}
