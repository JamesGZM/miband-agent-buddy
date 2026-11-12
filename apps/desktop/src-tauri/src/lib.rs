mod account;
mod app;
mod commands;
mod domain;
mod i18n;
mod login;
mod net;
mod notifications;
mod persistence;
mod protocol;
mod runtime;
mod services;
mod state;
#[cfg(target_os = "macos")]
mod updater;
#[cfg(windows)]
#[path = "updater_windows.rs"]
mod updater;
mod vault;
#[allow(dead_code)]
#[path = "vendor/xiaomi.rs"]
mod xiaomi;

pub fn run() {
    app::run();
}
