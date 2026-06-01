use crate::core::dialog::{pick_directory, pick_file, DirectoryPickerRequest, FilePickerRequest};

#[tauri::command]
pub fn pick_directory_dialog(request: DirectoryPickerRequest) -> Option<String> {
    pick_directory(request)
}

#[tauri::command]
pub fn pick_file_dialog(request: FilePickerRequest) -> Option<String> {
    pick_file(request)
}
