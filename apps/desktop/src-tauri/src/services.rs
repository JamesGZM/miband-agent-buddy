//! Application operations shared by window commands and tray actions.
use crate::{
    domain::{Action, BuddyTheme, Credentials, Device, supported},
    persistence,
    protocol::{Connection, RuntimeCommand, RuntimeSettings, RuntimeState},
    state::Session,
    xiaomi,
};
use serde::Serialize;

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
        _ => BuddyTheme::Chatgpt,
    };
    s.worker.send(RuntimeCommand::Connect {
        address: d.addr,
        key: d.key,
        settings: RuntimeSettings {
            buddy_theme: Some(theme),
            revision: s.prefs.revision,
            keep_screen: Some(s.prefs.keep_screen),
        },
    })
}
pub fn disconnect(s: &mut Session) -> Result<(), String> {
    s.prefs.selected = None;
    save(s)?;
    s.worker.send(RuntimeCommand::Disconnect)
}
pub fn pause(s: &mut Session, value: bool) -> Result<(), String> {
    s.worker.send(RuntimeCommand::Pause { value })
}
pub fn save(s: &Session) -> Result<(), String> {
    persistence::save_preferences(&s.config, &s.prefs)
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
            if s.runtime.connection != Connection::Connected {
                return Err("請先連線並在手環打開 Buddy".into());
            }
            if s.runtime
                .ack
                .as_ref()
                .and_then(|a| a.settings_revision)
                .is_none()
            {
                return Err("請先更新 Buddy，舊版不支援主題設定".into());
            }
            s.prefs.revision += 1;
            save(s)?;
            s.worker.send(RuntimeCommand::Configure {
                settings: RuntimeSettings {
                    buddy_theme: Some(theme),
                    revision: s.prefs.revision,
                    keep_screen: None,
                },
            })
        }
        Action::Preferences(value) => {
            let changed = s.prefs.update_local(
                value.app_theme.as_str(),
                value.appearance.as_str(),
                false,
                value.background,
            );
            save(s)?;
            if changed {
                s.worker.send(RuntimeCommand::Configure {
                    settings: RuntimeSettings {
                        buddy_theme: None,
                        revision: s.prefs.revision,
                        keep_screen: Some(false),
                    },
                })
            } else {
                Ok(())
            }
        }
        Action::Autostart(_) => Err("登入啟動設定需要桌面平台".into()),
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
pub fn accept_runtime(s: &mut Session, state: RuntimeState) {
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
    appearance: &'a str,
    keep_screen: bool,
    background: bool,
    selected: Option<usize>,
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
            appearance: &s.prefs.appearance,
            keep_screen: s.prefs.keep_screen,
            background: s.prefs.background,
            selected: s.prefs.selected,
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
}
