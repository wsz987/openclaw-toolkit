use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
    process::{Command, Output},
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(target_os = "windows")]
const DETACHED_PROCESS: u32 = 0x00000008;
#[cfg(target_os = "windows")]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
#[cfg(target_os = "windows")]
const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x01000000;

pub fn background_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    suppress_console_window(&mut command);
    command
}

pub fn suppress_console_window(command: &mut Command) -> &mut Command {
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command
}

pub fn detach_from_parent_process(command: &mut Command) -> &mut Command {
    #[cfg(target_os = "windows")]
    command.creation_flags(
        CREATE_NO_WINDOW
            | DETACHED_PROCESS
            | CREATE_NEW_PROCESS_GROUP
            | CREATE_BREAKAWAY_FROM_JOB,
    );

    command
}

/// Rust can work with Win32 verbatim paths, but tools like npm parse them as
/// package specs and can turn `\\?\D:\...` into an invalid relative path.
pub fn process_friendly_path(path: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    return dunce::simplified(path).to_path_buf();

    #[cfg(not(target_os = "windows"))]
    path.to_path_buf()
}

pub fn process_friendly_path_string(path: &Path) -> String {
    process_friendly_path(path).to_string_lossy().to_string()
}

pub fn render_command_output(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut details = Vec::new();

    if !stdout.trim().is_empty() {
        details.push(format!("stdout:\n{}", truncate_output(&stdout)));
    }

    if !stderr.trim().is_empty() {
        details.push(format!("stderr:\n{}", truncate_output(&stderr)));
    }

    if details.is_empty() {
        String::new()
    } else {
        format!("\n{}", details.join("\n"))
    }
}

fn truncate_output(value: &str) -> String {
    const MAX_CHARS: usize = 4000;
    let trimmed = value.trim();
    if trimmed.chars().count() <= MAX_CHARS {
        return trimmed.to_string();
    }

    let mut truncated = trimmed.chars().take(MAX_CHARS).collect::<String>();
    truncated.push_str("\n...");
    truncated
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::process_friendly_path_string;

    #[cfg(target_os = "windows")]
    #[test]
    fn strips_windows_verbatim_drive_prefix() {
        assert_eq!(
            process_friendly_path_string(Path::new(r"\\?\D:\workspace\artifact.tgz")),
            r"D:\workspace\artifact.tgz"
        );
    }

    #[test]
    fn leaves_regular_paths_unchanged() {
        assert_eq!(
            process_friendly_path_string(Path::new(r"D:\workspace\artifact.tgz")),
            r"D:\workspace\artifact.tgz"
        );
    }
}
