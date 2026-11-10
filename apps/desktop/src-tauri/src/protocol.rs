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
    },
    Install,
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
            },
        };
        assert_eq!(
            serde_json::to_value(command).unwrap(),
            f["runtimeCommands"][0]
        );
    }
}
