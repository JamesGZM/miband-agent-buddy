use crate::stdio::emit;
use anyhow::{Context, Result};
use serde_json::json;
use std::time::Duration;

pub async fn sync_app(addr: String) -> Result<()> {
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
fn charging(status: &pb::xiaomi::protocol::DeviceStatus) -> Option<bool> {
    use pb::xiaomi::protocol::device_status::battery::ChargeStatus;
    match ChargeStatus::try_from(status.battery.charge_status?).ok()? {
        ChargeStatus::Charging | ChargeStatus::Full => Some(true),
        ChargeStatus::NotCharging => Some(false),
        ChargeStatus::Unknown => None,
    }
}
async fn info_request<T: Send + 'static>(
    addr: &str,
    request: impl FnOnce(
            &mut corelib::device::xiaomi::components::info::InfoSystem,
        ) -> tokio::sync::oneshot::Receiver<Result<T>>
        + Send
        + 'static,
) -> Result<T> {
    use corelib::device::xiaomi::components::info::InfoSystem;
    let addr = addr.to_string();
    let rx = corelib::ecs::with_rt_mut(move |rt| {
        rt.with_device_mut(&addr, |world, entity| {
            world
                .get_mut::<InfoSystem>(entity)
                .map(|mut info| request(&mut info))
                .context("No info system")
        })
        .context("No device")?
    })
    .await?;
    tokio::time::timeout(Duration::from_secs(5), rx).await??
}
pub async fn battery(addr: String) -> Result<()> {
    let status = info_request(&addr, |info| info.request_device_status()).await?;
    emit(json!({"event":"battery","percent":status.battery.capacity,"charging":charging(&status)}));
    Ok(())
}
/// Display-only status. Serial number and IMEI are deliberately never forwarded.
pub async fn device_status(addr: String) -> Result<()> {
    let info = info_request(&addr, |info| info.request_device_info()).await.ok();
    let status = info_request(&addr, |info| info.request_device_status()).await.ok();
    let storage = info_request(&addr, |info| info.request_device_storage()).await.ok();
    anyhow::ensure!(info.is_some() || status.is_some() || storage.is_some(), "No device status");
    let text = |value: &str| (!value.is_empty()).then(|| value.chars().take(64).collect::<String>());
    emit(json!({
        "event": "device",
        "battery": status.as_ref().map(|s| s.battery.capacity.min(100)),
        "charging": status.as_ref().and_then(charging),
        "firmware": info.as_ref().and_then(|i| text(&i.firmware_version)),
        "model": info.as_ref().and_then(|i| text(&i.model)),
        "storageTotal": storage.as_ref().map(|s| s.total),
        "storageFree": storage.as_ref().map(|s| s.total.saturating_sub(s.used)),
    }));
    Ok(())
}
pub async fn install(addr: String, path: String) -> Result<()> {
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
