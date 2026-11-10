mod application;
mod connection;
mod error;
mod platform;
mod protocol;
mod session;
mod stdio;

// Reuse the upstream macOS transport without Tauri or an AstroBox process.
#[allow(dead_code)]
#[path = "../upstream/btclassic-spp/src/models.rs"]
mod models;
#[allow(dead_code)]
#[path = "../upstream/btclassic-spp/src/macos/implementation.rs"]
mod spp;

fn main() {
    platform::run_main_loop();
}
