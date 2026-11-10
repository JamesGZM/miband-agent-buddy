use std::time::Duration;
pub fn trusted(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && url.host_str().is_some_and(|host| {
            host == "xiaomi.com"
                || host.ends_with(".xiaomi.com")
                || host == "mi.com"
                || host.ends_with(".mi.com")
        })
}
pub fn default_client_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() > 8 || !trusted(attempt.url()) {
                attempt.error("Untrusted redirect")
            } else {
                attempt.follow()
            }
        }))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn redirect_boundary() {
        for value in [
            "https://account.xiaomi.com/pass/serviceLogin",
            "https://sts-hlth.io.mi.com/healthapp/sts",
        ] {
            assert!(trusted(&value.parse().unwrap()));
        }
        for value in [
            "http://account.xiaomi.com",
            "https://xiaomi.com.evil.test",
            "https://evilxiaomi.com",
            "https://user@account.xiaomi.com",
            "https://account.xiaomi.com:444",
        ] {
            assert!(!trusted(&value.parse().unwrap()));
        }
    }
}
