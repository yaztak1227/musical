use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT_TEMP_FILE_ID: AtomicU64 = AtomicU64::new(0);

pub fn write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let temporary_path = temporary_path(path)?;
    fs::write(&temporary_path, bytes)?;
    if let Err(error) = replace(&temporary_path, path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }
    Ok(())
}

fn temporary_path(path: &Path) -> std::io::Result<PathBuf> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, "invalid file path")
        })?;
    let sequence = NEXT_TEMP_FILE_ID.fetch_add(1, Ordering::Relaxed);
    Ok(path.with_file_name(format!(
        ".{file_name}.{}-{sequence}.tmp",
        std::process::id()
    )))
}

#[cfg(not(windows))]
fn replace(temporary_path: &Path, destination_path: &Path) -> std::io::Result<()> {
    fs::rename(temporary_path, destination_path)
}

#[cfg(windows)]
fn replace(temporary_path: &Path, destination_path: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let temporary_path = temporary_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination_path = destination_path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let replaced = unsafe {
        MoveFileExW(
            temporary_path.as_ptr(),
            destination_path.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if replaced == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::write;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn atomically_replaces_existing_file() {
        let root = std::env::temp_dir().join(format!(
            "musical-atomic-file-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("create fixture directory");
        let path = root.join("settings.json");
        fs::write(&path, b"old").expect("write original");

        write(&path, b"new").expect("replace file");

        assert_eq!(fs::read(&path).expect("read replaced file"), b"new");
        fs::remove_dir_all(root).expect("remove fixture directory");
    }
}
