use std::{cmp::Ordering, fmt, str::FromStr};

use anyhow::Context;

use crate::core::manifest::models::ToolkitManifest;

const DEFAULT_WINDOWS_MIN_VERSION: &str = "10.0.0";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowsVersion {
    pub major: u32,
    pub minor: u32,
    pub build: u32,
}

impl WindowsVersion {
    fn as_tuple(self) -> (u32, u32, u32) {
        (self.major, self.minor, self.build)
    }
}

impl FromStr for WindowsVersion {
    type Err = anyhow::Error;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let parts = value.split('.').collect::<Vec<_>>();
        if !(2..=3).contains(&parts.len()) {
            anyhow::bail!("Windows 版本格式无效：{}", value);
        }

        let major = parts[0]
            .parse::<u32>()
            .with_context(|| format!("解析 Windows 主版本失败：{}", value))?;
        let minor = parts[1]
            .parse::<u32>()
            .with_context(|| format!("解析 Windows 次版本失败：{}", value))?;
        let build = parts
            .get(2)
            .map(|part| {
                part.parse::<u32>()
                    .with_context(|| format!("解析 Windows build 失败：{}", value))
            })
            .transpose()?
            .unwrap_or(0);

        Ok(Self {
            major,
            minor,
            build,
        })
    }
}

impl fmt::Display for WindowsVersion {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}.{}.{}", self.major, self.minor, self.build)
    }
}

impl PartialOrd for WindowsVersion {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for WindowsVersion {
    fn cmp(&self, other: &Self) -> Ordering {
        self.as_tuple().cmp(&other.as_tuple())
    }
}

pub struct WindowsEnvironmentStatus {
    pub required: WindowsVersion,
    pub detected: Option<WindowsVersion>,
}

impl WindowsEnvironmentStatus {
    pub fn is_supported(&self) -> bool {
        self.detected
            .map(|detected| detected >= self.required)
            .unwrap_or(false)
    }

    pub fn detail(&self) -> String {
        match self.detected {
            Some(detected) if detected >= self.required => {
                format!("当前系统版本 {}，最低要求 {}", detected, self.required)
            }
            Some(detected) => format!("当前系统版本 {}，最低要求 {}", detected, self.required),
            None => format!(
                "Stage 1 当前仅支持 Windows 环境，最低要求 {}",
                self.required
            ),
        }
    }
}

pub fn windows_min_version(
    toolkit_manifest: Option<&ToolkitManifest>,
) -> anyhow::Result<WindowsVersion> {
    let configured = toolkit_manifest
        .and_then(|manifest| manifest.environment.as_ref())
        .and_then(|environment| environment.windows.as_ref())
        .map(|windows| windows.min_version.as_str())
        .unwrap_or(DEFAULT_WINDOWS_MIN_VERSION);

    configured.parse()
}

pub fn windows_environment_status(
    toolkit_manifest: Option<&ToolkitManifest>,
) -> anyhow::Result<WindowsEnvironmentStatus> {
    Ok(WindowsEnvironmentStatus {
        required: windows_min_version(toolkit_manifest)?,
        detected: current_windows_version()?,
    })
}

pub fn validate_windows_environment(toolkit_manifest: &ToolkitManifest) -> anyhow::Result<()> {
    let status = windows_environment_status(Some(toolkit_manifest))?;

    if status.detected.is_none() {
        anyhow::bail!("Stage 1 当前仅支持 Windows 环境");
    }

    if !status.is_supported() {
        anyhow::bail!("{}", status.detail());
    }

    Ok(())
}

#[cfg(target_os = "windows")]
pub fn current_windows_version() -> anyhow::Result<Option<WindowsVersion>> {
    #[repr(C)]
    #[allow(non_snake_case)]
    struct RtlOsVersionInfoW {
        dwOSVersionInfoSize: u32,
        dwMajorVersion: u32,
        dwMinorVersion: u32,
        dwBuildNumber: u32,
        dwPlatformId: u32,
        szCSDVersion: [u16; 128],
    }

    #[link(name = "ntdll")]
    extern "system" {
        fn RtlGetVersion(info: *mut RtlOsVersionInfoW) -> i32;
    }

    let mut info = RtlOsVersionInfoW {
        dwOSVersionInfoSize: std::mem::size_of::<RtlOsVersionInfoW>() as u32,
        dwMajorVersion: 0,
        dwMinorVersion: 0,
        dwBuildNumber: 0,
        dwPlatformId: 0,
        szCSDVersion: [0; 128],
    };

    let status = unsafe { RtlGetVersion(&mut info) };
    if status != 0 {
        anyhow::bail!("读取 Windows 系统版本失败：{}", status);
    }

    Ok(Some(WindowsVersion {
        major: info.dwMajorVersion,
        minor: info.dwMinorVersion,
        build: info.dwBuildNumber,
    }))
}

#[cfg(not(target_os = "windows"))]
pub fn current_windows_version() -> anyhow::Result<Option<WindowsVersion>> {
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::WindowsVersion;

    #[test]
    fn parses_windows_version_with_build() {
        let version: WindowsVersion = "10.0.19041".parse().unwrap();

        assert_eq!(version.major, 10);
        assert_eq!(version.minor, 0);
        assert_eq!(version.build, 19041);
    }

    #[test]
    fn parses_windows_version_without_build() {
        let version: WindowsVersion = "10.0".parse().unwrap();

        assert_eq!(version.build, 0);
    }

    #[test]
    fn compares_windows_versions() {
        let supported: WindowsVersion = "10.0.0".parse().unwrap();
        let unsupported: WindowsVersion = "6.3.9600".parse().unwrap();
        let newer: WindowsVersion = "10.0.19045".parse().unwrap();

        assert!(newer >= supported);
        assert!(unsupported < supported);
    }

    #[test]
    fn rejects_invalid_windows_version() {
        assert!("10".parse::<WindowsVersion>().is_err());
        assert!("10.x.0".parse::<WindowsVersion>().is_err());
    }
}
