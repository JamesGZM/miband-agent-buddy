//! App-private files, not Keychain and not a claim of macOS App Sandbox isolation.
use std::{
    fs::{self, OpenOptions},
    io::Write,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::Path,
};
pub fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("資料路徑無效")?;
    fs::create_dir_all(parent).map_err(|_| "無法建立 App 資料目錄")?;
    fs::set_permissions(parent, fs::Permissions::from_mode(0o700))
        .map_err(|_| "無法設定 App 資料權限")?;
    let tmp = parent.join(format!(
        ".write-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&tmp)
            .map_err(|_| "無法建立私有資料檔")?;
        file.write_all(bytes).map_err(|_| "資料保存失敗")?;
        file.sync_all().map_err(|_| "資料保存失敗")?;
        fs::rename(&tmp, path).map_err(|_| "資料保存失敗")?;
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
            if !meta.is_file() || meta.permissions().mode() & 0o077 != 0 {
                return Err("認證檔權限不符合要求，請重新登入".into());
            }
            fs::read(path)
                .map(Some)
                .map_err(|_| "無法讀取認證資料".into())
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
        assert_eq!(
            fs::metadata(&p).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(&dir).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(read(&p).unwrap().unwrap(), b"{}");
        delete(&p).unwrap();
        assert!(read(&p).unwrap().is_none());
        fs::remove_dir(dir).unwrap();
    }
}
