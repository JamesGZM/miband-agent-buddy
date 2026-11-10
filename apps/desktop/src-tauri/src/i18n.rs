//! Native strings outside the web UI (tray menu, login window). The web UI owns its own catalog.

pub struct Labels {
    pub open: &'static str,
    pub wake: &'static str,
    pub pause: &'static str,
    pub resume: &'static str,
    pub disconnect: &'static str,
    pub quit: &'static str,
    pub login_title: &'static str,
    pub connected: &'static str,
    pub standby: &'static str,
    pub connecting: &'static str,
    pub installing: &'static str,
    pub disconnected: &'static str,
    pub paused: &'static str,
    pub no_device: &'static str,
}

/// Maps a saved choice (`system`, `zh-Hans`, `zh-Hant`, `en`) and the system's preferred tag to a language.
pub fn resolve(choice: &str, system: Option<&str>) -> &'static str {
    match choice {
        "zh-Hans" => "zh-Hans",
        "zh-Hant" => "zh-Hant",
        "en" => "en",
        _ => {
            let tag = system.unwrap_or_default().to_ascii_lowercase();
            if ["zh-hant", "zh-tw", "zh-hk", "zh-mo"]
                .iter()
                .any(|p| tag.starts_with(p))
            {
                "zh-Hant"
            } else if tag.starts_with("zh") {
                "zh-Hans"
            } else {
                "en"
            }
        }
    }
}

pub fn labels(language: &str) -> Labels {
    match language {
        "zh-Hans" => Labels {
            open: "打开主窗口",
            wake: "唤醒手环",
            pause: "暂停同步",
            resume: "恢复同步",
            disconnect: "断开连接",
            quit: "退出",
            login_title: "登录小米账号 · account.xiaomi.com",
            connected: "已连线",
            standby: "休眠中",
            connecting: "连线中",
            installing: "安装中",
            disconnected: "未连线",
            paused: "已暂停",
            no_device: "尚未选择手环",
        },
        "zh-Hant" => Labels {
            open: "打開主視窗",
            wake: "喚醒手環",
            pause: "暫停同步",
            resume: "恢復同步",
            disconnect: "中斷連線",
            quit: "退出",
            login_title: "登入小米帳號 · account.xiaomi.com",
            connected: "已連線",
            standby: "休眠中",
            connecting: "連線中",
            installing: "安裝中",
            disconnected: "未連線",
            paused: "已暫停",
            no_device: "尚未選擇手環",
        },
        _ => Labels {
            open: "Open Window",
            wake: "Wake Band",
            pause: "Pause Sync",
            resume: "Resume Sync",
            disconnect: "Disconnect",
            quit: "Quit",
            login_title: "Sign in with Xiaomi · account.xiaomi.com",
            connected: "Connected",
            standby: "Standby",
            connecting: "Connecting",
            installing: "Installing",
            disconnected: "Disconnected",
            paused: "Paused",
            no_device: "No band selected",
        },
    }
}

/// First entry of macOS `AppleLanguages`, e.g. `zh-Hans-CN`.
pub fn system_language() -> Option<String> {
    use std::sync::OnceLock;
    static CACHED: OnceLock<Option<String>> = OnceLock::new();
    CACHED
        .get_or_init(|| {
            let output = std::process::Command::new("/usr/bin/defaults")
                .args(["read", "-g", "AppleLanguages"])
                .output()
                .ok()?;
            let text = String::from_utf8(output.stdout).ok()?;
            text.lines()
                .map(|line| line.trim().trim_matches(|c| c == '"' || c == ',' || c == ' '))
                .find(|line| !line.is_empty() && *line != "(" && *line != ")")
                .map(str::to_string)
        })
        .clone()
}

pub fn current(choice: &str) -> &'static str {
    resolve(choice, system_language().as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_choice_wins_and_system_tags_map_to_supported_languages() {
        assert_eq!(resolve("en", Some("zh-Hant-TW")), "en");
        assert_eq!(resolve("system", Some("zh-Hans-CN")), "zh-Hans");
        assert_eq!(resolve("system", Some("zh-Hant-HK")), "zh-Hant");
        assert_eq!(resolve("system", Some("zh-TW")), "zh-Hant");
        assert_eq!(resolve("system", Some("ja-JP")), "en");
        assert_eq!(resolve("system", None), "en");
        assert_eq!(labels("zh-Hans").disconnect, "断开连接");
        assert_eq!(labels("zh-Hant").wake, "喚醒手環");
        assert_eq!(labels("en").resume, "Resume Sync");
    }
}
