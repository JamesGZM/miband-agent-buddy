mod application;
mod connection;
mod error;
mod platform;
mod protocol;
mod session;
mod stdio;

// Reuse the pinned platform transports without Tauri or an AstroBox process.
#[allow(dead_code)]
#[path = "../upstream/btclassic-spp/src/models.rs"]
mod models;
#[allow(dead_code)]
#[cfg(target_os = "macos")]
#[path = "../upstream/btclassic-spp/src/macos/implementation.rs"]
mod spp;
#[allow(dead_code)]
#[cfg(target_os = "windows")]
#[path = "../upstream/btclassic-spp/src/win/implementation.rs"]
mod spp;
#[cfg(target_os = "windows")]
pub use models::SPPDevice;

fn main() {
    platform::run_main_loop();
}
