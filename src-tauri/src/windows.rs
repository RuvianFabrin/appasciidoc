//! Registro das janelas abertas para "reabrir ao iniciar" (tarefa 66).
//!
//! Cada janela se registra no boot (`window_track`) e se desregistra ao fechar
//! (`window_untrack`), informando o workspace que tem aberto. A lista de
//! workspaces é gravada em `<app_config_dir>/last-windows.json` e **nunca é
//! apagada quando fica vazia** — assim ela preserva o conjunto que estava
//! aberto quando a última janela fechou. No próximo boot, a janela principal
//! chama `take_reopen_workspaces` (que lê e apaga o arquivo).
//!
//! Limitação conhecida: fechar janelas uma a uma antes da última reduz o
//! conjunto salvo às que ainda restavam.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::Manager;

#[derive(Default)]
pub struct WindowState(pub Mutex<HashMap<String, Option<String>>>);

fn file_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("last-windows.json"))
}

fn persist(app: &tauri::AppHandle, map: &HashMap<String, Option<String>>) {
    let mut list: Vec<String> = map.values().flatten().cloned().collect();
    list.sort();
    list.dedup();
    if list.is_empty() {
        return; // mantém o último conjunto não-vazio
    }
    if let Some(p) = file_path(app) {
        if let Ok(txt) = serde_json::to_string_pretty(&list) {
            let _ = fs::write(p, txt);
        }
    }
}

#[tauri::command]
pub fn window_track(
    app: tauri::AppHandle,
    state: tauri::State<'_, WindowState>,
    label: String,
    workspace: Option<String>,
) {
    let mut map = state.0.lock().unwrap();
    map.insert(label, workspace);
    persist(&app, &map);
}

#[tauri::command]
pub fn window_untrack(app: tauri::AppHandle, state: tauri::State<'_, WindowState>, label: String) {
    let mut map = state.0.lock().unwrap();
    map.remove(&label);
    persist(&app, &map);
}

#[tauri::command]
pub fn take_reopen_workspaces(app: tauri::AppHandle) -> Vec<String> {
    let Some(p) = file_path(&app) else {
        return Vec::new();
    };
    let out = fs::read_to_string(&p)
        .ok()
        .and_then(|t| serde_json::from_str::<Vec<String>>(&t).ok())
        .unwrap_or_default();
    let _ = fs::remove_file(&p);
    out
}
