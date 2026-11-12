use crate::{
    application::{battery, buddy_status, cached_battery, device_status, install, sync_app},
    connection::connect,
    error::classify_error,
    protocol::{Command, Credentials, Operation},
    spp,
    stdio::emit,
};
use anyhow::{Context, Result};
use corelib::{device::DeviceKind, events::CoreEvent};
use serde_json::{json, Value};
use std::time::Duration;

pub async fn run(mut rx: tokio::sync::mpsc::Receiver<Value>) -> Result<()> {
    let initial = rx.recv().await.context("Missing credentials")?;
    let credentials = Credentials::decode(initial)?;
    let addr = credentials.address;
    let key = credentials.key;
    corelib::init();
    let events = corelib::events::subscribe();
    let link = tokio::time::timeout(Duration::from_secs(50), connect(addr.clone(), key)).await??;
    let result = drive(command_loop(rx, addr.clone()), events, link, &addr, emit).await;
    corelib::device::cleanup_device_state(DeviceKind::Xiaomi, &addr);
    let _ = spp::core::disconnect_impl(&addr);
    result
}

async fn command_loop(mut rx: tokio::sync::mpsc::Receiver<Value>, addr: String) -> Result<()> {
    let mut ready = false;
    while let Some(command) = rx.recv().await {
        let command: Command = match serde_json::from_value(command) {
            Ok(command) => command,
            Err(_) => {
                emit(json!({"event":"result","id":null,"ok":false,"code":"operation_failed"}));
                continue;
            }
        };
        let id = command.id;
        let result: Result<()> = match command.operation {
            Operation::Snapshot { payload } => {
                async {
                    if !ready {
                        tokio::time::timeout(Duration::from_secs(6), sync_app(addr.clone()))
                            .await
                            .context("Buddy inventory query failed")??;
                        ready = true;
                    }
                    let data = serde_json::to_vec(&payload)?;
                    anyhow::ensure!(data.len() <= 1024, "Payload too large");
                    corelib::device::thirdparty_app::send_message(
                        addr.clone(),
                        "com.macprobe.band9".into(),
                        data,
                    )
                    .await?;
                    Ok(())
                }
                .await
            }
            Operation::Ping => battery(addr.clone()).await,
            Operation::DeviceStatus => device_status(addr.clone()).await,
            Operation::BuddyStatus => buddy_status(addr.clone()).await,
            Operation::LaunchBuddy => {
                async {
                    if !ready {
                        tokio::time::timeout(Duration::from_secs(6), sync_app(addr.clone()))
                            .await
                            .context("Buddy inventory query failed")??;
                        ready = true;
                    }
                    corelib::device::thirdparty_app::launch(
                        addr.clone(),
                        "com.macprobe.band9".into(),
                        "hap://app/com.macprobe.band9/pages/index".into(),
                    )
                    .await
                    .context("Buddy launch command failed")
                }
                .await
            }
            Operation::Install { path } => {
                ready = false;
                install(addr.clone(), path).await
            }
            Operation::Disconnect => break,
        };
        let code = result.as_ref().err().map(classify_error);
        emit(json!({"event":"result","id":id,"ok":result.is_ok(),"code":code}));
    }
    Ok(())
}

// A slow device query must never stop forwarding the ACKs that renew Buddy's lease.
// Dropping this owner also drops the command future, including an in-flight query.
async fn drive<F, E>(
    commands: F,
    mut events: tokio::sync::broadcast::Receiver<CoreEvent>,
    mut link: tokio::sync::watch::Receiver<bool>,
    addr: &str,
    mut output: E,
) -> Result<()>
where
    F: std::future::Future<Output = Result<()>>,
    E: FnMut(Value),
{
    tokio::pin!(commands);
    let mut last_battery_update = None;
    loop {
        tokio::select! {
            result = &mut commands => return result,
            changed = link.changed() => {
                anyhow::ensure!(changed.is_ok() && !*link.borrow(), "Bluetooth SPP link closed");
            }
            event = events.recv() => match event? {
                CoreEvent::InterconnectMessage(m) if m.device_addr == addr && m.pkg_name == "com.macprobe.band9" => {
                    if let Ok(ack) = serde_json::from_slice::<Value>(&m.payload) { output(json!({"event":"ack","ack":ack})); }
                }
                CoreEvent::DeviceStateChanged(change) if change.device_addr == addr => {
                    if let Some(record) = cached_battery(addr.to_string()).await {
                        if last_battery_update.as_ref() != Some(&record) { last_battery_update = Some(record.clone()); output(record); }
                    }
                }
                CoreEvent::SharedLinkDetected(_) => { output(json!({"event":"conflict"})); return Ok(()); }
                _ => {}
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn ack_is_forwarded_while_a_device_operation_is_still_waiting() {
        let (events, receiver) = tokio::sync::broadcast::channel(8);
        let (_link_sender, link) = tokio::sync::watch::channel(false);
        let (finish, waiting) = tokio::sync::oneshot::channel::<()>();
        let (output, mut received) = tokio::sync::mpsc::unbounded_channel();
        let worker = tokio::spawn(async move {
            drive(
                async {
                    waiting.await?;
                    Ok(())
                },
                receiver,
                link,
                "fixture",
                move |value| {
                    output.send(value).unwrap();
                },
            )
            .await
        });
        events
            .send(CoreEvent::InterconnectMessage(
                corelib::events::InterconnectMessage {
                    device_addr: "fixture".into(),
                    pkg_name: "com.macprobe.band9".into(),
                    payload: br#"{"seq":7}"#.to_vec(),
                },
            ))
            .unwrap();
        let ack = tokio::time::timeout(Duration::from_secs(1), received.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(ack, json!({"event":"ack","ack":{"seq":7}}));
        finish.send(()).unwrap();
        worker.await.unwrap().unwrap();
    }
    #[tokio::test]
    async fn actual_link_loss_cancels_a_waiting_command_without_waiting_for_a_probe() {
        let (_events, receiver) = tokio::sync::broadcast::channel(8);
        let (sender, link) = tokio::sync::watch::channel(false);
        let (finish, waiting) = tokio::sync::oneshot::channel::<()>();
        sender.send(true).unwrap();
        let result = drive(
            async {
                waiting.await?;
                Ok(())
            },
            receiver,
            link,
            "fixture",
            |_| {},
        )
        .await;
        assert_eq!(result.unwrap_err().to_string(), "Bluetooth SPP link closed");
        assert!(finish.is_closed());
    }
    #[tokio::test]
    async fn closing_the_event_owner_cancels_the_waiting_command() {
        let (events, receiver) = tokio::sync::broadcast::channel(8);
        let (_link_sender, link) = tokio::sync::watch::channel(false);
        let (_finish, waiting) = tokio::sync::oneshot::channel::<()>();
        drop(events);
        let result = drive(
            async {
                waiting.await?;
                Ok(())
            },
            receiver,
            link,
            "fixture",
            |_| {},
        )
        .await;
        assert!(result.is_err());
        // The caller's waiter is no longer held by a detached worker.
        assert!(_finish.is_closed());
    }
}
