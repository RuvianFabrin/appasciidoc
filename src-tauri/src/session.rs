//! Estado de sessão por workspace (tarefa 38): notas abertas, nota ativa,
//! largura da barra lateral, pastas expandidas.
//! Guardado em `<app_config_dir>/sessions/<hash>.json`.

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkspaceSession {
    pub open_files: Vec<String>,
    pub active_file: Option<String>,
    pub pinned_files: Vec<String>,
    pub sidebar_width: u32,
    pub expanded_dirs: Vec<String>,
    pub show_all_files: bool,
}

fn session_path(app: &tauri::AppHandle, root: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("sem diretorio de config: {e}"))?
        .join("sessions");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut h = DefaultHasher::new();
    root.to_lowercase().hash(&mut h);
    Ok(dir.join(format!("{:016x}.json", h.finish())))
}

#[tauri::command]
pub fn read_session(app: tauri::AppHandle, root: String) -> WorkspaceSession {
    let Ok(path) = session_path(&app, &root) else {
        return WorkspaceSession::default();
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn write_session(
    app: tauri::AppHandle,
    root: String,
    session: WorkspaceSession,
) -> Result<(), String> {
    let path = session_path(&app, &root)?;
    let text = serde_json::to_string_pretty(&session).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| format!("nao foi possivel gravar sessão: {e}"))
}
