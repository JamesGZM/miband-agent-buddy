use crate::{spp, stdio::emit};
use anyhow::{Context, Result};
use corelib::device::{
    xiaomi::{
        components::bind::XiaomiConnectOptions, packet::dispatcher, r#type::ConnectType, SendError,
    },
    DeviceKind,
};
use serde_json::json;
use std::time::Duration;

pub async fn connect(addr: String, key: String) -> Result<()> {
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
        Some(0),
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
