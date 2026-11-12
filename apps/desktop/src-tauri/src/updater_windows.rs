//! Windows preview installers are distributed manually, never through the Mac updater.
use serde_json::{Value, json};
use std::ptr;
use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};

#[derive(Default)]
pub struct UpdateCache;

pub fn view(_: &tauri::AppHandle) -> Value {
    json!({"status":"error","currentVersion":env!("CARGO_PKG_VERSION"),
        "latestVersion":null,"progress":0,"error":"platform_unsupported",
        "releaseUrl":null,"canInstall":false})
}
pub fn check(_: tauri::AppHandle) -> Result<(), String> {
    Err("platform_unsupported".into())
}
pub fn download(_: tauri::AppHandle) -> Result<(), String> {
    Err("platform_unsupported".into())
}
pub fn install(_: tauri::AppHandle) -> Result<(), String> {
    Err("platform_unsupported".into())
}

fn open(url: &'static str) -> Result<(), String> {
    let url = url.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let verb = [111, 112, 101, 110, 0]; // "open"; no shell or remote command arguments.
    let result = unsafe {
        ShellExecuteW(
            ptr::null_mut(),
            verb.as_ptr(),
            url.as_ptr(),
            ptr::null(),
            ptr::null(),
            SW_SHOWNORMAL,
        )
    };
    if result as isize > 32 {
        Ok(())
    } else {
        Err("open_failed".into())
    }
}
pub fn open_project() -> Result<(), String> {
    open("https://github.com/JamesGZM/miband-agent-buddy")
}
pub fn open_release(_: &tauri::AppHandle) -> Result<(), String> {
    open("https://github.com/JamesGZM/miband-agent-buddy/actions/workflows/windows.yml")
}
