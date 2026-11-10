use crate::{
    commands, persistence,
    protocol::RuntimeState,
    runtime::{self, RuntimeClient},
    services,
    state::{Session, Shared},
};
use std::sync::{Arc, Mutex};
use tauri::Manager;

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
            runtime::start(shared);
            use tauri::{
                menu::{Menu, MenuItem},
                tray::TrayIconBuilder,
            };
            let open =
                MenuItem::with_id(app, "open", "開啟 MiBand Agent Buddy", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "暫停／恢復同步", true, None::<&str>)?;
            let disconnect = MenuItem::with_id(app, "disconnect", "中斷連線", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &pause, &disconnect, &quit])?;
            TrayIconBuilder::new()
                .title("Buddy")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "open" {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                        return;
                    }
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                        return;
                    }
                    let state = app.state::<Shared>();
                    let mut s = state.lock().unwrap();
                    if event.id.as_ref() == "disconnect" {
                        let _ = services::disconnect(&mut s);
                    }
                    if event.id.as_ref() == "pause" {
                        let paused = s.runtime.paused;
                        let _ = services::pause(&mut s, !paused);
                    }
                })
                .build(app)?;
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
