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
pub async fn battery(addr: String) -> Result<()> {
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
