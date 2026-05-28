use crate::core::dialog::{pick_directory, DirectoryPickerRequest};

#[tauri::command]
pub fn pick_directory_dialog(request: DirectoryPickerRequest) -> Option<String> {
    pick_directory(request)
}
