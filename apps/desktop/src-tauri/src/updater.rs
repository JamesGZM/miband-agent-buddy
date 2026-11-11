//! Fixed-repository macOS updates. Remote data never selects commands or local paths.
use reqwest::{Client, redirect::Policy};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    time::Duration,
};
use tauri::Manager;

const PROJECT: &str = "https://github.com/JamesGZM/miband-agent-buddy";
const LATEST: &str = "https://api.github.com/repos/JamesGZM/miband-agent-buddy/releases/latest";
const APP_NAME: &str = "MiBand Agent Buddy.app";
const MAX_DOWNLOAD: u64 = 300 * 1024 * 1024;
const MAX_EXPANDED: u64 = 1024 * 1024 * 1024;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateView {
    status: &'static str,
    current_version: &'static str,
    latest_version: Option<String>,
    progress: u8,
    error: Option<&'static str>,
    release_url: Option<String>,
    can_install: bool,
}
impl Default for UpdateView {
    fn default() -> Self {
        Self {
            status: "idle",
            current_version: env!("CARGO_PKG_VERSION"),
            latest_version: None,
            progress: 0,
            error: None,
            release_url: None,
            can_install: false,
        }
    }
}
#[derive(Default)]
struct UpdateState {
    view: UpdateView,
    asset: Option<Asset>,
    staged: Option<PathBuf>,
}
#[derive(Default)]
pub struct UpdateCache(Mutex<UpdateState>);
#[derive(Clone, Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
    size: u64,
    digest: Option<String>,
}
#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}

type Result<T> = std::result::Result<T, &'static str>;
fn version(text: &str) -> Option<[u64; 3]> {
    let text = text.strip_prefix('v').unwrap_or(text);
    let fields: Vec<_> = text.split('.').collect();
    if fields.len() != 3 {
        return None;
    }
    let mut result = [0; 3];
    for (i, field) in fields.iter().enumerate() {
        if field.is_empty()
            || field.len() > 9
            || !field.bytes().all(|c| c.is_ascii_digit())
            || (field.len() > 1 && field.starts_with('0'))
        {
            return None;
        }
        result[i] = field.parse().ok()?;
    }
    Some(result)
}
fn asset_name(arch: &str) -> Option<String> {
    let arch = match arch {
        "aarch64" => "arm64",
        "x86_64" => "x64",
        _ => return None,
    };
    Some(format!("MiBand-Agent-Buddy-macos-{arch}.zip"))
}
fn digest(asset: &Asset) -> Result<&str> {
    let value = asset
        .digest
        .as_deref()
        .and_then(|s| s.strip_prefix("sha256:"))
        .ok_or("checksum_missing")?;
    if value.len() != 64 || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("checksum_missing");
    }
    Ok(value)
}
fn trusted_url(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };
    url.scheme() == "https"
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(
            url.host_str(),
            Some(
                "api.github.com"
                    | "github.com"
                    | "release-assets.githubusercontent.com"
                    | "objects.githubusercontent.com"
            )
        )
}
fn release_state(release: Release, current: &str, arch: &str) -> Result<UpdateState> {
    let latest = version(&release.tag_name).ok_or("release_invalid")?;
    if release.draft || release.prerelease {
        return Err("release_invalid");
    }
    let mut state = UpdateState::default();
    state.view.latest_version = Some(release.tag_name.trim_start_matches('v').into());
    state.view.release_url = Some(format!("{PROJECT}/releases/tag/{}", release.tag_name));
    if latest <= version(current).ok_or("release_invalid")? {
        state.view.status = "current";
        return Ok(state);
    }
    let name = asset_name(arch).ok_or("platform_unsupported")?;
    let asset = release.assets.into_iter().find(|a| a.name == name);
    state.view.status = "unavailable";
    if let Some(asset) = asset {
        let expected = format!("{PROJECT}/releases/download/{}/{}", release.tag_name, name);
        if asset.browser_download_url != expected || asset.size == 0 || asset.size > MAX_DOWNLOAD {
            return Err("release_invalid");
        }
        digest(&asset)?;
        state.view.status = "available";
        state.view.can_install = true;
        state.asset = Some(asset);
    }
    Ok(state)
}
fn client() -> Result<Client> {
    Client::builder()
        .user_agent(concat!("MiBand-Agent-Buddy/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(180))
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || !trusted_url(attempt.url().as_str()) {
                attempt.error("untrusted update redirect")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|_| "network_error")
}
fn mutate(app: &tauri::AppHandle, f: impl FnOnce(&mut UpdateState)) {
    if let Some(cache) = app.try_state::<UpdateCache>() {
        if let Ok(mut state) = cache.0.lock() {
            f(&mut state);
        }
    }
}
pub fn view(app: &tauri::AppHandle) -> serde_json::Value {
    let view = app
        .try_state::<UpdateCache>()
        .and_then(|c| c.0.lock().ok().map(|s| s.view.clone()))
        .unwrap_or_default();
    serde_json::to_value(view).unwrap_or_default()
}
fn error(app: &tauri::AppHandle, code: &'static str) {
    mutate(app, |state| {
        state.view.status = "error";
        state.view.error = Some(code);
        state.view.can_install = false;
    });
}
fn begin(app: &tauri::AppHandle, status: &'static str) -> std::result::Result<(), String> {
    let cache = app.state::<UpdateCache>();
    let mut state = cache.0.lock().map_err(|_| "update_busy")?;
    if matches!(state.view.status, "checking" | "downloading" | "installing") {
        return Err("update_busy".into());
    }
    state.view.status = status;
    state.view.error = None;
    state.view.progress = 0;
    Ok(())
}
pub fn check(app: tauri::AppHandle) -> std::result::Result<(), String> {
    begin(&app, "checking")?;
    let previous = {
        let cache = app.state::<UpdateCache>();
        let mut state = cache.0.lock().map_err(|_| "update_busy")?;
        state.asset = None;
        state.view.can_install = false;
        state.staged.take()
    };
    tauri::async_runtime::spawn(async move {
        if let Some(staged) = previous {
            if let (Some(directory), Ok(parent)) = (staged.parent(), app.path().app_data_dir()) {
                if directory.parent() == Some(parent.as_path())
                    && directory
                        .file_name()
                        .is_some_and(|n| n.to_string_lossy().starts_with("update-"))
                {
                    let owned = directory.to_owned();
                    let _ = tauri::async_runtime::spawn_blocking(move || fs::remove_dir_all(owned))
                        .await;
                }
            }
        }
        let result = async {
            let mut response = client()?
                .get(LATEST)
                .header("Accept", "application/vnd.github+json")
                .send()
                .await
                .map_err(|_| "network_error")?;
            if response.status() == 404 {
                return Ok(UpdateState {
                    view: UpdateView {
                        status: "unpublished",
                        ..Default::default()
                    },
                    ..Default::default()
                });
            }
            if response.status() == 403 || response.status() == 429 {
                return Err("rate_limited");
            }
            if !response.status().is_success() {
                return Err("network_error");
            }
            let mut data = Vec::new();
            while let Some(chunk) = response.chunk().await.map_err(|_| "network_error")? {
                if data.len() + chunk.len() > 2 * 1024 * 1024 {
                    return Err("release_invalid");
                }
                data.extend_from_slice(&chunk);
            }
            let release = serde_json::from_slice(&data).map_err(|_| "release_invalid")?;
            release_state(release, env!("CARGO_PKG_VERSION"), std::env::consts::ARCH)
        }
        .await;
        match result {
            Ok(next) => mutate(&app, |s| *s = next),
            Err(code) => error(&app, code),
        }
    });
    Ok(())
}
fn private_dir(parent: &Path) -> Result<PathBuf> {
    use std::os::unix::fs::DirBuilderExt;
    let path = parent.join(format!("update-{:016x}", rand::random::<u64>()));
    fs::DirBuilder::new()
        .mode(0o700)
        .create(&path)
        .map_err(|_| "storage_error")?;
    Ok(path)
}
pub fn download(app: tauri::AppHandle) -> std::result::Result<(), String> {
    let asset = {
        let cache = app.state::<UpdateCache>();
        let state = cache.0.lock().map_err(|_| "update_busy")?;
        if state.view.status != "available" {
            return Err("update_not_ready".into());
        }
        state.asset.clone().ok_or("update_not_ready")?
    };
    begin(&app, "downloading")?;
    tauri::async_runtime::spawn(async move {
        let result = async {
            let parent = app.path().app_data_dir().map_err(|_| "storage_error")?;
            let directory = private_dir(&parent)?;
            let result = async {
                let mut response = client()?
                    .get(&asset.browser_download_url)
                    .send()
                    .await
                    .map_err(|_| "network_error")?;
                if !response.status().is_success() {
                    return Err("network_error");
                }
                let archive = directory.join("update.zip");
                let mut file = fs::File::create(&archive).map_err(|_| "storage_error")?;
                let mut count = 0u64;
                let mut hash = Sha256::new();
                while let Some(chunk) = response.chunk().await.map_err(|_| "network_error")? {
                    count = count
                        .checked_add(chunk.len() as u64)
                        .ok_or("download_invalid")?;
                    if count > asset.size || count > MAX_DOWNLOAD {
                        return Err("download_invalid");
                    }
                    hash.update(&chunk);
                    file.write_all(&chunk).map_err(|_| "storage_error")?;
                    mutate(&app, |s| {
                        s.view.progress = ((count * 100) / asset.size).min(99) as u8
                    });
                }
                file.sync_all().map_err(|_| "storage_error")?;
                if count != asset.size
                    || format!("{:x}", hash.finalize()) != digest(&asset)?.to_ascii_lowercase()
                {
                    return Err("checksum_mismatch");
                }
                let expected = app
                    .state::<UpdateCache>()
                    .0
                    .lock()
                    .map_err(|_| "update_busy")?
                    .view
                    .latest_version
                    .clone()
                    .ok_or("release_invalid")?;
                let target = directory.clone();
                let staged = tauri::async_runtime::spawn_blocking(move || {
                    let bundle = extract(&archive, &target)?;
                    validate_bundle(&bundle, &expected)?;
                    Ok::<_, &'static str>(bundle)
                })
                .await
                .map_err(|_| "package_invalid")??;
                Ok(staged)
            }
            .await;
            if result.is_err() {
                let _ = fs::remove_dir_all(&directory);
            }
            result
        }
        .await;
        match result {
            Ok(path) => mutate(&app, |s| {
                s.staged = Some(path);
                s.view.status = "ready";
                s.view.progress = 100;
                s.view.can_install = true;
            }),
            Err(code) => error(&app, code),
        }
    });
    Ok(())
}
fn extract(archive: &Path, directory: &Path) -> Result<PathBuf> {
    use std::os::unix::fs::PermissionsExt;
    let file = fs::File::open(archive).map_err(|_| "storage_error")?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "package_invalid")?;
    if zip.len() > 10000 {
        return Err("package_invalid");
    }
    let mut total = 0u64;
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(|_| "package_invalid")?;
        let relative = entry.enclosed_name().ok_or("package_invalid")?.to_owned();
        if relative
            .components()
            .any(|part| !matches!(part, std::path::Component::Normal(_)))
        {
            return Err("package_invalid");
        }
        if relative.components().next().map(|c| c.as_os_str())
            != Some(std::ffi::OsStr::new(APP_NAME))
        {
            return Err("package_invalid");
        }
        let mode = entry.unix_mode().unwrap_or(0o644);
        if mode & 0o170000 != 0 && !matches!(mode & 0o170000, 0o040000 | 0o100000) {
            return Err("package_invalid");
        }
        total = total.checked_add(entry.size()).ok_or("package_invalid")?;
        if total > MAX_EXPANDED {
            return Err("package_invalid");
        }
        let path = directory.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&path).map_err(|_| "storage_error")?;
        } else {
            fs::create_dir_all(path.parent().ok_or("package_invalid")?)
                .map_err(|_| "storage_error")?;
            let mut output = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
                .map_err(|_| "package_invalid")?;
            let declared = entry.size();
            let copied = std::io::copy(&mut (&mut entry).take(declared + 1), &mut output)
                .map_err(|_| "package_invalid")?;
            if copied != declared {
                return Err("package_invalid");
            }
            fs::set_permissions(&path, fs::Permissions::from_mode(mode & 0o777))
                .map_err(|_| "storage_error")?;
        }
    }
    Ok(directory.join(APP_NAME))
}
fn plist(bundle: &Path, key: &str) -> Result<String> {
    let result = Command::new("/usr/libexec/PlistBuddy")
        .args(["-c", &format!("Print :{key}")])
        .arg(bundle.join("Contents/Info.plist"))
        .output()
        .map_err(|_| "package_invalid")?;
    if !result.status.success() || result.stdout.len() > 1024 {
        return Err("package_invalid");
    }
    String::from_utf8(result.stdout)
        .map(|v| v.trim().into())
        .map_err(|_| "package_invalid")
}
// Read only the bounded Mach-O header; installed apps must not need Xcode tools.
fn supports_architecture(header: &[u8], arch: &str) -> bool {
    let expected = match arch {
        "aarch64" => 0x0100000c,
        "x86_64" => 0x01000007,
        _ => return false,
    };
    if header.len() < 8 {
        return false;
    }
    let read = |offset: usize, little: bool| -> Option<u32> {
        let bytes: [u8; 4] = header.get(offset..offset + 4)?.try_into().ok()?;
        Some(if little {
            u32::from_le_bytes(bytes)
        } else {
            u32::from_be_bytes(bytes)
        })
    };
    match &header[..4] {
        [0xcf, 0xfa, 0xed, 0xfe] => read(4, true) == Some(expected),
        [0xfe, 0xed, 0xfa, 0xcf] => read(4, false) == Some(expected),
        magic => {
            let (little, stride) = match magic {
                [0xca, 0xfe, 0xba, 0xbe] => (false, 20),
                [0xbe, 0xba, 0xfe, 0xca] => (true, 20),
                [0xca, 0xfe, 0xba, 0xbf] => (false, 32),
                [0xbf, 0xba, 0xfe, 0xca] => (true, 32),
                _ => return false,
            };
            let count = read(4, little).unwrap_or(0) as usize;
            if count == 0 || count > 32 || header.len() < 8 + count * stride {
                return false;
            }
            (0..count).any(|i| read(8 + i * stride, little) == Some(expected))
        }
    }
}
fn validate_bundle(bundle: &Path, expected: &str) -> Result<()> {
    if plist(bundle, "CFBundleIdentifier")? != "io.github.jamesgzm.miband-agent-buddy"
        || plist(bundle, "CFBundleShortVersionString")? != expected
        || plist(bundle, "CFBundleExecutable")? != "miband-agent-buddy"
    {
        return Err("package_invalid");
    }
    let runtime = bundle.join("Contents/Resources/runtime");
    for path in [
        "bin/node",
        "services/runtime/bin/buddy-runtime.mjs",
        "packages/buddy-shared/protocol/snapshot.js",
        "native/transport/target/debug/buddy-transport",
        "dist/buddy.debug.rpk",
        "dist/buddy-package.json",
        "package.json",
    ] {
        if !runtime.join(path).is_file() {
            return Err("package_invalid");
        }
    }
    for binary in [
        bundle.join("Contents/MacOS/miband-agent-buddy"),
        runtime.join("bin/node"),
        runtime.join("native/transport/target/debug/buddy-transport"),
    ] {
        let mut header = Vec::new();
        fs::File::open(binary)
            .map_err(|_| "package_invalid")?
            .take(4096)
            .read_to_end(&mut header)
            .map_err(|_| "package_invalid")?;
        if !supports_architecture(&header, std::env::consts::ARCH) {
            return Err("package_invalid");
        }
    }
    let status = Command::new("/usr/bin/codesign")
        .args(["--verify", "--deep", "--strict"])
        .arg(bundle)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|_| "package_invalid")?;
    if !status.success() {
        return Err("package_invalid");
    }
    Ok(())
}
const INSTALL_SCRIPT: &str = include_str!("update-install.sh");
fn claim_install(state: &mut UpdateState) -> Result<(PathBuf, String)> {
    if state.view.status != "ready" {
        return Err("update_not_ready");
    }
    let staged = state.staged.clone().ok_or("update_not_ready")?;
    let expected = state
        .view
        .latest_version
        .clone()
        .ok_or("update_not_ready")?;
    state.view.status = "installing";
    state.view.can_install = false;
    Ok((staged, expected))
}
pub fn install(app: tauri::AppHandle) -> std::result::Result<(), String> {
    let (staged, expected) = {
        let cache = app.state::<UpdateCache>();
        let mut state = cache.0.lock().map_err(|_| "update_busy")?;
        claim_install(&mut state)?
    };
    let result = (|| {
        validate_bundle(&staged, &expected)?;
        let executable = std::env::current_exe().map_err(|_| "install_location")?;
        let bundle = executable.ancestors().nth(3).ok_or("install_location")?;
        if bundle.extension().and_then(|s| s.to_str()) != Some("app")
            || bundle.to_string_lossy().contains("/AppTranslocation/")
        {
            return Err("install_location");
        }
        let parent = bundle.parent().ok_or("install_location")?;
        let stage = private_dir(parent).map_err(|_| "install_location")?;
        let next = stage.join(APP_NAME);
        let status = Command::new("/usr/bin/ditto")
            .arg(&staged)
            .arg(&next)
            .status()
            .map_err(|_| "storage_error")?;
        if !status.success() {
            let _ = fs::remove_dir_all(&stage);
            return Err("storage_error");
        }
        validate_bundle(&next, &expected)?;
        // Only remove the owned download cache once its verified sibling copy is ready.
        if let (Some(directory), Ok(parent)) = (staged.parent(), app.path().app_data_dir()) {
            if directory.parent() == Some(parent.as_path())
                && directory
                    .file_name()
                    .is_some_and(|n| n.to_string_lossy().starts_with("update-"))
            {
                let _ = fs::remove_dir_all(directory);
            }
        }
        let helper = stage.join("install.sh");
        fs::write(&helper, INSTALL_SCRIPT).map_err(|_| "storage_error")?;
        let backup = parent.join(format!(
            "MiBand Agent Buddy.previous-{:016x}.app",
            rand::random::<u64>()
        ));
        Command::new("/bin/sh")
            .arg(&helper)
            .arg(std::process::id().to_string())
            .arg(bundle)
            .arg(&next)
            .arg(&backup)
            .arg("/usr/bin/open")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "install_failed")?;
        Ok(())
    })();
    if let Err(code) = result {
        error(&app, code);
        return Err(code.into());
    }
    mutate(&app, |s| s.view.status = "installing");
    app.exit(0);
    Ok(())
}
fn open(url: &str) -> std::result::Result<(), String> {
    Command::new("/usr/bin/open")
        .arg(url)
        .status()
        .map_err(|_| "open_failed".to_string())?
        .success()
        .then_some(())
        .ok_or("open_failed".into())
}
pub fn open_project() -> std::result::Result<(), String> {
    open(PROJECT)
}
pub fn open_release(app: &tauri::AppHandle) -> std::result::Result<(), String> {
    let cache = app.state::<UpdateCache>();
    let state = cache.0.lock().map_err(|_| "update_busy")?;
    open(state.view.release_url.as_deref().unwrap_or(concat!(
        "https://github.com/JamesGZM/miband-agent-buddy",
        "/releases"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stable_versions_compare_numerically_and_reject_injected_tags() {
        assert!(version("v0.10.0") > version("0.9.9"));
        for bad in ["v1.2", "1.2.3-beta", "1.02.3", "1.2.3/x", "1.2.3\n"] {
            assert_eq!(version(bad), None);
        }
    }
    fn release(asset: bool) -> Release {
        Release {
            tag_name: "v0.6.0".into(),
            draft: false,
            prerelease: false,
            assets: if asset {
                vec![Asset {
                    name: asset_name("aarch64").unwrap(),
                    browser_download_url: format!(
                        "{PROJECT}/releases/download/v0.6.0/MiBand-Agent-Buddy-macos-arm64.zip"
                    ),
                    size: 123,
                    digest: Some(format!("sha256:{}", "a".repeat(64))),
                }]
            } else {
                vec![]
            },
        }
    }
    #[test]
    fn updates_require_current_platform_asset_and_digest() {
        assert_eq!(
            release_state(release(true), "0.5.0", "aarch64")
                .unwrap()
                .view
                .status,
            "available"
        );
        assert_eq!(
            release_state(release(true), "0.6.0", "aarch64")
                .unwrap()
                .view
                .status,
            "current"
        );
        assert_eq!(
            release_state(release(true), "0.5.0", "x86_64")
                .unwrap()
                .view
                .status,
            "unavailable"
        );
        assert_eq!(
            release_state(release(false), "0.5.0", "aarch64")
                .unwrap()
                .view
                .can_install,
            false
        );
        let mut r = release(true);
        r.assets[0].digest = None;
        assert!(matches!(
            release_state(r, "0.5.0", "aarch64"),
            Err("checksum_missing")
        ));
    }
    #[test]
    fn redirects_require_fixed_https_hosts() {
        assert!(trusted_url(
            "https://release-assets.githubusercontent.com/a"
        ));
        for url in [
            "http://github.com/a",
            "https://github.com.evil.test/a",
            "https://user@github.com/a",
            "https://127.0.0.1/a",
            "https://github.com:8443/a",
        ] {
            assert!(!trusted_url(url));
        }
    }
    #[test]
    fn macho_architecture_check_handles_thin_universal_and_truncated_headers() {
        let thin = [0xcf, 0xfa, 0xed, 0xfe, 0x0c, 0, 0, 1];
        assert!(supports_architecture(&thin, "aarch64"));
        assert!(!supports_architecture(&thin, "x86_64"));
        let mut fat = vec![0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2];
        fat.extend_from_slice(&[1, 0, 0, 7]);
        fat.extend_from_slice(&[0; 16]);
        fat.extend_from_slice(&[1, 0, 0, 12]);
        fat.extend_from_slice(&[0; 16]);
        assert!(supports_architecture(&fat, "x86_64"));
        assert!(supports_architecture(&fat, "aarch64"));
        assert!(!supports_architecture(&fat[..20], "x86_64"));
        assert!(!supports_architecture(b"not an executable", "aarch64"));
    }
    #[test]
    fn extraction_rejects_traversal_symlinks_and_duplicate_entries() {
        use zip::write::FileOptions;
        for names in [
            vec!["../escape"],
            vec!["MiBand Agent Buddy.app/../escape"],
            vec!["Other.app/file"],
            vec!["MiBand Agent Buddy.app/file", "MiBand Agent Buddy.app/file"],
        ] {
            let dir = private_dir(&std::env::temp_dir()).unwrap();
            let file = fs::File::create(dir.join("update.zip")).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            for name in names {
                zip.start_file(name, FileOptions::default()).unwrap();
                zip.write_all(b"fixture").unwrap();
            }
            zip.finish().unwrap();
            assert!(extract(&dir.join("update.zip"), &dir).is_err());
            fs::remove_dir_all(dir).unwrap();
        }
        let dir = private_dir(&std::env::temp_dir()).unwrap();
        let file = fs::File::create(dir.join("update.zip")).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.add_symlink(
            "MiBand Agent Buddy.app/link",
            "../../outside",
            FileOptions::default(),
        )
        .unwrap();
        zip.finish().unwrap();
        assert!(extract(&dir.join("update.zip"), &dir).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn valid_archive_preserves_executable_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = private_dir(&std::env::temp_dir()).unwrap();
        let file = fs::File::create(dir.join("update.zip")).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file(
            "MiBand Agent Buddy.app/Contents/MacOS/miband-agent-buddy",
            zip::write::FileOptions::default().unix_permissions(0o755),
        )
        .unwrap();
        zip.write_all(b"synthetic executable").unwrap();
        zip.finish().unwrap();
        let bundle = extract(&dir.join("update.zip"), &dir).unwrap();
        let binary = bundle.join("Contents/MacOS/miband-agent-buddy");
        assert_eq!(fs::read(&binary).unwrap(), b"synthetic executable");
        assert_eq!(
            fs::metadata(binary).unwrap().permissions().mode() & 0o777,
            0o755
        );
        assert_eq!(validate_bundle(&bundle, "0.6.0"), Err("package_invalid"));
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn installer_replaces_bundle_and_restores_backup_when_open_fails() {
        for (opener, success) in [("/usr/bin/true", true), ("/usr/bin/false", false)] {
            let dir = private_dir(&std::env::temp_dir()).unwrap();
            let current = dir.join("Current app.app");
            let next = dir.join("Next app.app");
            let backup = dir.join("Backup app.app");
            fs::create_dir(&current).unwrap();
            fs::create_dir(&next).unwrap();
            fs::write(current.join("version"), "old").unwrap();
            fs::write(next.join("version"), "new").unwrap();
            let helper = dir.join("install.sh");
            fs::write(&helper, INSTALL_SCRIPT).unwrap();
            // Reap a real child first, so the helper never waits on a live test process.
            let mut dead = Command::new("/usr/bin/true").spawn().unwrap();
            let pid = dead.id();
            dead.wait().unwrap();
            let result = Command::new("/bin/sh")
                .arg(helper)
                .arg(pid.to_string())
                .arg(&current)
                .arg(&next)
                .arg(&backup)
                .arg(opener)
                .status()
                .unwrap();
            assert_eq!(result.success(), success);
            assert_eq!(
                fs::read_to_string(current.join("version")).unwrap(),
                if success { "new" } else { "old" }
            );
            assert_eq!(backup.exists(), success);
            if success {
                assert_eq!(fs::read_to_string(backup.join("version")).unwrap(), "old");
            }
            fs::remove_dir_all(dir).unwrap();
        }
    }
    #[test]
    fn installation_is_claimed_once_before_any_filesystem_work() {
        let mut state = UpdateState::default();
        state.view.status = "ready";
        state.view.latest_version = Some("0.6.0".into());
        state.staged = Some("synthetic/Update.app".into());
        assert!(claim_install(&mut state).is_ok());
        assert_eq!(state.view.status, "installing");
        assert_eq!(claim_install(&mut state), Err("update_not_ready"));
    }
    #[test]
    #[ignore = "requires the separately built macOS release archive"]
    fn built_archive_runs_from_a_relocated_directory() {
        let archive = PathBuf::from(
            std::env::var_os("BUDDY_TEST_ARCHIVE")
                .expect("set BUDDY_TEST_ARCHIVE to the packaged ZIP"),
        );
        let directory = private_dir(&std::env::temp_dir()).unwrap();
        let bundle = extract(&archive, &directory).unwrap();
        validate_bundle(&bundle, env!("CARGO_PKG_VERSION")).unwrap();
        let runtime = bundle.join("Contents/Resources/runtime");
        let module =
            url::Url::from_file_path(runtime.join("services/runtime/bin/buddy-runtime.mjs"))
                .unwrap();
        let result = Command::new(runtime.join("bin/node"))
            .args([
                "--input-type=module",
                "-e",
                "await import(process.argv[2]);",
                "validate-only",
                module.as_str(),
            ])
            .current_dir(&directory)
            .status()
            .unwrap();
        assert!(
            result.success(),
            "bundled runtime modules must resolve without the checkout"
        );
        assert_eq!(validate_bundle(&bundle, "999.0.0"), Err("package_invalid"));
        fs::remove_file(runtime.join("native/transport/target/debug/buddy-transport")).unwrap();
        assert_eq!(
            validate_bundle(&bundle, env!("CARGO_PKG_VERSION")),
            Err("package_invalid")
        );
        fs::remove_dir_all(directory).unwrap();
    }
}
