use crate::stdio::emit;
use anyhow::{Context, Result};
use serde_json::json;
use std::time::Duration;

/// Only Buddy's installation metadata crosses the process boundary.
fn buddy_record(apps: &[pb::xiaomi::protocol::AppItem]) -> serde_json::Value {
    let app = apps
        .iter()
        .find(|app| app.package_name == "com.macprobe.band9");
    json!({"event":"buddy", "installed":app.is_some(), "versionCode":app.map(|app| app.version_code)})
}
pub async fn buddy_status(addr: String) -> Result<()> {
    tokio::time::timeout(
        Duration::from_secs(6),
        corelib::device::resource::request_quick_app_list_json(addr.clone()),
    )
    .await??;
    let record = corelib::ecs::with_rt_mut(move |rt| {
        use corelib::device::xiaomi::components::resource::ResourceComponent;
        rt.with_device_mut(&addr, |world, entity| {
            world
                .get::<ResourceComponent>(entity)
                .map(|resources| buddy_record(&resources.quick_apps))
                .context("Missing resources")
        })
        .context("Device missing")?
    })
    .await?;
    emit(record);
    Ok(())
}

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
                emit(buddy_record(&resources.quick_apps));
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
fn battery_charging(battery: &pb::xiaomi::protocol::device_status::Battery) -> Option<bool> {
    use pb::xiaomi::protocol::device_status::battery::ChargeStatus;
    match ChargeStatus::try_from(battery.charge_status?).ok()? {
        ChargeStatus::Charging | ChargeStatus::Full => Some(true),
        ChargeStatus::NotCharging => Some(false),
        ChargeStatus::Unknown => None,
    }
}
fn charging(status: &pb::xiaomi::protocol::DeviceStatus) -> Option<bool> {
    battery_charging(&status.battery)
}
fn battery_record(battery: &pb::xiaomi::protocol::device_status::Battery) -> serde_json::Value {
    json!({"event":"battery","percent":battery.capacity.min(100),"charging":battery_charging(battery)})
}
/// Read Core's already-updated cache; device notifications must not trigger another request.
pub async fn cached_battery(addr: String) -> Option<serde_json::Value> {
    use corelib::device::xiaomi::components::info::InfoComponent;
    corelib::ecs::with_rt_mut(move |rt| {
        rt.with_device_mut(&addr, |world, entity| {
            world
                .get::<InfoComponent>(entity)
                .and_then(|info| info.battery())
                .map(battery_record)
        })
        .flatten()
    })
    .await
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
    emit(battery_record(&status.battery));
    Ok(())
}
/// Display-only status. Serial number and IMEI are deliberately never forwarded.
pub async fn device_status(addr: String) -> Result<()> {
    let info = info_request(&addr, |info| info.request_device_info())
        .await
        .ok();
    let status = info_request(&addr, |info| info.request_device_status())
        .await
        .ok();
    let storage = info_request(&addr, |info| info.request_device_storage())
        .await
        .ok();
    anyhow::ensure!(
        info.is_some() || status.is_some() || storage.is_some(),
        "No device status"
    );
    let text =
        |value: &str| (!value.is_empty()).then(|| value.chars().take(64).collect::<String>());
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
    use corelib::device::xiaomi::{
        XiaomiDevice, components::install::InstallSystem, packet::mass::MassDataType,
    };
    let bytes = std::fs::read(path)?;
    anyhow::ensure!(bytes.len() < 16 * 1024 * 1024, "Package too large");
    let timeout = install_timeout(bytes.len());
    let future = corelib::ecs::with_rt_mut(move |rt| {
        rt.with_device_mut(&addr, |world, entity| {
            {
                let mut device = world
                    .get_mut::<XiaomiDevice>(entity)
                    .context("Missing Xiaomi device")?;
                configure_install_mass(&mut device.config.mass);
            }
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
    tokio::time::timeout(timeout, future).await??;
    Ok(())
}

fn configure_install_mass(config: &mut corelib::device::xiaomi::config::MassConfig) {
    // Upstream waits for one ACK per flow-control pass. Enqueueing one part
    // keeps that minimum progress sufficient to bound the outstanding queue.
    config.max_batch_parts = 1;
    config.fallback_batch_parts = 1;
    config.backlog_multiplier = 1;
    config.fallback_backlog_limit = 32;
}

fn install_timeout(size_bytes: usize) -> Duration {
    // Allow preparation/verification plus a conservative 12 KiB/s transfer,
    // while keeping even a stalled large installation bounded.
    let seconds = 120 + (size_bytes as u64).div_ceil(12 * 1024);
    Duration::from_secs(seconds.clamp(300, 900))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn install_queue_stays_within_one_window_even_if_each_wait_advances_one_ack() {
        let mut config = corelib::device::xiaomi::config::MassConfig::default();
        configure_install_mass(&mut config);
        for window in (1..=32).map(Some).chain(std::iter::once(None)) {
            let batch = window
                .map(|w: usize| w.min(config.max_batch_parts))
                .unwrap_or(config.fallback_batch_parts);
            let limit = window
                .map(|w| w * config.backlog_multiplier)
                .unwrap_or(config.fallback_backlog_limit);
            let mut pending = 0;
            // Exercise the upstream contract's slowest permitted ACK progress
            // across many u8 sequence wraps, without a device or wall-clock timer.
            for _ in 0..4096 {
                pending += batch;
                assert!(pending <= window.unwrap_or(32));
                if pending >= limit {
                    pending -= 1;
                }
            }
        }
    }
    #[test]
    fn conservative_install_queue_does_not_extend_existing_deadlines() {
        let mut config = corelib::device::xiaomi::config::MassConfig::default();
        let before = serde_json::to_value(&config).unwrap();
        configure_install_mass(&mut config);
        let after = serde_json::to_value(&config).unwrap();
        for key in [
            "prepare_timeout_secs",
            "ack_wait_timeout_secs",
            "ack_poll_interval_ms",
            "ack_stall_default_ms",
            "ack_stall_min_ms",
            "ack_stall_max_ms",
        ] {
            assert_eq!(before[key], after[key], "{key}");
        }
    }
    #[test]
    fn install_timeout_scales_with_package_size_but_remains_bounded() {
        for (size, seconds) in [
            (0, 300),
            (180 * 12 * 1024, 300),
            (180 * 12 * 1024 + 1, 301),
            (3_000_000, 365),
            (5_391_521, 559),
            (780 * 12 * 1024, 900),
            (16 * 1024 * 1024 - 1, 900),
        ] {
            assert_eq!(install_timeout(size), Duration::from_secs(seconds));
        }
    }
    #[test]
    fn battery_updates_project_only_bounded_percent_and_charging() {
        use pb::xiaomi::protocol::device_status::{Battery, battery::ChargeInfo};
        for (state, charging) in [
            (None, None),
            (Some(0), None),
            (Some(1), Some(true)),
            (Some(2), Some(false)),
            (Some(3), Some(true)),
            (Some(99), None),
        ] {
            let battery = Battery {
                capacity: 120,
                charge_status: state,
                charge_info: Some(ChargeInfo {
                    state: 7,
                    timestamp: Some(123),
                }),
            };
            assert_eq!(
                battery_record(&battery),
                json!({"event":"battery","percent":100,"charging":charging})
            );
        }
    }
    #[test]
    fn buddy_inventory_exposes_only_presence_and_version() {
        let app = pb::xiaomi::protocol::AppItem {
            package_name: "com.macprobe.band9".into(),
            fingerprint: vec![1, 2, 3],
            version_code: 16,
            can_remove: true,
            app_name: "Synthetic Buddy".into(),
        };
        assert_eq!(
            buddy_record(&[]),
            json!({"event":"buddy","installed":false,"versionCode":null})
        );
        assert_eq!(
            buddy_record(&[app]),
            json!({"event":"buddy","installed":true,"versionCode":16})
        );
        let unrelated = pb::xiaomi::protocol::AppItem {
            package_name: "fixture.other".into(),
            fingerprint: vec![],
            version_code: 99,
            can_remove: true,
            app_name: "Other".into(),
        };
        assert_eq!(buddy_record(&[unrelated])["installed"], false);
    }
}
