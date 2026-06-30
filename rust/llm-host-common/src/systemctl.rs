use anyhow::{bail, Result};
use std::process::Command;

pub fn is_active(unit: &str) -> Result<String> {
    let out = Command::new("systemctl")
        .args(["--user", "is-active", unit])
        .output()?;
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

pub fn start(unit: &str) -> Result<()> {
    let out = Command::new("systemctl")
        .args(["--user", "start", unit])
        .output()?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        bail!("systemctl start {} failed: {}", unit, stderr.trim());
    }
    Ok(())
}

pub fn stop(unit: &str) -> Result<()> {
    let out = Command::new("systemctl")
        .args(["--user", "stop", unit])
        .output()?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        bail!("systemctl stop {} failed: {}", unit, stderr.trim());
    }
    Ok(())
}
