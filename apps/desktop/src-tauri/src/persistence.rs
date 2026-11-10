use crate::{
    domain::{Credentials, Preferences},
    vault,
};
use std::path::Path;

pub fn save_preferences(path: &Path, prefs: &Preferences) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(prefs).map_err(|_| "設定編碼失敗")?;
    vault::write(path, &bytes)
}
pub fn save_credentials(config: &Path, credentials: &Credentials) -> Result<(), String> {
    let bytes = serde_json::to_vec(credentials).map_err(|_| "認證編碼失敗")?;
    vault::write(&config.with_file_name("credentials.json"), &bytes)
}
pub fn delete_credentials(config: &Path) -> Result<(), String> {
    vault::delete(&config.with_file_name("credentials.json"))
}
pub fn load(config: &Path) -> (Preferences, Option<Credentials>, Option<String>) {
    let mut prefs: Preferences = std::fs::read(config)
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    prefs.keep_screen = false;
    let saved = vault::read(&config.with_file_name("credentials.json"));
    let error = saved.as_ref().err().cloned();
    let credentials = saved
        .ok()
        .flatten()
        .and_then(|b| serde_json::from_slice(&b).ok());
    (prefs, credentials, error)
}
