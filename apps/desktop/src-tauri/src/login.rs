use crate::{
    account::{self, UA},
    net, services,
    state::Shared,
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub async fn open_login(
    app: tauri::AppHandle,
    state: Shared,
    region: String,
) -> Result<(), String> {
    if !["cn", "sg", "de", "us", "ru", "i2"].contains(&region.as_str()) {
        return Err("服務地區無效".into());
    }
    let title = {
        let s = state.lock().map_err(|_| "狀態不可用")?;
        if s.busy {
            return Err("請等待目前操作完成".into());
        }
        if s.credentials.is_some() {
            return Err("切換帳號前請先登出目前帳號".into());
        }
        crate::i18n::labels(crate::i18n::current(&s.prefs.language)).login_title
    };
    if let Some(w) = app.get_webview_window("xiaomi-login") {
        let _ = w.set_focus();
        return Ok(());
    }
    WebviewWindowBuilder::new(
        &app,
        "xiaomi-login",
        WebviewUrl::External(
            "https://account.xiaomi.com/pass/serviceLogin?sid=miothealth"
                .parse()
                .unwrap(),
        ),
    )
    .title(title)
    .inner_size(480.0, 720.0)
    .incognito(true)
    .user_agent(UA)
    .on_navigation(net::trusted)
    .on_page_load(move |webview, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished)
            && payload.url().host_str() == Some("sts-hlth.io.mi.com")
            && payload.url().path() == "/healthapp/sts"
        {
            let app = webview.app_handle().clone();
            let shared = app.state::<Shared>().inner().clone();
            let region = region.clone();
            let _ = webview.hide();
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
            tauri::async_runtime::spawn(async move {
                if let Err(error) = complete_login(app.clone(), shared.clone(), region).await {
                    shared.lock().unwrap().login_error = Some(error);
                    if let Some(w) = app.get_webview_window("xiaomi-login") {
                        let _ = w.destroy();
                    }
                }
            });
        }
    })
    .build()
    .map_err(|_| "無法開啟官方登入視窗")?;
    Ok(())
}
pub async fn finish_login(
    app: tauri::AppHandle,
    state: Shared,
    region: String,
) -> Result<(), String> {
    complete_login(app, state.clone(), region).await
}
async fn complete_login(
    app: tauri::AppHandle,
    state: Shared,
    region: String,
) -> Result<(), String> {
    if !["cn", "sg", "de", "us", "ru", "i2"].contains(&region.as_str()) {
        return Err("不支援的服務地區".into());
    }
    {
        let mut s = state.lock().map_err(|_| "狀態不可用")?;
        if s.busy || s.credentials.is_some() {
            return Err("請先完成目前操作或登出".into());
        }
        s.busy = true;
        s.login_error = None;
    }
    let result = account::fetch_devices(&app, &region).await;
    let mut s = state.lock().map_err(|_| "狀態不可用")?;
    s.busy = false;
    services::finish_login(&mut s, result?, region)?;
    if let Some(w) = app.get_webview_window("xiaomi-login") {
        let _ = w.destroy();
    }
    Ok(())
}
