//! Owns the Node worker, stdio and sanitized health-file projection.
use crate::{
    protocol::{Connection, RuntimeCommand, RuntimeEvent, RuntimeState},
    services,
    state::Shared,
    vault,
};
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
};

#[derive(Default)]
pub struct RuntimeClient {
    child: Option<Child>,
    input: Option<ChildStdin>,
}
impl RuntimeClient {
    pub fn send(&mut self, command: RuntimeCommand) -> Result<(), String> {
        let input = self
            .input
            .as_mut()
            .ok_or("背景程序未啟動，請重新開啟 App")?;
        let frame = serde_json::to_string(&command).map_err(|_| "操作編碼失敗")?;
        writeln!(input, "{frame}").map_err(|_| "背景程序已停止".into())
    }
    pub fn shutdown(&mut self) {
        self.input.take();
        if let Some(mut child) = self.child.take() {
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
}
fn health(state: &RuntimeState) -> Value {
    let ack = state.ack.as_ref();
    let field = |name: &str| {
        ack.and_then(|a| a.fields.get(name))
            .cloned()
            .unwrap_or(Value::Null)
    };
    json!({"connection":state.connection,"wake":state.fields.get("wake"),"installation":state.installation,
        "operationError":state.fields.get("operationError"),"progress":state.progress,
        "lastAckAt":state.fields.get("lastAckAt"),"battery":state.fields.get("battery"),
        "version":field("appVersion"),"received":field("received"),"page":field("page"),
        "buddyTheme":ack.and_then(|a| a.buddy_theme),"settingsRevision":ack.and_then(|a| a.settings_revision),
        "settingsApplied":ack.and_then(|a| a.settings_applied),"keepScreen":field("keepScreen"),
        "keepDiagnostics":field("keepDiagnostics"),"mode":field("mode")})
}
pub fn start(shared: Shared, app: tauri::AppHandle) {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("workspace root");
    let node = option_env!("BUDDY_NODE").unwrap_or("node");
    let child = Command::new(node)
        .arg(root.join("services/runtime/bin/buddy-runtime.mjs"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn();
    match child {
        Ok(mut child) => {
            let output = child.stdout.take().expect("piped stdout");
            let input = child.stdin.take().expect("piped stdin");
            if let Ok(mut s) = shared.lock() {
                s.worker = RuntimeClient {
                    child: Some(child),
                    input: Some(input),
                };
            }
            let reader_state = shared.clone();
            let tray_app = app.clone();
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
                    if let Ok(RuntimeEvent::State(state)) = serde_json::from_str(&line) {
                        let Ok(mut s) = reader_state.lock() else {
                            break;
                        };
                        if last_health.elapsed().as_secs() >= 10 {
                            if let Ok(bytes) = serde_json::to_vec(&health(&state)) {
                                let _ =
                                    vault::write(&s.config.with_file_name("health.json"), &bytes);
                            }
                            last_health = std::time::Instant::now();
                        }
                        services::accept_runtime(&mut s, state);
                        drop(s);
                        crate::app::schedule_tray_refresh(&tray_app);
                    }
                }
                if let Ok(mut s) = reader_state.lock() {
                    s.worker.input = None;
                    s.runtime = RuntimeState {
                        connection: Connection::Error,
                        error: Some("背景程序已停止，請重新開啟 App".into()),
                        ..Default::default()
                    };
                }
                crate::app::schedule_tray_refresh(&tray_app);
            });
            if let Ok(mut s) = shared.lock() {
                if let Some(index) = s.prefs.selected {
                    let _ = services::connect(&mut s, index);
                }
            }
        }
        Err(_) => {
            if let Ok(mut s) = shared.lock() {
                s.runtime = RuntimeState {
                    connection: Connection::Error,
                    error: Some("無法啟動 Node 22，請依建置文件設定環境".into()),
                    ..Default::default()
                };
            }
        }
    }
}
