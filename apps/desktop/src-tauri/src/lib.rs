mod account;
mod app;
mod commands;
mod domain;
mod i18n;
mod login;
mod net;
mod persistence;
mod protocol;
mod runtime;
mod services;
mod state;
mod updater;
mod vault;
#[allow(dead_code)]
#[path = "vendor/xiaomi.rs"]
mod xiaomi;

pub fn run() {
    app::run();
}
