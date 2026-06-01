use rfd::FileDialog;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryPickerRequest {
    pub title: Option<String>,
    pub default_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePickerRequest {
    pub title: Option<String>,
    pub default_path: Option<String>,
}

pub fn pick_directory(request: DirectoryPickerRequest) -> Option<String> {
    let mut dialog = FileDialog::new();

    if let Some(title) = request.title.as_deref() {
        dialog = dialog.set_title(title);
    }

    if let Some(default_path) = request.default_path.as_deref() {
        dialog = dialog.set_directory(default_path);
    }

    dialog
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

pub fn pick_file(request: FilePickerRequest) -> Option<String> {
    let mut dialog = FileDialog::new();

    if let Some(title) = request.title.as_deref() {
        dialog = dialog.set_title(title);
    }

    if let Some(default_path) = request.default_path.as_deref() {
        dialog = dialog.set_directory(default_path);
    }

    dialog
        .add_filter("Installed Manifest", &["json"])
        .pick_file()
        .map(|path| path.to_string_lossy().to_string())
}
