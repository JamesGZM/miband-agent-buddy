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
use serde_json::{Value, json};
use std::time::Duration;

pub async fn run(mut rx: tokio::sync::mpsc::Receiver<Value>) -> Result<()> {
    let initial = rx.recv().await.context("Missing credentials")?;
    let credentials = Credentials::decode(initial)?;
    let addr = credentials.address;
    let key = credentials.key;
    corelib::init();
    let mut events = corelib::events::subscribe();
    tokio::time::timeout(Duration::from_secs(50), connect(addr.clone(), key)).await??;
    let _ = battery(addr.clone()).await;
    let mut ready = false;
    let mut last_battery_update = None;
    loop {
        tokio::select! {
            command=rx.recv()=>{
                let Some(command)=command else {break;};
                let command: Command = match serde_json::from_value(command) {
                    Ok(command) => command,
                    Err(_) => {emit(json!({"event":"result","id":null,"ok":false,"code":"operation_failed"})); continue;}
                };
                let id=command.id;
                let result:Result<()>=match command.operation {
                    Operation::Snapshot {payload}=>async {
                        if !ready {tokio::time::timeout(Duration::from_secs(6),sync_app(addr.clone())).await??;ready=true;}
                        let data=serde_json::to_vec(&payload)?;
                        anyhow::ensure!(data.len()<=1024,"Payload too large");
                        corelib::device::thirdparty_app::send_message(addr.clone(),"com.macprobe.band9".into(),data).await?;
                        Ok(())
                    }.await,
                    Operation::Ping=>battery(addr.clone()).await,
                    Operation::DeviceStatus=>device_status(addr.clone()).await,
                    Operation::BuddyStatus=>buddy_status(addr.clone()).await,
                    Operation::LaunchBuddy=>async {
                        tokio::time::timeout(Duration::from_secs(6),sync_app(addr.clone())).await??;
                        ready=true;
                        corelib::device::thirdparty_app::launch(
                            addr.clone(), "com.macprobe.band9".into(),
                            "hap://app/com.macprobe.band9/pages/index".into(),
                        ).await
                    }.await,
                    Operation::Install {path}=>{ready=false;install(addr.clone(),path).await},
                    Operation::Disconnect=>break
                };
                let code=result.as_ref().err().map(classify_error);
                emit(json!({"event":"result","id":id,"ok":result.is_ok(),"code":code}));
            }
            event=events.recv()=>match event? {
                CoreEvent::InterconnectMessage(m) if m.device_addr==addr && m.pkg_name=="com.macprobe.band9"=> {
                    if let Ok(ack)=serde_json::from_slice::<Value>(&m.payload) {emit(json!({"event":"ack","ack":ack}));}
                }
                CoreEvent::DeviceStateChanged(change) if change.device_addr==addr=> {
                    if let Some(record)=cached_battery(addr.clone()).await {
                        if last_battery_update.as_ref()!=Some(&record){last_battery_update=Some(record.clone());emit(record);}
                    }
                }
                CoreEvent::SharedLinkDetected(_)=>{emit(json!({"event":"conflict"}));break;}
                _=>{}
            }
        }
    }
    corelib::device::cleanup_device_state(DeviceKind::Xiaomi, &addr);
    let _ = spp::core::disconnect_impl(&addr);
    Ok(())
}
