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
fn numeric_evidence(value: &Value, keys: &[&str]) -> Value {
    Value::Object(
        keys.iter()
            .filter_map(|key| {
                value
                    .get(*key)
                    .and_then(Value::as_u64)
                    .filter(|n| *n <= 9_007_199_254_740_991)
                    .map(|n| ((*key).to_string(), json!(n)))
            })
            .collect(),
    )
}
fn enum_evidence(value: &Value, key: &str, allowed: &[&str]) -> Value {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|s| allowed.contains(s))
        .map_or(Value::Null, |s| json!(s))
}
fn health(state: &RuntimeState) -> Value {
    let ack = state.ack.as_ref();
    let field = |name: &str| {
        ack.and_then(|a| a.fields.get(name))
            .cloned()
            .unwrap_or(Value::Null)
    };
    let operation = state
        .fields
        .get("operation")
        .and_then(Value::as_object)
        .map(|value| {
            [
                "id",
                "kind",
                "status",
                "code",
                "at",
                "settledAt",
                "wakeConfirmed",
            ]
            .iter()
            .filter_map(|key| {
                value
                    .get(*key)
                    .map(|value| ((*key).to_string(), value.clone()))
            })
            .collect::<serde_json::Map<String, Value>>()
        });
    let raw_diagnostics = state.fields.get("diagnostics").unwrap_or(&Value::Null);
    let mut diagnostics = numeric_evidence(
        raw_diagnostics,
        &[
            "starts",
            "closes",
            "launches",
            "snapshotWakes",
            "ackTimeouts",
            "pingTimeouts",
            "at",
        ],
    );
    diagnostics["phase"] = enum_evidence(
        raw_diagnostics,
        "phase",
        &[
            "idle",
            "stopped",
            "opening",
            "authenticating",
            "waiting_buddy",
            "connected",
            "connect_timeout",
            "link_alive",
            "link_failed",
            "native_error",
            "transport_closed",
            "link_timeout",
            "buddy_unresponsive",
        ],
    );
    diagnostics["lastCode"] = enum_evidence(
        raw_diagnostics,
        "lastCode",
        &[
            "connect_timeout",
            "ack_timeout",
            "ping_timeout",
            "ping_failed",
            "auth_rejected",
            "timeout",
            "operation_failed",
            "event_lagged",
            "event_closed",
            "transfer_session_reset",
            "transfer_send_timeout",
            "transfer_ack_timeout",
            "transfer",
            "app_missing",
            "app_query_failed",
            "app_sync_failed",
            "app_launch_failed",
            "bluetooth_open_failed",
            "bluetooth_link_closed",
        ],
    );
    diagnostics["exitCode"] = raw_diagnostics
        .get("exitCode")
        .and_then(Value::as_u64)
        .filter(|n| *n <= 255)
        .map_or(Value::Null, |n| json!(n));
    diagnostics["signal"] = enum_evidence(
        raw_diagnostics,
        "signal",
        &["SIGTERM", "SIGKILL", "SIGABRT", "SIGSEGV", "SIGBUS"],
    );
    let page_lifecycle = numeric_evidence(
        &field("pageLifecycle"),
        &[
            "createdAt",
            "created",
            "destroyed",
            "shows",
            "hides",
            "refreshes",
            "errors",
            "live",
            "visible",
        ],
    );
    let raw_drawing = field("drawing");
    let mut drawing = numeric_evidence(&raw_drawing, &["frames", "effectiveFps", "elapsedMs"]);
    let caps = raw_drawing.get("capabilities").unwrap_or(&Value::Null);
    drawing["renderer"] = enum_evidence(
        caps,
        "renderer",
        &["native-geometry", "native-border-probe", "native-border"],
    );
    drawing["animationEnabled"] = raw_drawing
        .get("animationEnabled")
        .and_then(Value::as_bool)
        .map_or(Value::Null, |v| json!(v));
    for key in [
        "queryAvailable",
        "div",
        "arc",
        "percent",
        "radius",
        "position",
        "canvas",
    ] {
        drawing[key] = caps
            .get(key)
            .and_then(Value::as_bool)
            .map_or(Value::Null, |v| json!(v));
    }
    let bounds: Vec<Value> = raw_drawing
        .get("bounds")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(3)
        .map(|row| {
            let mut safe = json!({
                "kind": enum_evidence(row, "kind", &["stage", "rects", "arcs", "capsules"]),
                "status": enum_evidence(row, "status", &["pending", "ok", "unavailable", "error", "invalid", "timeout"])
            });
            for name in ["expected", "actual"] {
                if let Some(rect) = row.get(name) {
                    let mut dimensions = json!({});
                    for key in ["left", "top", "width", "height"] {
                        dimensions[key] = rect.get(key).and_then(Value::as_f64)
                            .filter(|n| n.is_finite() && n.abs() <= 2000.0
                                && (matches!(key, "left" | "top") || *n >= 0.0))
                            .map_or(Value::Null, |n| json!(n));
                    }
                    safe[name] = dimensions;
                }
            }
            safe
        })
        .collect();
    drawing["bounds"] = json!(bounds);
    json!({"connection":state.connection,"wake":state.fields.get("wake"),"installation":state.installation,
        "operation":operation,"paused":state.paused,
        "powerSaving":field("powerSaving"),"buddyFps":field("buddyFps"),"wakeDisplay":field("wakeDisplay"),
        "desiredPowerSaving":state.fields.get("settings").and_then(|settings| settings.get("powerSaving")).and_then(Value::as_bool),
        "operationError":state.fields.get("operationError"),"progress":state.progress,
        "lastAckAt":state.fields.get("lastAckAt"),"battery":state.fields.get("battery"),
        "version":field("appVersion"),"received":field("received"),"page":field("page"),
        "buddyTheme":ack.and_then(|a| a.buddy_theme),"settingsRevision":ack.and_then(|a| a.settings_revision),
        "settingsApplied":ack.and_then(|a| a.settings_applied),"keepScreen":field("keepScreen"),
        "keepDiagnostics":field("keepDiagnostics"),"mode":field("mode"),
        "diagnostics":diagnostics,"pageLifecycle":page_lifecycle,"drawing":drawing})
}
pub fn start(shared: Shared, app: tauri::AppHandle) {
    let (root, node) = runtime_paths();
    let mut command = Command::new(&node);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW for the private stdio worker.
    }
    let child = command
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
                let mut last_battery_notice = 0;
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
                        let alert = state.fields.get("lowBattery");
                        let sequence = alert
                            .and_then(|v| v.get("sequence"))
                            .and_then(Value::as_u64)
                            .unwrap_or(0);
                        let notice = alert.and_then(|v| v.get("active")).and_then(Value::as_bool)
                            == Some(true)
                            && sequence > last_battery_notice;
                        let percent = state
                            .fields
                            .get("battery")
                            .and_then(Value::as_u64)
                            .filter(|n| *n < 20);
                        let language = crate::i18n::current(&s.prefs.language);
                        services::accept_runtime(&mut s, state);
                        drop(s);
                        if notice {
                            last_battery_notice = sequence;
                            if let Some(percent) = percent {
                                if crate::notifications::low_battery(&tray_app, language, percent)
                                    .is_err()
                                {
                                    if let Ok(mut s) = reader_state.lock() {
                                        s.runtime
                                            .fields
                                            .insert("batteryNotificationError".into(), json!(true));
                                    }
                                }
                            }
                        }
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
                // Commands are consumed in order: restore pause before auto-connect
                // can authenticate and request its initial Buddy launch.
                let paused = !s.prefs.sync_enabled;
                let _ = s.worker.send(RuntimeCommand::Pause { value: paused });
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

fn runtime_paths() -> (std::path::PathBuf, std::path::PathBuf) {
    // Release bundles retain the source layout inside Resources, so shared imports
    // and compatibility paths work after the .app is moved to another Mac.
    if let Ok(executable) = std::env::current_exe() {
        #[cfg(target_os = "macos")]
        if let Some(contents) = executable.parent().and_then(|p| p.parent()) {
            let root = contents.join("Resources/runtime");
            let node = root.join("bin/node");
            if node.is_file()
                && root
                    .join("services/runtime/bin/buddy-runtime.mjs")
                    .is_file()
            {
                return (root, node);
            }
        }
        #[cfg(windows)]
        if let Some(directory) = executable.parent() {
            let root = directory.join("runtime");
            let node = root.join("bin/node.exe");
            if node.is_file()
                && root
                    .join("services/runtime/bin/buddy-runtime.mjs")
                    .is_file()
            {
                return (root, node);
            }
        }
    }
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("workspace root")
        .to_owned();
    (root, option_env!("BUDDY_NODE").unwrap_or("node").into())
}

#[cfg(test)]
mod tests {
    use super::health;
    use crate::protocol::{BandAck, RuntimeState};
    use serde_json::json;

    #[test]
    fn whole_border_renderer_and_animation_receipt_are_allowlisted() {
        let state = RuntimeState {
            ack: Some(BandAck {
                fields: serde_json::from_value(json!({"drawing":{"animationEnabled":true,"capabilities":{"renderer":"native-border","private":"synthetic-private-value"}}})).unwrap(),
                ..Default::default()
            }),
            ..Default::default()
        };
        let view = health(&state);
        assert_eq!(view["drawing"]["renderer"], "native-border");
        assert_eq!(view["drawing"]["animationEnabled"], true);
        assert!(!view.to_string().contains("synthetic-private-value"));
    }

    #[test]
    fn native_bounds_evidence_is_bounded_and_does_not_copy_arbitrary_device_fields() {
        let state = RuntimeState {
            ack: Some(BandAck {
                fields: serde_json::from_value(json!({"drawing":{"animationEnabled":false,"capabilities":{"renderer":"native-border-probe"},"bounds":[
                    {"kind":"rects","status":"ok","expected":{"left":4,"top":241,"width":8,"height":157,"private":"synthetic-private-value"},"actual":{"left":-1,"top":241,"width":7,"height":157,"private":"synthetic-private-value"},"id":"synthetic-private-value"},
                    {"kind":"synthetic-private-value","status":"synthetic-private-value","actual":{"left":9999,"top":"synthetic-private-value","width":-1,"height":8}},
                    {"kind":"arcs","status":"timeout"},
                    {"kind":"stage","status":"ok","private":"synthetic-private-value"}
                ]}})).unwrap(),
                ..Default::default()
            }),
            ..Default::default()
        };
        let view = health(&state);
        let rows = view["drawing"]["bounds"].as_array().unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(view["drawing"]["animationEnabled"], false);
        assert_eq!(view["drawing"]["renderer"], "native-border-probe");
        assert_eq!(rows[0]["actual"]["width"], 7.0);
        assert_eq!(rows[0]["expected"]["width"], 8.0);
        assert_eq!(rows[0]["actual"]["left"], -1.0);
        assert!(rows[1]["kind"].is_null());
        assert!(rows[1]["status"].is_null());
        assert!(rows[1]["actual"]["left"].is_null());
        assert!(rows[1]["actual"]["top"].is_null());
        assert!(rows[1]["actual"]["width"].is_null());
        assert!(!view.to_string().contains("synthetic-private-value"));
    }

    #[test]
    fn health_reports_safe_power_and_operation_evidence_without_extra_fields() {
        let mut state = RuntimeState {
            paused: true,
            ack: Some(BandAck {
                settings_applied: Some(true),
                fields: serde_json::from_value(json!({
                    "powerSaving":true,
                    "wakeDisplay":{"id":"wake-fixture","remainingMs":0,"active":false},
                    "unexpected":"synthetic-private-value",
                    "pageLifecycle":{"created":1,"live":1,"unexpected":"synthetic-private-value"},
                    "drawing":{"frames":42,"unexpected":"synthetic-private-value","capabilities":{"renderer":"native-geometry","canvas":false,"div":true,"unexpected":"synthetic-private-value"}}
                }))
                .unwrap(),
                ..Default::default()
            }),
            ..Default::default()
        };
        state.fields.insert(
            "settings".into(),
            json!({"powerSaving":true,"unexpected":"synthetic-private-value"}),
        );
        state.fields.insert("diagnostics".into(), json!({"starts":2,"launches":3,"snapshotWakes":5,"phase":"connected","lastCode":"synthetic-private-value","signal":"synthetic-private-value","unexpected":"synthetic-private-value"}));
        state.fields.insert("operation".into(), json!({
            "id":"op-fixture","kind":"power_saving","status":"failed","code":"display_unconfirmed",
            "at":10,"settledAt":20,"wakeConfirmed":false,
            "target":{"unexpected":"synthetic-private-value"}
        }));
        let view = health(&state);
        assert_eq!(view["powerSaving"], true);
        assert_eq!(view["desiredPowerSaving"], true);
        assert_eq!(view["paused"], true);
        assert_eq!(view["diagnostics"]["starts"], 2);
        assert_eq!(view["diagnostics"]["launches"], 3);
        assert_eq!(view["diagnostics"]["snapshotWakes"], 5);
        assert_eq!(view["diagnostics"]["phase"], "connected");
        assert!(view["diagnostics"]["lastCode"].is_null());
        assert_eq!(view["pageLifecycle"]["live"], 1);
        assert_eq!(view["drawing"]["div"], true);
        assert_eq!(view["drawing"]["canvas"], false);
        assert_eq!(view["wakeDisplay"]["remainingMs"], 0);
        assert_eq!(view["operation"]["code"], "display_unconfirmed");
        assert_eq!(view["operation"]["settledAt"], 20);
        assert!(view["operation"].get("target").is_none());
        assert!(!view.to_string().contains("synthetic-private-value"));
        assert!(health(&RuntimeState::default())["operation"].is_null());
    }
}
