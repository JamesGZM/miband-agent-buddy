use anyhow::{Context, Result};
use corelib::{
    device::{
        xiaomi::{
            components::bind::XiaomiConnectOptions, packet::dispatcher, r#type::ConnectType,
            SendError,
        },
        DeviceKind,
    },
    events::CoreEvent,
};

use serde_json::{json, Value};
use std::time::Duration;
// Reuse the upstream macOS transport without Tauri or an AstroBox process.
#[allow(dead_code)]
#[path = "../upstream/btclassic-spp/src/models.rs"]
mod models;
#[allow(dead_code)]
#[path = "../upstream/btclassic-spp/src/macos/implementation.rs"]
mod spp;

async fn connect(addr: String, key: String) -> Result<()> {
    let rx_addr = addr.clone();
    let handle = tokio::runtime::Handle::current();
    spp::core::set_data_listener_impl(
        &addr,
        Box::new(move |packet| {
            if let Ok(packet) = packet {
                dispatcher::on_packet(handle.clone(), rx_addr.clone(), packet);
            }
        }),
    )?;
    spp::core::connect_impl(&addr, &[5, 1])?;
    while spp::core::get_connected_device_info_impl(&addr)?.is_none() {
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    emit(json!({"event":"transport"}));
    let mtu = spp::core::get_max_send_len_impl(&addr)?;
    let tx_addr = addr.clone();
    corelib::device::create_device_with_options(
        tokio::runtime::Handle::current(),
        DeviceKind::Xiaomi,
        "MiBand direct probe".into(),
        addr.clone(),
        key,
        2,
        ConnectType::SPP,
        Some(6),
        mtu,
        None,
        false,
        XiaomiConnectOptions {
            local_bind: None,
            app_device_id: std::env::var("MIBAND_APP_DEVICE_ID").ok(),
        },
        move |packets| {
            let addr = tx_addr.clone();
            async move {
                tokio::task::spawn_blocking(move || {
                    for p in packets {
                        spp::core::send_impl(&addr, &p)
                            .map_err(|_| SendError::Io("SPP send failed".into()))?;
                    }
                    Ok(())
                })
                .await
                .map_err(|_| SendError::Io("SPP send worker failed".into()))?
            }
        },
    )
    .await
    .context("Core authentication failed")?;
    emit(json!({"event":"authenticated"}));
    Ok(())
}

async fn sync_app(addr: String) -> Result<()> {
    corelib::device::resource::request_quick_app_list_json(addr.clone()).await?;
    let sync_addr = addr.clone();
    corelib::ecs::with_rt_mut(move |rt| {
        use corelib::device::xiaomi::components::{
            resource::ResourceComponent,
            thirdparty_app::{AppInfo, ThirdpartyAppSystem},
        };
        rt.with_device_mut(&sync_addr, |world, entity| -> Result<()> {
            let info = {
                let resources = world
                    .get::<ResourceComponent>(entity)
                    .context("Missing resources")?;
                let app = resources
                    .quick_apps
                    .iter()
                    .find(|a| a.package_name == "com.macprobe.band9")
                    .context("App not installed")?;
                AppInfo {
                    package_name: app.package_name.clone(),
                    fingerprint: app.fingerprint.clone(),
                }
            };
            world
                .get_mut::<ThirdpartyAppSystem>(entity)
                .context("Missing app system")?
                .sync_status(
                    &info,
                    pb::xiaomi::protocol::phone_app_status::Status::Connected,
                )
        })
        .context("Device missing")?
    })
    .await?;
    Ok(())
}
fn emit(value: Value) {
    use std::io::Write;
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{}", value);
    let _ = out.flush();
}
async fn battery(addr: String) -> Result<()> {
    use corelib::device::xiaomi::components::info::InfoSystem;
    let rx = corelib::ecs::with_rt_mut(move |rt| {
        rt.with_device_mut(&addr, |world, entity| {
            world
                .get_mut::<InfoSystem>(entity)
                .map(|mut info| info.request_device_status())
                .context("No info system")
        })
        .context("No device")?
    })
    .await?;
    let status = tokio::time::timeout(Duration::from_secs(5), rx).await???;
    emit(json!({"event":"battery","percent":status.battery.capacity}));
    Ok(())
}
async fn install(addr: String, path: String) -> Result<()> {
    use corelib::device::xiaomi::{components::install::InstallSystem, packet::mass::MassDataType};
    let bytes = std::fs::read(path)?;
    anyhow::ensure!(bytes.len() < 16 * 1024 * 1024, "Package too large");
    let future = corelib::ecs::with_rt_mut(move |rt| {
        rt.with_device_mut(&addr, |world, entity| {
            world
                .get_mut::<InstallSystem>(entity)
                .context("Missing install system")?
                .send_install_request_with_progress(
                    MassDataType::ThirdPartyApp,
                    bytes,
                    Some("com.macprobe.band9"),
                    std::sync::Arc::new(|p| {
                        emit(json!({"event":"progress","progress":p.progress}))
                    }),
                    None,
                )
        })
        .context("Missing device")?
    })
    .await?;
    tokio::time::timeout(Duration::from_secs(300), future).await??;
    Ok(())
}
async fn run(mut rx: tokio::sync::mpsc::Receiver<Value>) -> Result<()> {
    let initial = rx.recv().await.context("Missing credentials")?;
    let addr = initial["address"]
        .as_str()
        .context("Missing address")?
        .to_string();
    let key = initial["key"].as_str().context("Missing key")?.to_string();
    anyhow::ensure!(
        key.len() == 32 && key.bytes().all(|b| b.is_ascii_hexdigit()),
        "Invalid key"
    );
    drop(initial);
    corelib::init();
    let mut events = corelib::events::subscribe();
    tokio::time::timeout(Duration::from_secs(50), connect(addr.clone(), key)).await??;
    let _ = battery(addr.clone()).await;
    let mut ready = false;
    loop {
        tokio::select! {
            command=rx.recv()=>{
                let Some(command)=command else {break;};
                let id=command["id"].clone();
                let result:Result<()>=match command["op"].as_str() {
                    Some("snapshot")=>async {
                        if !ready {tokio::time::timeout(Duration::from_secs(6),sync_app(addr.clone())).await??;ready=true;}
                        let payload=&command["payload"];
                        let data=serde_json::to_vec(payload)?;
                        anyhow::ensure!(data.len()<=1024,"Payload too large");
                        corelib::device::thirdparty_app::send_message(addr.clone(),"com.macprobe.band9".into(),data).await?;
                        Ok(())
                    }.await,
                    Some("install")=>{ready=false;install(addr.clone(),command["path"].as_str().unwrap_or("").into()).await},
                    Some("disconnect")=>break,
                    _=>Err(anyhow::anyhow!("Unknown command"))
                };
                let code=result.as_ref().err().map(classify_error);
                emit(json!({"event":"result","id":id,"ok":result.is_ok(),"code":code}));
            }
            event=events.recv()=>match event? {
                CoreEvent::InterconnectMessage(m) if m.device_addr==addr && m.pkg_name=="com.macprobe.band9"=> {
                    if let Ok(ack)=serde_json::from_slice::<Value>(&m.payload) {emit(json!({"event":"ack","ack":ack}));}
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
fn main() {
    let (tx, rx) = tokio::sync::mpsc::channel(8);
    std::thread::spawn(move || {
        use std::io::BufRead;
        let input = std::io::stdin();
        let mut input = input.lock();
        loop {
            let mut bytes = Vec::new();
            let mut limited = (&mut input).take(8193);
            use std::io::Read;
            if limited.read_until(b'\n', &mut bytes).unwrap_or(0) == 0 {
                break;
            }
            if bytes.len() > 8192 {
                break;
            }
            match serde_json::from_slice(&bytes) {
                Ok(v) => {
                    if tx.blocking_send(v).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });
    std::thread::spawn(move || {
        let runtime = tokio::runtime::Runtime::new().expect("runtime");
        let result = runtime.block_on(run(rx));
        if result.is_err() {
            emit(
                json!({"event":"error","message":"連線操作失敗，請檢查裝置距離、認證與其他連線程式"}),
            );
        }
        std::process::exit(if result.is_ok() { 0 } else { 1 });
    });
    objc2_core_foundation::CFRunLoop::run();
}

// Only fixed diagnostic codes cross IPC; upstream errors may contain device identifiers.
fn classify_error(error: &anyhow::Error) -> &'static str {
    let text = format!("{error:#}");
    if text.contains("install result") {
        "install_receipt_missing"
    } else if text.contains("third-party app install failed") {
        "install_rejected"
    } else if text.contains("prepare") {
        "install_prepare"
    } else if text.contains("MASS") {
        "transfer"
    } else if text.contains("App not installed") {
        "app_missing"
    } else if text.contains("timed out") || text.contains("deadline") {
        "timeout"
    } else {
        "operation_failed"
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installation_result_timeout_is_not_a_generic_timeout() {
        assert_eq!(
            classify_error(&anyhow::anyhow!("timed out waiting for install result")),
            "install_receipt_missing"
        );
        assert_eq!(
            classify_error(&anyhow::anyhow!(
                "third-party app install failed: VerifyFailed"
            )),
            "install_rejected"
        );
        assert_eq!(
            classify_error(&anyhow::anyhow!(
                "timed out waiting for install prepare response"
            )),
            "install_prepare"
        );
        assert_eq!(
            classify_error(&anyhow::anyhow!("failed to send MASS payload")),
            "transfer"
        );
    }
}
