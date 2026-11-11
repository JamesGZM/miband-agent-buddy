//! Application operations shared by window commands and tray actions.
use crate::{
    domain::{Action, BuddyTheme, Credentials, Device, WAKE_HOLD_SECONDS, supported},
    persistence,
    protocol::{Connection, RuntimeCommand, RuntimeSettings, RuntimeState},
    state::Session,
    xiaomi,
};
use serde::Serialize;
use serde_json::{Value, json};
use std::sync::atomic::{AtomicU64, Ordering};

pub fn connect(s: &mut Session, index: usize) -> Result<(), String> {
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
    let theme = match s.prefs.themes.get(&d.addr).map(String::as_str) {
        Some("claude") => BuddyTheme::Claude,
        Some("deepseek") => BuddyTheme::Deepseek,
        _ => BuddyTheme::Chatgpt,
    };
    s.worker.send(RuntimeCommand::Connect {
        address: d.addr,
        key: d.key,
        settings: RuntimeSettings {
            buddy_theme: Some(theme),
            revision: s.prefs.revision,
            keep_screen: Some(s.prefs.keep_screen),
            wake_hold_ms: Some(u64::from(s.prefs.wake_hold_seconds) * 1000),
            activity_keep_awake: Some(s.prefs.activity_keep_awake),
            power_saving: Some(s.prefs.power_saving),
        },
    })
}
/// Themes beyond the original pair are rejected by older Buddy builds, so they need an advertised capability.
fn theme_supported(s: &Session, theme: BuddyTheme) -> Result<(), String> {
    if !matches!(theme, BuddyTheme::Deepseek) {
        return Ok(());
    }
    let advertised = s
        .runtime
        .ack
        .as_ref()
        .and_then(|a| a.fields.get("capabilities"))
        .and_then(|c| c.get("themes"))
        .and_then(Value::as_array)
        .is_some_and(|themes| themes.iter().any(|t| t == theme.as_str()));
    if advertised {
        Ok(())
    } else {
        Err("需要更新 Buddy 才能使用 DeepSeek 主題".into())
    }
}
pub fn disconnect(s: &mut Session) -> Result<(), String> {
    s.prefs.selected = None;
    save(s)?;
    s.worker.send(RuntimeCommand::Disconnect)
}
pub fn pause(s: &mut Session, value: bool) -> Result<(), String> {
    s.prefs.sync_enabled = !value;
    save(s)?;
    s.runtime.paused = value;
    // Keep the user's intent even when the worker is temporarily unavailable.
    let _ = s.worker.send(RuntimeCommand::Pause { value });
    Ok(())
}
pub fn save(s: &Session) -> Result<(), String> {
    persistence::save_preferences(&s.config, &s.prefs)
}

static OPERATIONS: AtomicU64 = AtomicU64::new(0);
fn operation_active(s: &Session) -> bool {
    s.runtime
        .fields
        .get("operation")
        .and_then(|o| o.get("status"))
        .and_then(Value::as_str)
        .is_some_and(|status| matches!(status, "waking" | "applying"))
}
fn band_operation_allowed(s: &Session) -> Result<(), String> {
    if operation_active(s) {
        return Err("請等待目前操作完成".into());
    }
    match s.runtime.connection {
        Connection::Connected | Connection::Waiting | Connection::Standby => Ok(()),
        Connection::Installing => Err("正在安裝 Buddy，請稍候".into()),
        _ => Err("請先連線手環".into()),
    }
}
/// The projection is updated before the worker replies so polling never sees a stale idle state.
fn start_operation(
    s: &mut Session,
    kind: &str,
    command: impl FnOnce(String) -> RuntimeCommand,
) -> Result<(), String> {
    let request = format!("op-{}", OPERATIONS.fetch_add(1, Ordering::Relaxed) + 1);
    s.worker.send(command(request.clone()))?;
    s.runtime.fields.insert(
        "operation".into(),
        json!({"id": request, "kind": kind, "status": "waking", "requestedAt": now_ms()}),
    );
    Ok(())
}
fn can_apply_to_band(s: &Session) -> bool {
    matches!(
        s.runtime.connection,
        Connection::Connected | Connection::Waiting | Connection::Standby
    )
}
fn save_band_setting(s: &mut Session, kind: &str, settings: RuntimeSettings) -> Result<(), String> {
    save(s)?;
    if can_apply_to_band(s) {
        start_operation(s, kind, |request| RuntimeCommand::Configure {
            settings,
            request: Some(request),
        })
    } else {
        // Store intent while unavailable; reconnect/resume applies the saved settings.
        let _ = s.worker.send(RuntimeCommand::Configure {
            settings,
            request: None,
        });
        Ok(())
    }
}
fn setting_operation_allowed(s: &Session) -> Result<(), String> {
    if operation_active(s) {
        Err("請等待目前操作完成".into())
    } else {
        Ok(())
    }
}
fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
/// Keeps a just-sent request visible until the worker reports it, bounded for a lost command.
fn carry_requested_operation(previous: &RuntimeState, next: &mut RuntimeState) {
    let Some(local) = previous.fields.get("operation") else {
        return;
    };
    let Some(requested_at) = local.get("requestedAt").and_then(Value::as_u64) else {
        return;
    };
    let reported = next.fields.get("operation").and_then(|o| o.get("id"));
    if reported != local.get("id") && now_ms().saturating_sub(requested_at) < 5000 {
        next.fields.insert("operation".into(), local.clone());
    }
}

pub fn perform(s: &mut Session, action: Action) -> Result<(), String> {
    if s.busy {
        return Err("請等待目前操作完成".into());
    }
    match action {
        Action::Connect(index) => connect(s, index),
        Action::Disconnect => disconnect(s),
        Action::Pause(value) => pause(s, value),
        Action::Install => s.worker.send(RuntimeCommand::Install),
        Action::Logout => {
            s.worker.send(RuntimeCommand::Disconnect)?;
            persistence::delete_credentials(&s.config)?;
            s.credentials = None;
            s.prefs.selected = None;
            s.prefs.themes.clear();
            save(s)
        }
        Action::Theme(theme) => {
            band_operation_allowed(s)?;
            if s.runtime
                .ack
                .as_ref()
                .is_some_and(|a| a.settings_revision.is_none())
            {
                return Err("請先更新 Buddy，舊版不支援主題設定".into());
            }
            theme_supported(s, theme)?;
            s.prefs.revision += 1;
            save(s)?;
            let revision = s.prefs.revision;
            start_operation(s, "theme", |request| RuntimeCommand::Configure {
                settings: RuntimeSettings {
                    buddy_theme: Some(theme),
                    revision,
                    keep_screen: None,
                    wake_hold_ms: None,
                    activity_keep_awake: None,
                    power_saving: None,
                },
                request: Some(request),
            })
        }
        Action::Page(page) => {
            if page > 1 {
                return Err("不支援的手環頁面".into());
            }
            band_operation_allowed(s)?;
            start_operation(s, "page", |request| RuntimeCommand::ShowPage {
                page,
                request,
            })
        }
        Action::Wake => {
            band_operation_allowed(s)?;
            start_operation(s, "wake", |request| RuntimeCommand::Wake { request })
        }
        Action::Preferences(value) => {
            if let Some(language) = &value.language {
                s.prefs.language = language.as_str().into();
            }
            let changed = s.prefs.update_local(
                value.app_theme.as_str(),
                value.appearance.as_str(),
                false,
                value.background,
            );
            // Serialize every preference write with its mutation on the blocking pool.
            // Saving a detached snapshot could overwrite a newer band preference.
            save(s)?;
            if changed {
                s.worker.send(RuntimeCommand::Configure {
                    settings: RuntimeSettings {
                        buddy_theme: None,
                        revision: s.prefs.revision,
                        keep_screen: Some(false),
                        wake_hold_ms: None,
                        activity_keep_awake: None,
                        power_saving: None,
                    },
                    request: None,
                })
            } else {
                Ok(())
            }
        }
        Action::Autostart(_) => Err("登入啟動設定需要桌面平台".into()),
        Action::CheckUpdate
        | Action::DownloadUpdate
        | Action::InstallUpdate
        | Action::OpenProject
        | Action::OpenRelease => Err("不支援的操作或設定".into()),
        Action::WakeHold(seconds) => {
            if !WAKE_HOLD_SECONDS.contains(&seconds) {
                return Err("亮屏時長需為 5 到 1800 秒的整數".into());
            }
            setting_operation_allowed(s)?;
            s.prefs.wake_hold_seconds = seconds;
            let settings = RuntimeSettings {
                buddy_theme: None,
                revision: s.prefs.revision,
                keep_screen: None,
                wake_hold_ms: Some(u64::from(seconds) * 1000),
                activity_keep_awake: None,
                power_saving: None,
            };
            save_band_setting(s, "wake_hold", settings)
        }
        Action::RefreshDevice => s.worker.send(RuntimeCommand::RefreshDevice),
        Action::CheckBuddy => {
            setting_operation_allowed(s)?;
            if can_apply_to_band(s) {
                start_operation(s, "check_buddy", |request| RuntimeCommand::CheckBuddy {
                    request: Some(request),
                })
            } else {
                s.worker.send(RuntimeCommand::CheckBuddy { request: None })
            }
        }
        Action::ActivityKeepAwake(enabled) => {
            setting_operation_allowed(s)?;
            s.prefs.activity_keep_awake = enabled;
            let settings = RuntimeSettings {
                buddy_theme: None,
                revision: s.prefs.revision,
                keep_screen: None,
                wake_hold_ms: None,
                activity_keep_awake: Some(enabled),
                power_saving: None,
            };
            save_band_setting(s, "activity_keep_awake", settings)
        }
        Action::ResetActivity => {
            setting_operation_allowed(s)?;
            if can_apply_to_band(s) {
                start_operation(s, "reset_activity", |request| {
                    RuntimeCommand::ResetActivity {
                        request: Some(request),
                    }
                })
            } else {
                s.worker
                    .send(RuntimeCommand::ResetActivity { request: None })
            }
        }
        Action::PowerSaving(enabled) => {
            setting_operation_allowed(s)?;
            s.prefs.power_saving = enabled;
            let settings = RuntimeSettings {
                buddy_theme: None,
                revision: s.prefs.revision,
                keep_screen: None,
                wake_hold_ms: None,
                activity_keep_awake: None,
                power_saving: Some(enabled),
            };
            save_band_setting(s, "power_saving", settings)
        }
    }
}
pub fn finish_login(
    s: &mut Session,
    result: (Vec<Device>, xiaomi::MiAccountToken),
    region: String,
) -> Result<(), String> {
    let (devices, token) = result;
    let credentials = Credentials {
        devices,
        token,
        region,
    };
    persistence::save_credentials(&s.config, &credentials)?;
    s.credentials = Some(credentials);
    s.prefs.selected = None;
    s.prefs.themes.clear();
    save(s)
}
pub fn accept_runtime(s: &mut Session, mut state: RuntimeState) {
    carry_requested_operation(&s.runtime, &mut state);
    if let (Some(index), Some(ack)) = (s.prefs.selected, state.ack.as_ref()) {
        if ack.settings_revision == Some(s.prefs.revision) && ack.settings_applied == Some(true) {
            if let (Some(theme), Some(device)) = (
                ack.buddy_theme,
                s.credentials.as_ref().and_then(|c| c.devices.get(index)),
            ) {
                let addr = device.addr.clone();
                if s.prefs.themes.get(&addr).map(String::as_str) != Some(theme.as_str()) {
                    s.prefs.themes.insert(addr, theme.as_str().into());
                    let _ = save(s);
                }
            }
        }
    }
    s.runtime = state;
}

#[derive(Serialize)]
pub struct DeviceView {
    index: usize,
    name: String,
    address: String,
    supported: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesView<'a> {
    app_theme: &'a str,
    buddy_theme: Option<&'a str>,
    appearance: &'a str,
    keep_screen: bool,
    activity_keep_awake: bool,
    power_saving: bool,
    sync_enabled: bool,
    background: bool,
    selected: Option<usize>,
    wake_hold_seconds: u32,
    language: &'a str,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppView<'a> {
    logged_in: bool,
    login_error: &'a Option<String>,
    region: Option<&'a str>,
    devices: Vec<DeviceView>,
    busy: bool,
    preferences: PreferencesView<'a>,
    autostart: bool,
    runtime: &'a RuntimeState,
}
pub fn view(s: &Session, autostart: bool) -> AppView<'_> {
    let devices = s
        .credentials
        .as_ref()
        .map(|c| {
            c.devices
                .iter()
                .enumerate()
                .map(|(index, d)| DeviceView {
                    index,
                    name: d.name.clone(),
                    address: format!(
                        "••:••:••:••:{}",
                        d.addr.split(':').skip(4).collect::<Vec<_>>().join(":")
                    ),
                    supported: supported(d),
                })
                .collect()
        })
        .unwrap_or_default();
    AppView {
        logged_in: s.credentials.is_some(),
        login_error: &s.login_error,
        region: s.credentials.as_ref().map(|c| c.region.as_str()),
        devices,
        busy: s.busy,
        preferences: PreferencesView {
            app_theme: &s.prefs.app_theme,
            buddy_theme: s
                .prefs
                .selected
                .and_then(|index| s.credentials.as_ref()?.devices.get(index))
                .and_then(|device| s.prefs.themes.get(&device.addr))
                .map(String::as_str),
            appearance: &s.prefs.appearance,
            keep_screen: s.prefs.keep_screen,
            activity_keep_awake: s.prefs.activity_keep_awake,
            power_saving: s.prefs.power_saving,
            sync_enabled: s.prefs.sync_enabled,
            background: s.prefs.background,
            selected: s.prefs.selected,
            wake_hold_seconds: s.prefs.wake_hold_seconds,
            language: &s.prefs.language,
        },
        autostart,
        runtime: &s.runtime,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{domain::Preferences, protocol::BandAck, runtime::RuntimeClient};
    fn session() -> Session {
        let token = serde_json::from_value(serde_json::json!({"ssecurity":"fixture-token","service_token":"fixture-token","c_user_id":"fixture-user"})).unwrap();
        let config = std::env::temp_dir()
            .join(format!(
                "buddy-services-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ))
            .join("preferences.json");
        Session {
            credentials: Some(Credentials {
                devices: vec![Device {
                    name: "Xiaomi Band 9".into(),
                    addr: "11:22:33:44:55:66".into(),
                    key: "0".repeat(32),
                }],
                region: "sg".into(),
                token,
            }),
            busy: false,
            login_error: None,
            prefs: Preferences {
                selected: Some(0),
                revision: 2,
                ..Default::default()
            },
            runtime: Default::default(),
            worker: RuntimeClient::default(),
            config,
        }
    }
    #[test]
    fn ui_projection_excludes_private_credentials() {
        let s = session();
        let output = serde_json::to_string(&view(&s, false)).unwrap();
        for secret in ["fixture-token", "11:22:33:44:55:66", &"0".repeat(32)] {
            assert!(!output.contains(secret));
        }
        assert!(output.contains("55:66"));
    }
    #[test]
    fn ui_projection_restores_only_the_selected_devices_saved_theme() {
        let mut s = session();
        s.prefs
            .themes
            .insert("11:22:33:44:55:66".into(), "claude".into());
        let output = serde_json::to_value(view(&s, false)).unwrap();
        assert_eq!(output["preferences"]["buddyTheme"], "claude");
        assert!(output["runtime"]["ack"].is_null());
        s.prefs.selected = None;
        assert!(
            serde_json::to_value(view(&s, false)).unwrap()["preferences"]["buddyTheme"].is_null()
        );
        s.prefs.selected = Some(99);
        assert!(
            serde_json::to_value(view(&s, false)).unwrap()["preferences"]["buddyTheme"].is_null()
        );
    }
    #[test]
    fn only_durable_current_revision_ack_updates_device_theme() {
        let mut s = session();
        let state = |revision, applied| RuntimeState {
            ack: Some(BandAck {
                buddy_theme: Some(BuddyTheme::Claude),
                settings_revision: Some(revision),
                settings_applied: Some(applied),
                ..Default::default()
            }),
            ..Default::default()
        };
        accept_runtime(&mut s, state(1, true));
        assert!(s.prefs.themes.is_empty());
        accept_runtime(&mut s, state(2, false));
        assert!(s.prefs.themes.is_empty());
        accept_runtime(&mut s, state(2, true));
        assert_eq!(s.prefs.themes["11:22:33:44:55:66"], "claude");
        std::fs::remove_dir_all(s.config.parent().unwrap()).unwrap();
    }
    #[test]
    fn band_operations_are_allowed_while_sleeping_but_never_overlap() {
        let mut s = session();
        s.runtime.connection = Connection::Disconnected;
        assert_eq!(perform(&mut s, Action::Wake).unwrap_err(), "請先連線手環");
        for connection in [
            Connection::Standby,
            Connection::Waiting,
            Connection::Connected,
        ] {
            s.runtime.connection = connection;
            // The fixture has no worker, so reaching the send proves the state gate passed.
            assert_eq!(
                perform(&mut s, Action::Page(1)).unwrap_err(),
                "背景程序未啟動，請重新開啟 App"
            );
        }
        assert_eq!(
            perform(&mut s, Action::Page(2)).unwrap_err(),
            "不支援的手環頁面"
        );
        s.runtime
            .fields
            .insert("operation".into(), json!({"id":"op-9","status":"applying"}));
        let revision = s.prefs.revision;
        assert_eq!(
            perform(&mut s, Action::Theme(BuddyTheme::Claude)).unwrap_err(),
            "請等待目前操作完成"
        );
        assert_eq!(s.prefs.revision, revision);
    }
    #[test]
    fn requested_operation_survives_an_older_worker_frame() {
        let mut s = session();
        s.runtime.fields.insert(
            "operation".into(),
            json!({"id":"op-1","status":"waking","requestedAt":now_ms()}),
        );
        accept_runtime(&mut s, RuntimeState::default());
        assert_eq!(s.runtime.fields["operation"]["id"], "op-1");
        let mut reported = RuntimeState::default();
        reported
            .fields
            .insert("operation".into(), json!({"id":"op-1","status":"done"}));
        accept_runtime(&mut s, reported);
        assert_eq!(s.runtime.fields["operation"]["status"], "done");
    }
    #[test]
    fn wake_hold_is_validated_and_persisted() {
        let mut s = session();
        for bad in [0, 4, 1801] {
            assert!(perform(&mut s, Action::WakeHold(bad)).is_err());
        }
        assert_eq!(s.prefs.wake_hold_seconds, 20);
        perform(&mut s, Action::WakeHold(300)).unwrap();
        let saved: Preferences =
            serde_json::from_str(&std::fs::read_to_string(&s.config).unwrap()).unwrap();
        assert_eq!(saved.wake_hold_seconds, 300);
        std::fs::remove_dir_all(s.config.parent().unwrap()).unwrap();
    }
    #[test]
    fn activity_keep_awake_is_opt_in_persisted_and_projected() {
        let mut s = session();
        assert!(!s.prefs.activity_keep_awake);
        assert_eq!(
            serde_json::to_value(view(&s, false)).unwrap()["preferences"]["activityKeepAwake"],
            false
        );
        for enabled in [true, false] {
            perform(&mut s, Action::ActivityKeepAwake(enabled)).unwrap();
            let (saved, _, _) = persistence::load(&s.config);
            assert_eq!(saved.activity_keep_awake, enabled);
            assert_eq!(
                serde_json::to_value(view(&s, false)).unwrap()["preferences"]["activityKeepAwake"],
                enabled
            );
            assert_eq!(saved.revision, 2);
            assert_eq!(saved.wake_hold_seconds, 20);
        }
        std::fs::remove_dir_all(s.config.parent().unwrap()).unwrap();
    }
    #[test]
    fn power_saving_is_opt_in_persisted_and_projected() {
        let mut s = session();
        assert!(!s.prefs.power_saving);
        assert_eq!(
            serde_json::to_value(view(&s, false)).unwrap()["preferences"]["powerSaving"],
            false
        );
        for enabled in [true, false] {
            perform(&mut s, Action::PowerSaving(enabled)).unwrap();
            let (saved, _, _) = persistence::load(&s.config);
            assert_eq!(saved.power_saving, enabled);
            assert_eq!(
                serde_json::to_value(view(&s, false)).unwrap()["preferences"]["powerSaving"],
                enabled
            );
            assert_eq!(saved.revision, 2);
            assert!(!saved.activity_keep_awake);
        }
        std::fs::remove_dir_all(s.config.parent().unwrap()).unwrap();
    }
    #[test]
    fn activity_sync_choice_survives_restart_without_a_running_worker() {
        let mut s = session();
        assert!(s.prefs.sync_enabled);
        for paused in [true, false] {
            perform(&mut s, Action::Pause(paused)).unwrap();
            let (saved, _, _) = persistence::load(&s.config);
            assert_eq!(saved.sync_enabled, !paused);
            assert_eq!(
                serde_json::to_value(view(&s, false)).unwrap()["preferences"]["syncEnabled"],
                !paused
            );
            assert_eq!(s.runtime.paused, paused);
            assert_eq!(saved.revision, 2);
        }
        std::fs::remove_dir_all(s.config.parent().unwrap()).unwrap();
    }
    #[test]
    fn local_preferences_save_with_the_mutation_and_preserve_band_choices() {
        let mut s = session();
        let appearance = |language| {
            serde_json::from_value::<Action>(json!({
            "operation":"preferences", "value":{"appTheme":"claude", "appearance":"dark", "background":true, "language":language}
        })).unwrap()
        };
        perform(&mut s, appearance("en")).unwrap();
        assert_eq!(persistence::load(&s.config).0.language, "en");
        perform(&mut s, Action::ActivityKeepAwake(true)).unwrap();
        perform(&mut s, Action::PowerSaving(true)).unwrap();
        perform(&mut s, Action::Pause(true)).unwrap();
        perform(&mut s, appearance("zh-Hant")).unwrap();
        let saved = persistence::load(&s.config).0;
        assert!(saved.activity_keep_awake);
        assert!(saved.power_saving);
        assert!(!saved.sync_enabled);
        assert_eq!(saved.language, "zh-Hant");
        assert_eq!(saved.appearance, "dark");
        std::fs::remove_dir_all(s.config.parent().unwrap()).unwrap();
    }
    #[test]
    fn manual_band_settings_are_allowed_while_sync_is_paused_but_do_not_overlap() {
        let mut s = session();
        s.runtime.connection = Connection::Standby;
        s.runtime.paused = true;
        assert!(can_apply_to_band(&s));
        // Reaching send proves pause did not gate the explicit operation.
        assert_eq!(
            perform(&mut s, Action::PowerSaving(true)).unwrap_err(),
            "背景程序未啟動，請重新開啟 App"
        );
        assert!(persistence::load(&s.config).0.power_saving);
        s.runtime
            .fields
            .insert("operation".into(), json!({"id":"op-9","status":"applying"}));
        assert_eq!(
            perform(&mut s, Action::ActivityKeepAwake(true)).unwrap_err(),
            "請等待目前操作完成"
        );
        assert!(!s.prefs.activity_keep_awake);
        std::fs::remove_dir_all(s.config.parent().unwrap()).unwrap();
    }
    #[test]
    fn deepseek_requires_an_advertised_band_capability() {
        let mut s = session();
        s.runtime.connection = Connection::Connected;
        let ack = |fields: serde_json::Value| BandAck {
            settings_revision: Some(2),
            fields: serde_json::from_value(fields).unwrap(),
            ..Default::default()
        };
        s.runtime.ack = Some(ack(json!({})));
        assert_eq!(
            perform(&mut s, Action::Theme(BuddyTheme::Deepseek)).unwrap_err(),
            "需要更新 Buddy 才能使用 DeepSeek 主題"
        );
        assert_eq!(s.prefs.revision, 2);
        s.runtime.ack = Some(ack(
            json!({"capabilities":{"themes":["chatgpt","claude","deepseek"]}}),
        ));
        assert_eq!(
            perform(&mut s, Action::Theme(BuddyTheme::Deepseek)).unwrap_err(),
            "背景程序未啟動，請重新開啟 App"
        );
    }
}
