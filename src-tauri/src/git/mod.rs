//! Operações locais do Git. Todas passam pelo mesmo mutex para serializar libgit2.

mod remote;
mod repo;
mod sync;

use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

#[derive(Default)]
pub struct GitState {
    pub(crate) operation: Mutex<()>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub initialized: bool,
    pub branch: Option<String>,
    pub changed: usize,
    pub staged: usize,
    pub unstaged: usize,
    pub untracked: usize,
    pub ahead: usize,
    pub behind: usize,
}

#[tauri::command]
pub fn git_status(state: State<'_, GitState>, root: String) -> Result<GitStatus, String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível após um erro interno".to_string())?;
    repo::status(&root)
}

#[tauri::command]
pub fn git_remote_test(
    state: State<'_, GitState>,
    root: String,
    name: String,
    url: String,
    username: String,
    token: String,
) -> Result<(), String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível após um erro interno".to_string())?;
    remote::test(&root, &name, &url, &username, &token)
}

#[tauri::command]
pub fn git_remote_set(
    state: State<'_, GitState>,
    root: String,
    name: String,
    url: String,
) -> Result<(), String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível após um erro interno".to_string())?;
    remote::set(&root, &name, &url)
}

#[tauri::command]
pub fn git_preview(
    state: State<'_, GitState>,
    root: String,
    name: String,
    username: String,
    token: String,
) -> Result<sync::GitPreview, String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível após um erro interno".to_string())?;
    sync::preview(&root, &name, &username, &token)
}

#[tauri::command]
pub fn git_sync(
    state: State<'_, GitState>,
    root: String,
    name: String,
    url: String,
    username: String,
    token: String,
) -> Result<sync::GitSyncResult, String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível após um erro interno".to_string())?;
    sync::sync(&root, &name, &url, &username, &token)
}
