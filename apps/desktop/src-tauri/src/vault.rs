//! Unix private files; Windows user-scoped DPAPI. No change to existing Mac storage.
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
};
#[cfg(windows)]
#[path = "vault_windows.rs"]
mod platform;
pub fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    write_with(path, bytes, true)
}

/// Preferences may skip fsync so theme switches stay responsive; credentials keep sync.
pub fn write_with(path: &Path, bytes: &[u8], sync: bool) -> Result<(), String> {
    let parent = path.parent().ok_or("資料路徑無效")?;
    fs::create_dir_all(parent).map_err(|_| "無法建立 App 資料目錄")?;
    #[cfg(unix)]
    fs::set_permissions(parent, fs::Permissions::from_mode(0o700))
        .map_err(|_| "無法設定 App 資料權限")?;
    #[cfg(windows)]
    let protected = platform::protect(bytes)?;
    #[cfg(windows)]
    let bytes = protected.as_slice();
    let tmp = parent.join(format!(
        ".write-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        options.mode(0o600);
        let mut file = options.open(&tmp).map_err(|_| "無法建立私有資料檔")?;
        file.write_all(bytes).map_err(|_| "資料保存失敗")?;
        if sync {
            file.sync_all().map_err(|_| "資料保存失敗")?;
        }
        drop(file);
        #[cfg(unix)]
        fs::rename(&tmp, path).map_err(|_| "資料保存失敗")?;
        #[cfg(windows)]
        platform::replace(&tmp, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}
pub fn read(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) => {
            if !meta.is_file() {
                return Err("認證檔權限不符合要求，請重新登入".into());
            }
            #[cfg(unix)]
            if meta.permissions().mode() & 0o077 != 0 {
                return Err("認證檔權限不符合要求，請重新登入".into());
            }
            let bytes = fs::read(path).map_err(|_| "無法讀取認證資料")?;
            #[cfg(windows)]
            let bytes = platform::unprotect(&bytes)?;
            Ok(Some(bytes))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("無法讀取認證資料".into()),
    }
}
pub fn delete(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err("無法清除認證資料".into()),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_atomic_roundtrip() {
        let dir = std::env::temp_dir().join(format!("buddy-vault-test-{}", std::process::id()));
        let p = dir.join("data.json");
        write(&p, b"{}").unwrap();
        #[cfg(unix)]
        assert_eq!(
            fs::metadata(&p).unwrap().permissions().mode() & 0o777,
            0o600
        );
        #[cfg(unix)]
        assert_eq!(
            fs::metadata(&dir).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(read(&p).unwrap().unwrap(), b"{}");
        write(&p, b"{\"updated\":true}").unwrap();
        assert_eq!(read(&p).unwrap().unwrap(), b"{\"updated\":true}");
        delete(&p).unwrap();
        assert!(read(&p).unwrap().is_none());
        fs::remove_dir(dir).unwrap();
    }
}
