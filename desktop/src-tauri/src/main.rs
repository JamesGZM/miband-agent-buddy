mod account;
mod net;
mod vault;
#[allow(dead_code)]
#[path = "vendor/xiaomi.rs"]
mod xiaomi;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{Arc, Mutex},
};
use tauri::{Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use tauri_plugin_autostart::ManagerExt;
const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

#[derive(Clone, Serialize, Deserialize)]
struct Device {
    name: String,
    addr: String,
    key: String,
}
#[derive(Clone, Serialize, Deserialize)]
struct Credentials {
    devices: Vec<Device>,
    region: String,
    token: xiaomi::MiAccountToken,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
struct Preferences {
    app_theme: String,
    appearance: String,
    keep_screen: bool,
    background: bool,
    selected: Option<usize>,
    themes: HashMap<String, String>,
    revision: u64,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            app_theme: "claude".into(),
            appearance: "system".into(),
            keep_screen: true,
            background: true,
            selected: None,
            themes: HashMap::new(),
            revision: 0,
        }
    }
}
struct Session {
    credentials: Option<Credentials>,
    busy: bool,
    login_error: Option<String>,
    prefs: Preferences,
    runtime: Value,
    child: Option<Child>,
    input: Option<ChildStdin>,
    config: std::path::PathBuf,
}
type Shared = Arc<Mutex<Session>>;
fn local(w: &WebviewWindow) -> Result<(), String> {
    if w.label() != "main" {
        Err("此操作僅限本機視窗".into())
    } else {
        Ok(())
    }
}
fn valid_key(key: &str) -> bool {
    key.len() == 32 && key.bytes().all(|c| c.is_ascii_hexdigit())
}
fn supported(d: &Device) -> bool {
    let n = d.name.to_lowercase();
    valid_key(&d.key)
        && (n.contains("手环9")
            || n.contains("手環9")
            || n.contains("band 9")
            || n.contains("band9"))
        && !n.contains("pro")
        && !n.contains("active")
}
fn send(s: &mut Session, v: Value) -> Result<(), String> {
    let input = s.input.as_mut().ok_or("背景程序未啟動，請重新開啟 App")?;
    writeln!(input, "{}", v).map_err(|_| "背景程序已停止".into())
}
fn save(s: &Session) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(&s.prefs).map_err(|_| "設定編碼失敗")?;
    vault::write(&s.config, &bytes)
}
fn connect(s: &mut Session, index: usize) -> Result<(), String> {
    let d = s
        .credentials
        .as_ref()
        .and_then(|c| c.devices.get(index))
        .cloned()
        .ok_or("請先選擇手環")?;
    if !supported(&d) {
        return Err("首版僅支援小米手環 9 普通版與 NFC 版".into());
    }
    s.prefs.selected = Some(index);
    s.prefs.revision += 1;
    save(s)?;
    let theme = s
        .prefs
        .themes
        .get(&d.addr)
        .cloned()
        .unwrap_or("chatgpt".into());
    send(
        s,
        json!({"op":"connect","address":d.addr,"key":d.key,"settings":{"buddyTheme":theme,"revision":s.prefs.revision,"keepScreen":s.prefs.keep_screen}}),
    )
}
#[tauri::command]
fn get_state(
    window: WebviewWindow,
    state: State<Shared>,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    local(&window)?;
    let s = state.lock().map_err(|_| "狀態不可用")?;
    let devices:Vec<Value>=s.credentials.as_ref().map(|c|c.devices.iter().enumerate().map(|(index,d)|json!({"index":index,"name":d.name,"address":format!("••:••:••:••:{}",d.addr.split(':').skip(4).collect::<Vec<_>>().join(":")),"supported":supported(d)})).collect()).unwrap_or_default();
    Ok(
        json!({"loggedIn":s.credentials.is_some(),"loginError":s.login_error,"region":s.credentials.as_ref().map(|c|&c.region),"devices":devices,"busy":s.busy,"preferences":{"appTheme":s.prefs.app_theme,"appearance":s.prefs.appearance,"keepScreen":s.prefs.keep_screen,"background":s.prefs.background,"selected":s.prefs.selected},"autostart":app.autolaunch().is_enabled().unwrap_or(false),"runtime":s.runtime}),
    )
}
#[tauri::command]
async fn open_login(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, Shared>,
    region: String,
) -> Result<(), String> {
    local(&window)?;
    if !["cn", "sg", "de", "us", "ru", "i2"].contains(&region.as_str()) {
        return Err("服務地區無效".into());
    }
    {
        let s = state.lock().map_err(|_| "狀態不可用")?;
        if s.busy {
            return Err("請等待目前操作完成".into());
        }
        if s.credentials.is_some() {
            return Err("切換帳號前請先登出目前帳號".into());
        }
    }
    if let Some(w) = app.get_webview_window("xiaomi-login") {
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        "xiaomi-login",
        WebviewUrl::External(
            "https://account.xiaomi.com/pass/serviceLogin?sid=miothealth"
                .parse()
                .unwrap(),
        ),
    )
    .title("登入小米帳號 · account.xiaomi.com")
    .inner_size(480.0, 720.0)
    .incognito(true)
    .user_agent(UA)
    .on_navigation(net::trusted)
    .on_page_load(move |webview, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished)
            && payload.url().host_str() == Some("sts-hlth.io.mi.com")
            && payload.url().path() == "/healthapp/sts"
        {
            let app = webview.app_handle().clone();
            let shared = app.state::<Shared>().inner().clone();
            let region = region.clone();
            let _ = webview.hide();
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
            tauri::async_runtime::spawn(async move {
                if let Err(error) = complete_login(app.clone(), shared.clone(), region).await {
                    shared.lock().unwrap().login_error = Some(error);
                    if let Some(w) = app.get_webview_window("xiaomi-login") {
                        let _ = w.destroy();
                    }
                }
            });
        }
    })
    .build()
    .map_err(|_| "無法開啟官方登入視窗")?;
    Ok(())
}
#[tauri::command]
async fn finish_login(
    app: tauri::AppHandle,
    window: WebviewWindow,
    state: State<'_, Shared>,
    region: String,
) -> Result<(), String> {
    local(&window)?;
    complete_login(app, state.inner().clone(), region).await
}
async fn complete_login(
    app: tauri::AppHandle,
    state: Shared,
    region: String,
) -> Result<(), String> {
    if !["cn", "sg", "de", "us", "ru", "i2"].contains(&region.as_str()) {
        return Err("不支援的服務地區".into());
    }
    {
        let mut s = state.lock().map_err(|_| "狀態不可用")?;
        if s.busy || s.credentials.is_some() {
            return Err("請先完成目前操作或登出".into());
        }
        s.busy = true;
        s.login_error = None;
    }
    let result = account::fetch_devices(&app, &region).await;
    let mut s = state.lock().map_err(|_| "狀態不可用")?;
    s.busy = false;
    let (devices, token) = result?;
    let credentials = Credentials {
        devices,
        token,
        region,
    };
    let bytes = serde_json::to_vec(&credentials).map_err(|_| "認證編碼失敗")?;
    vault::write(&s.config.with_file_name("credentials.json"), &bytes)?;
    s.credentials = Some(credentials);
    s.prefs.selected = None;
    s.prefs.themes.clear();
    save(&s)?;
    if let Some(w) = app.get_webview_window("xiaomi-login") {
        let _ = w.destroy();
    }
    Ok(())
}
#[tauri::command]
fn action(
    window: WebviewWindow,
    state: State<Shared>,
    app: tauri::AppHandle,
    operation: String,
    value: Value,
) -> Result<(), String> {
    local(&window)?;
    let mut s = state.lock().map_err(|_| "狀態不可用")?;
    if s.busy {
        return Err("請等待目前操作完成".into());
    }
    match operation.as_str() {
        "connect" => connect(&mut s, value.as_u64().ok_or("裝置選擇無效")? as usize),
        "disconnect" => {
            s.prefs.selected = None;
            save(&s)?;
            send(&mut s, json!({"op":"disconnect"}))
        }
        "pause" => send(
            &mut s,
            json!({"op":"pause","value":value.as_bool().ok_or("無效設定")?}),
        ),
        "install" => send(&mut s, json!({"op":"install"})),
        "logout" => {
            send(&mut s, json!({"op":"disconnect"}))?;
            vault::delete(&s.config.with_file_name("credentials.json"))?;
            s.credentials = None;
            s.prefs.selected = None;
            s.prefs.themes.clear();
            save(&s)?;
            if let Some(w) = app.get_webview_window("xiaomi-login") {
                let _ = w.destroy();
            }
            Ok(())
        }
        "theme" => {
            let theme = value
                .as_str()
                .filter(|v| ["chatgpt", "claude"].contains(v))
                .ok_or("不支援的 Buddy 主題")?;
            if s.runtime["connection"] != "connected" {
                return Err("請先連線並在手環打開 Buddy".into());
            }
            if s.runtime["ack"]["settingsRevision"].is_null() {
                return Err("請先更新 Buddy，舊版不支援主題設定".into());
            }
            s.prefs.revision += 1;
            let rev = s.prefs.revision;
            save(&s)?;
            send(
                &mut s,
                json!({"op":"configure","settings":{"buddyTheme":theme,"revision":rev}}),
            )
        }
        "preferences" => {
            let theme = value["appTheme"]
                .as_str()
                .filter(|v| ["claude", "chatgpt", "deepseek"].contains(v))
                .ok_or("外觀主題無效")?;
            let appearance = value["appearance"]
                .as_str()
                .filter(|v| ["light", "dark", "system"].contains(v))
                .ok_or("顯示模式無效")?;
            let keep = value["keepScreen"].as_bool().ok_or("亮屏設定無效")?;
            let background = value["background"].as_bool().ok_or("背景設定無效")?;
            s.prefs.app_theme = theme.into();
            s.prefs.appearance = appearance.into();
            s.prefs.keep_screen = keep;
            s.prefs.background = background;
            s.prefs.revision += 1;
            save(&s)?;
            let rev = s.prefs.revision;
            send(
                &mut s,
                json!({"op":"configure","settings":{"keepScreen":keep,"revision":rev}}),
            )
        }
        "autostart" => {
            let enabled = value.as_bool().ok_or("設定無效")?;
            if enabled {
                app.autolaunch().enable()
            } else {
                app.autolaunch().disable()
            }
            .map_err(|_| "無法更改登入啟動設定".into())
        }
        _ => Err("不支援的操作".into()),
    }
}
fn start_runtime(shared: Shared) {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap();
    let node = option_env!("BUDDY_NODE").unwrap_or("node");
    let child = Command::new(node)
        .arg(root.join("mac/buddy-runtime.mjs"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();
    match child {
        Ok(mut child) => {
            let output = child.stdout.take().unwrap();
            let input = child.stdin.take().unwrap();
            {
                let mut s = shared.lock().unwrap();
                s.child = Some(child);
                s.input = Some(input);
            }
            let reader_state = shared.clone();
            std::thread::spawn(move || {
                let mut last_health =
                    std::time::Instant::now() - std::time::Duration::from_secs(10);
                for line in BufReader::new(output).lines() {
                    let Ok(line) = line else {
                        break;
                    };
                    if line.len() > 65536 {
                        continue;
                    }
                    if let Ok(v) = serde_json::from_str::<Value>(&line) {
                        let mut s = reader_state.lock().unwrap();
                        if v["event"] == "state" {
                            let ack = &v["ack"];
                            if let (Some(index), Some(theme), Some(rev)) = (
                                s.prefs.selected,
                                ack["buddyTheme"].as_str(),
                                ack["settingsRevision"].as_u64(),
                            ) {
                                if rev == s.prefs.revision
                                    && ["chatgpt", "claude"].contains(&theme)
                                    && ack["settingsApplied"] == true
                                {
                                    if let Some(addr) = s
                                        .credentials
                                        .as_ref()
                                        .and_then(|c| c.devices.get(index))
                                        .map(|d| d.addr.clone())
                                    {
                                        if s.prefs.themes.get(&addr).map(String::as_str)
                                            != Some(theme)
                                        {
                                            s.prefs.themes.insert(addr, theme.into());
                                            let _ = save(&s);
                                        }
                                    }
                                }
                            }
                            if last_health.elapsed().as_secs() >= 10 {
                                let health = json!({"connection":v["connection"],"installation":v["installation"],"operationError":v["operationError"],"progress":v["progress"],"lastAckAt":v["lastAckAt"],"battery":v["battery"],"version":ack["appVersion"],"received":ack["received"],"page":ack["page"],"buddyTheme":ack["buddyTheme"],"settingsRevision":ack["settingsRevision"],"settingsApplied":ack["settingsApplied"],"keepScreen":ack["keepScreen"],"keepDiagnostics":ack["keepDiagnostics"],"mode":ack["mode"]});
                                if let Ok(bytes) = serde_json::to_vec(&health) {
                                    let _ = vault::write(
                                        &s.config.with_file_name("health.json"),
                                        &bytes,
                                    );
                                }
                                last_health = std::time::Instant::now();
                            }
                            s.runtime = v;
                        }
                    }
                }
                let mut s = reader_state.lock().unwrap();
                s.input = None;
                s.runtime = json!({"connection":"error","error":"背景程序已停止，請重新開啟 App"});
            });
            let mut s = shared.lock().unwrap();
            if let Some(index) = s.prefs.selected {
                let _ = connect(&mut s, index);
            }
        }
        Err(_) => {
            shared.lock().unwrap().runtime =
                json!({"connection":"error","error":"無法啟動 Node 22，請依建置文件設定環境"});
        }
    }
}
fn main() {
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
            let prefs = std::fs::read(&config)
                .ok()
                .and_then(|b| serde_json::from_slice(&b).ok())
                .unwrap_or_default();
            let saved = vault::read(&directory.join("credentials.json"));
            let login_error = saved.as_ref().err().cloned();
            let credentials = saved
                .ok()
                .flatten()
                .and_then(|b| serde_json::from_slice(&b).ok());
            let shared = Arc::new(Mutex::new(Session {
                credentials,
                busy: false,
                login_error,
                prefs,
                runtime: json!({"connection":"disconnected"}),
                child: None,
                input: None,
                config,
            }));
            app.manage(shared.clone());
            start_runtime(shared);
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
                        s.prefs.selected = None;
                        let _ = save(&s);
                        let _ = send(&mut s, json!({"op":"disconnect"}));
                    }
                    if event.id.as_ref() == "pause" {
                        let paused = s.runtime["paused"].as_bool().unwrap_or(false);
                        let _ = send(&mut s, json!({"op":"pause","value":!paused}));
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
            get_state,
            open_login,
            finish_login,
            action
        ])
        .build(tauri::generate_context!())
        .expect("Unable to start MiBand Agent Buddy")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<Shared>();
                let mut s = state.lock().unwrap();
                s.input.take();
                if let Some(mut child) = s.child.take() {
                    for _ in 0..20 {
                        if child.try_wait().ok().flatten().is_some() {
                            return;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(50));
                    }
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_bad_keys_and_other_models() {
        assert!(!valid_key("secret"));
        assert!(!valid_key(&"z".repeat(32)));
        for name in ["小米手环9 Pro", "Xiaomi Band 9 Active", "小米手环8"] {
            assert!(!supported(&Device {
                name: name.into(),
                addr: String::new(),
                key: "0".repeat(32)
            }));
        }
        assert!(supported(&Device {
            name: "小米手环9 NFC版".into(),
            addr: String::new(),
            key: "0".repeat(32)
        }));
    }
    #[test]
    fn appearance_defaults_do_not_set_device_themes() {
        let p = Preferences::default();
        assert_eq!(p.app_theme, "claude");
        assert!(p.themes.is_empty());
        assert!(p.selected.is_none());
    }
}
