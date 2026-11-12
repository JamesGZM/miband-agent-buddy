use std::{os::windows::ffi::OsStrExt, path::Path, ptr};
use windows_sys::Win32::{
    Foundation::LocalFree,
    Security::Cryptography::{
        CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData,
    },
    Storage::FileSystem::{MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW},
};

fn transform(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len().try_into().map_err(|_| "資料過大")?,
        pbData: bytes.as_ptr().cast_mut(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    // No machine-wide flag: only this Windows user can decrypt the data. Never
    // fall back to plaintext when the OS protection service rejects a request.
    let ok = unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                ptr::null(),
                ptr::null(),
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                ptr::null_mut(),
                ptr::null(),
                ptr::null(),
                ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if ok == 0 {
        return Err("無法保護或讀取認證資料，請重新登入".into());
    }
    let value = if output.cbData == 0 {
        Vec::new()
    } else {
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec()
    };
    unsafe {
        LocalFree(output.pbData.cast());
    }
    Ok(value)
}
pub fn protect(bytes: &[u8]) -> Result<Vec<u8>, String> {
    transform(bytes, true)
}
pub fn unprotect(bytes: &[u8]) -> Result<Vec<u8>, String> {
    transform(bytes, false)
}
pub fn replace(from: &Path, to: &Path) -> Result<(), String> {
    let wide = |p: &Path| {
        p.as_os_str()
            .encode_wide()
            .chain(Some(0))
            .collect::<Vec<u16>>()
    };
    let (from, to) = (wide(from), wide(to));
    // Replacement preserves the previous file on failure, unlike delete + rename.
    let ok = unsafe {
        MoveFileExW(
            from.as_ptr(),
            to.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        Err("資料保存失敗".into())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protection_roundtrip_and_corruption_rejection() {
        let plain = b"synthetic credential fixture";
        let mut encrypted = protect(plain).unwrap();
        assert_ne!(encrypted, plain);
        assert_eq!(unprotect(&encrypted).unwrap(), plain);
        encrypted[0] ^= 0xff;
        assert!(unprotect(&encrypted).is_err());
    }
}
