use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

// No Debug implementation: the initial frame contains a private device key.
#[derive(Deserialize)]
pub struct Credentials {
    pub address: String,
    pub key: String,
}
impl Credentials {
    pub fn decode(value: Value) -> Result<Self> {
        let value: Self = serde_json::from_value(value).context("Invalid credentials frame")?;
        anyhow::ensure!(
            !value.address.is_empty() && value.address.len() <= 128,
            "Invalid address"
        );
        anyhow::ensure!(
            value.key.len() == 32 && value.key.bytes().all(|b| b.is_ascii_hexdigit()),
            "Invalid key"
        );
        Ok(value)
    }
}
#[derive(Deserialize, Serialize)]
#[serde(untagged)]
pub enum RequestId {
    Name(String),
    Sequence(u32),
}
#[derive(Deserialize)]
pub struct Command {
    pub id: Option<RequestId>,
    #[serde(flatten)]
    pub operation: Operation,
}
#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum Operation {
    Snapshot { payload: Value },
    Ping,
    DeviceStatus,
    LaunchBuddy,
    Install { path: String },
    Disconnect,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_frames_consume_shared_v1_contract() {
        let f: Value = serde_json::from_str(include_str!(
            "../../../packages/buddy-shared/fixtures/v1.json"
        ))
        .unwrap();
        assert!(Credentials::decode(f["credentials"].clone()).is_ok());
        for command in f["transportCommands"].as_array().unwrap() {
            let parsed = serde_json::from_value::<Command>(command.clone()).unwrap();
            if let Operation::Snapshot { payload } = parsed.operation {
                assert_eq!(payload, f["snapshot"]);
            }
        }
        for bad in [
            serde_json::json!({"op":"launch_buddy","id":{}}),
            serde_json::json!({"op":"install","id":1}),
        ] {
            assert!(serde_json::from_value::<Command>(bad).is_err());
        }
        assert!(Credentials::decode(serde_json::json!({"address":"fixture","key":"bad"})).is_err());
    }
}
