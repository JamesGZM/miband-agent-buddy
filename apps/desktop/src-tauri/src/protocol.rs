//! Typed wire boundaries. Extension data is retained for additive v1 fields.
use crate::domain::BuddyTheme;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Connection {
    #[default]
    Disconnected,
    Connecting,
    Waiting,
    Standby,
    Connected,
    Retrying,
    Installing,
    Error,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BandAck {
    pub buddy_theme: Option<BuddyTheme>,
    pub settings_revision: Option<u64>,
    pub settings_applied: Option<bool>,
    #[serde(flatten)]
    pub fields: HashMap<String, Value>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Installation {
    pub ok: bool,
    pub code: Option<String>,
    pub at: Option<u64>,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RuntimeState {
    pub connection: Connection,
    pub ack: Option<BandAck>,
    pub paused: bool,
    pub error: Option<String>,
    pub progress: Option<f64>,
    pub installed: bool,
    pub installation: Option<Installation>,
    #[serde(flatten)]
    pub fields: HashMap<String, Value>,
}
#[derive(Deserialize)]
#[serde(tag = "event")]
pub enum RuntimeEvent {
    #[serde(rename = "state")]
    State(RuntimeState),
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buddy_theme: Option<BuddyTheme>,
    pub revision: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keep_screen: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wake_hold_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub activity_keep_awake: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub power_saving: Option<bool>,
}
#[derive(Serialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum RuntimeCommand {
    Connect {
        address: String,
        key: String,
        settings: RuntimeSettings,
    },
    Disconnect,
    Pause {
        value: bool,
    },
    Configure {
        settings: RuntimeSettings,
        #[serde(skip_serializing_if = "Option::is_none")]
        request: Option<String>,
    },
    ShowPage {
        page: u8,
        request: String,
    },
    Wake {
        request: String,
    },
    Install,
    RefreshDevice,
    CheckBuddy {
        #[serde(skip_serializing_if = "Option::is_none")]
        request: Option<String>,
    },
    ResetActivity {
        #[serde(skip_serializing_if = "Option::is_none")]
        request: Option<String>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::Action;
    fn fixtures() -> Value {
        serde_json::from_str(include_str!(
            "../../../../packages/buddy-shared/fixtures/v1.json"
        ))
        .unwrap()
    }
    #[test]
    fn runtime_and_action_wire_contracts_are_compatible() {
        let f = fixtures();
        let RuntimeEvent::State(state) = serde_json::from_value(f["runtimeState"].clone()).unwrap();
        assert!(state.connection == Connection::Connected);
        assert_eq!(serde_json::to_value(state).unwrap()["ack"], f["ack"]);
        for action in f["actions"].as_array().unwrap() {
            assert!(serde_json::from_value::<Action>(action.clone()).is_ok());
        }
        assert!(
            serde_json::from_value::<Action>(
                serde_json::json!({"operation":"pause","value":"true"})
            )
            .is_err()
        );
        let command = RuntimeCommand::Connect {
            address: "fixture-device".into(),
            key: "0".repeat(32),
            settings: RuntimeSettings {
                buddy_theme: Some(BuddyTheme::Chatgpt),
                revision: 2,
                keep_screen: Some(false),
                wake_hold_ms: Some(20000),
                activity_keep_awake: Some(false),
                power_saving: Some(false),
            },
        };
        assert_eq!(
            serde_json::to_value(command).unwrap(),
            f["runtimeCommands"][0]
        );
        let operations = [
            RuntimeCommand::Configure {
                settings: RuntimeSettings {
                    buddy_theme: Some(BuddyTheme::Claude),
                    revision: 3,
                    keep_screen: None,
                    wake_hold_ms: None,
                    activity_keep_awake: None,
                    power_saving: None,
                },
                request: Some("op-1".into()),
            },
            RuntimeCommand::ShowPage {
                page: 1,
                request: "op-2".into(),
            },
            RuntimeCommand::Wake {
                request: "op-3".into(),
            },
        ];
        for (index, command) in operations.into_iter().enumerate() {
            assert_eq!(
                serde_json::to_value(command).unwrap(),
                f["runtimeCommands"][index + 2]
            );
        }
        let hold = RuntimeCommand::Configure {
            settings: RuntimeSettings {
                buddy_theme: None,
                revision: 3,
                keep_screen: None,
                wake_hold_ms: Some(300000),
                activity_keep_awake: None,
                power_saving: None,
            },
            request: None,
        };
        assert_eq!(serde_json::to_value(hold).unwrap(), f["runtimeCommands"][8]);
        assert_eq!(
            serde_json::to_value(RuntimeCommand::RefreshDevice).unwrap(),
            f["runtimeCommands"][9]
        );
        assert_eq!(
            serde_json::to_value(RuntimeCommand::ResetActivity { request: None }).unwrap(),
            f["runtimeCommands"][10]
        );
        assert!(
            serde_json::from_value::<Action>(
                serde_json::json!({"operation":"reset_activity","value":true})
            )
            .is_err()
        );
        let activity = RuntimeCommand::Configure {
            settings: RuntimeSettings {
                buddy_theme: None,
                revision: 3,
                keep_screen: None,
                wake_hold_ms: None,
                activity_keep_awake: Some(true),
                power_saving: None,
            },
            request: None,
        };
        assert_eq!(
            serde_json::to_value(activity).unwrap(),
            f["runtimeCommands"][11]
        );
        assert_eq!(
            serde_json::to_value(RuntimeCommand::CheckBuddy { request: None }).unwrap(),
            serde_json::json!({"op":"check_buddy"})
        );
        for value in [serde_json::json!("true"), serde_json::json!(1), Value::Null] {
            assert!(
                serde_json::from_value::<Action>(
                    serde_json::json!({"operation":"activity_keep_awake","value":value})
                )
                .is_err()
            );
            assert!(
                serde_json::from_value::<Action>(
                    serde_json::json!({"operation":"power_saving","value":value})
                )
                .is_err()
            );
        }
        let power = RuntimeCommand::Configure {
            settings: RuntimeSettings {
                buddy_theme: None,
                revision: 3,
                keep_screen: None,
                wake_hold_ms: None,
                activity_keep_awake: None,
                power_saving: Some(true),
            },
            request: None,
        };
        assert_eq!(
            serde_json::to_value(power).unwrap(),
            f["runtimeCommands"][13]
        );
        assert_eq!(
            serde_json::to_value(RuntimeCommand::ResetActivity {
                request: Some("op-reset".into())
            })
            .unwrap(),
            f["runtimeCommands"][14]
        );
        assert_eq!(
            serde_json::to_value(RuntimeCommand::CheckBuddy {
                request: Some("op-check".into())
            })
            .unwrap(),
            f["runtimeCommands"][15]
        );
    }
}
