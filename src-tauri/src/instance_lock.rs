#[cfg(target_os = "windows")]
use std::fs::OpenOptions;
#[cfg(target_os = "windows")]
use std::io::Write;
#[cfg(target_os = "windows")]
use std::path::PathBuf;
#[cfg(target_os = "windows")]
use std::os::windows::fs::OpenOptionsExt;

#[cfg(target_os = "windows")]
pub struct InstanceLockGuard {
    file: Option<std::fs::File>,
    path: PathBuf,
}

#[cfg(target_os = "windows")]
impl Drop for InstanceLockGuard {
    fn drop(&mut self) {
        self.file.take(); // Close the file handle to release the OS sharing lock
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(target_os = "windows")]
pub fn acquire_for_current_child_instance() -> Result<Option<InstanceLockGuard>, String> {
    let instance = crate::windows_instance::WindowsInstance::current();
    if instance.is_manager() {
        return Ok(None);
    }

    let lock_path = instance.lock_file_path();
    if let Some(parent) = lock_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            format!(
                "failed to create instance lock directory {}: {}",
                parent.display(),
                error
            )
        })?;
    }

    // Open the lock file with exclusive write access (share_access = 0).
    // If another process is holding the handle, this will fail with a sharing violation (PermissionDenied).
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .share_mode(0) // 0 = Exclusive access (no sharing)
        .open(&lock_path)
        .map_err(|error| {
            format!(
                "instance '{}' is already running (lock: {}, {})",
                instance.label(),
                lock_path.display(),
                error
            )
        })?;

    let _ = writeln!(file, "pid={}", std::process::id());

    Ok(Some(InstanceLockGuard {
        file: Some(file),
        path: lock_path,
    }))
}