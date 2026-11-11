use crate::xiaomi;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Clone, Serialize, Deserialize)]
pub struct Device {
    pub name: String,
    pub addr: String,
    pub key: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Credentials {
    pub devices: Vec<Device>,
    pub region: String,
    pub token: xiaomi::MiAccountToken,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct Preferences {
    pub app_theme: String,
    pub appearance: String,
    pub keep_screen: bool,
    pub activity_keep_awake: bool,
    pub power_saving: bool,
    pub sync_enabled: bool,
    pub background: bool,
    pub selected: Option<usize>,
    pub themes: HashMap<String, String>,
    pub revision: u64,
    pub wake_hold_seconds: u32,
    pub language: String,
}
pub const WAKE_HOLD_SECONDS: std::ops::RangeInclusive<u32> = 5..=1800;
impl Default for Preferences {
    fn default() -> Self {
        Self {
            app_theme: "claude".into(),
            appearance: "system".into(),
            keep_screen: false,
            activity_keep_awake: false,
            power_saving: false,
            sync_enabled: true,
            background: true,
            selected: None,
            themes: HashMap::new(),
            revision: 0,
            wake_hold_seconds: 20,
            language: "system".into(),
        }
    }
}
impl Preferences {
    pub fn update_local(
        &mut self,
        theme: &str,
        appearance: &str,
        keep: bool,
        background: bool,
    ) -> bool {
        let band_changed = self.keep_screen != keep;
        self.app_theme = theme.into();
        self.appearance = appearance.into();
        self.keep_screen = keep;
        self.background = background;
        if band_changed {
            self.revision += 1;
        }
        band_changed
    }
}
pub fn valid_key(key: &str) -> bool {
    key.len() == 32 && key.bytes().all(|c| c.is_ascii_hexdigit())
}
pub fn supported(d: &Device) -> bool {
    let n = d.name.to_lowercase();
    valid_key(&d.key)
        && (n.contains("手环9")
            || n.contains("手環9")
            || n.contains("band 9")
            || n.contains("band9"))
        && !n.contains("pro")
        && !n.contains("active")
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BuddyTheme {
    #[default]
    Chatgpt,
    Claude,
    Deepseek,
}
impl BuddyTheme {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Chatgpt => "chatgpt",
            Self::Claude => "claude",
            Self::Deepseek => "deepseek",
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppTheme {
    Claude,
    Chatgpt,
    Deepseek,
}
impl AppTheme {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Chatgpt => "chatgpt",
            Self::Deepseek => "deepseek",
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Appearance {
    System,
    Light,
    Dark,
}
impl Appearance {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::System => "system",
            Self::Light => "light",
            Self::Dark => "dark",
        }
    }
}
#[derive(Deserialize)]
pub enum Language {
    #[serde(rename = "system")]
    System,
    #[serde(rename = "zh-Hans")]
    ZhHans,
    #[serde(rename = "zh-Hant")]
    ZhHant,
    #[serde(rename = "en")]
    En,
}
impl Language {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::System => "system",
            Self::ZhHans => "zh-Hans",
            Self::ZhHant => "zh-Hant",
            Self::En => "en",
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesUpdate {
    pub app_theme: AppTheme,
    pub appearance: Appearance,
    pub background: bool,
    #[serde(default)]
    pub language: Option<Language>,
}
#[derive(Deserialize)]
#[serde(tag = "operation", content = "value", rename_all = "lowercase")]
pub enum Action {
    Connect(usize),
    Disconnect,
    Pause(bool),
    Install,
    Logout,
    Theme(BuddyTheme),
    Page(u8),
    Wake,
    Preferences(PreferencesUpdate),
    Autostart(bool),
    #[serde(rename = "wake_hold")]
    WakeHold(u32),
    #[serde(rename = "activity_keep_awake")]
    ActivityKeepAwake(bool),
    #[serde(rename = "power_saving")]
    PowerSaving(bool),
    #[serde(rename = "refresh_device")]
    RefreshDevice,
    #[serde(rename = "check_buddy")]
    CheckBuddy,
    #[serde(rename = "check_update")]
    CheckUpdate,
    #[serde(rename = "download_update")]
    DownloadUpdate,
    #[serde(rename = "install_update")]
    InstallUpdate,
    #[serde(rename = "open_project")]
    OpenProject,
    #[serde(rename = "open_release")]
    OpenRelease,
    #[serde(rename = "reset_activity")]
    ResetActivity,
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
    fn local_appearance_does_not_write_band_settings() {
        let mut p = Preferences::default();
        p.revision = 10;
        p.keep_screen = true; // Legacy preference migration is exercised below.
        p.themes.insert("test-device".into(), "claude".into());
        assert!(!p.update_local("deepseek", "dark", true, false));
        assert_eq!(p.revision, 10);
        assert_eq!(p.themes["test-device"], "claude");
        assert!(p.update_local("deepseek", "dark", false, false));
        assert_eq!(p.revision, 11);
        assert!(!p.update_local("chatgpt", "light", false, true));
        assert_eq!(p.revision, 11);
    }
    #[test]
    fn appearance_defaults_do_not_set_device_themes() {
        let p = Preferences::default();
        assert_eq!(p.app_theme, "claude");
        assert!(!p.keep_screen);
        assert!(!p.activity_keep_awake);
        assert!(!p.power_saving);
        assert!(p.sync_enabled);
        assert!(p.themes.is_empty());
        assert!(p.selected.is_none());
        assert_eq!(p.wake_hold_seconds, 20);
        let legacy: Preferences = serde_json::from_str(r#"{"revision":4}"#).unwrap();
        assert_eq!((legacy.revision, legacy.wake_hold_seconds), (4, 20));
        assert_eq!(legacy.language, "system");
        assert!(!legacy.activity_keep_awake);
        assert!(!legacy.power_saving);
        assert!(legacy.sync_enabled);
    }
}
