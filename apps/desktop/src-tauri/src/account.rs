use crate::{domain::Device, net, xiaomi};
use serde_json::{Value, json};
use std::collections::HashMap;
use tauri::Manager;
pub const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
pub async fn fetch_devices(
    app: &tauri::AppHandle,
    region: &str,
) -> Result<(Vec<Device>, xiaomi::MiAccountToken), String> {
    let login = app
        .get_webview_window("xiaomi-login")
        .ok_or("請先開啟登入視窗，完成小米登入")?;
    let cookies = login
        .cookies_for_url("https://account.xiaomi.com/".parse().unwrap())
        .map_err(|_| "無法讀取登入會話")?;
    let mut cookie_parts = Vec::new();
    for cookie in cookies {
        if ["userId", "cUserId", "passToken", "deviceId", "sdkVersion"].contains(&cookie.name()) {
            cookie_parts.push(format!("{}={}", cookie.name(), cookie.value()));
        }
    }
    if !cookie_parts.iter().any(|x| x.starts_with("passToken=")) {
        return Err("尚未取得小米登入會話。請先在官方視窗完成登入，完成後會自動繼續。".into());
    }
    let cookie_header = cookie_parts.join("; ");
    let auth = xiaomi::fetch_2fa_session_with_cookie(UA.into(), cookie_header.clone(), None)
        .await
        .map_err(|_| "小米登入尚未完成或需要額外驗證；請返回官方登入視窗完成驗證後重試")?;
    let location = url::Url::parse(&auth.location).map_err(|_| "小米未返回有效登入位置")?;
    if !net::trusted(&location) {
        return Err("小米登入回傳的網址不符合允許範圍".into());
    }
    let token = xiaomi::complete_2fa_login_with_cookie(
        auth.ssecurity,
        auth.c_user_id,
        auth.location,
        UA.into(),
        cookie_header,
        None,
    )
    .await
    .map_err(|_| "取得小米健康服務憑證失敗，請重新登入")?;
    let host = if region == "cn" {
        "https://hlth.io.mi.com".to_string()
    } else {
        format!("https://{region}.hlth.io.mi.com")
    };
    let mut params = HashMap::new();
    params.insert(
        "data".into(),
        json!({"page_size":50,"status":1}).to_string(),
    );
    let raw = xiaomi::mi_service_call_encrypted(
        token.clone(),
        "".into(),
        format!("{host}/app/v1/source/get_source_list"),
        params,
        UA.into(),
    )
    .await
    .map_err(|_| "查詢小米裝置失敗，請確認帳號地區或重新登入")?;
    let response: Value = serde_json::from_str(&raw).map_err(|_| "裝置回應格式無法辨識")?;
    if response["code"] != 0 {
        return Err("小米雲端拒絕裝置查詢，請確認帳號地區".into());
    }
    let Some(list) = response["result"]["list"].as_array() else {
        return Ok((Vec::new(), token));
    };
    let devices = list
        .iter()
        .filter_map(|item| {
            let detail = &item["detail"];
            let addr = detail["mac"].as_str()?;
            let name = item["name"].as_str().unwrap_or("小米裝置");
            Some(Device {
                name: name.into(),
                addr: addr.into(),
                key: detail["encrypt_key"].as_str().unwrap_or("").into(),
            })
        })
        .collect();
    Ok((devices, token))
}
