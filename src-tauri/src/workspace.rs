//! Operações de pasta/arquivo para o workspace (Fase 4).
//!
//! - `read_dir`: lista uma pasta (arquivos `.adoc`, `.age` + subpastas; opção "mostrar todos").
//! - operações: criar arquivo/pasta, renomear/mover, excluir.
//!
//! A leitura/escrita do conteúdo continua em `fs.rs`.

use std::fs;
use std::path::Path;

use serde::Serialize;
use tauri::State;

use crate::git::GitState;

pub fn norm(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

pub fn is_adoc(name: &str) -> bool {
    let l = name.to_lowercase();
    l.ends_with(".adoc")
        || l.ends_with(".asciidoc")
        || l.ends_with(".asc")
        || l.ends_with(".adoc.txt")
}

fn skip(name: &str) -> bool {
    name.starts_with('.') || matches!(name, "node_modules" | "target" | "$RECYCLE.BIN")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_adoc: bool,
    pub is_age: bool,
}

#[tauri::command]
pub fn read_dir(path: String, show_all: bool) -> Result<Vec<DirEntry>, String> {
    let mut out = Vec::new();
    let rd = fs::read_dir(&path).map_err(|e| format!("nao foi possivel ler {path}: {e}"))?;
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if skip(&name) {
            continue;
        }
        let p = entry.path();
        let is_dir = p.is_dir();
        let adoc = !is_dir && is_adoc(&name);
        let age = !is_dir && name.to_lowercase().ends_with(".age");
        if !is_dir && !adoc && !age && !show_all {
            continue;
        }
        out.push(DirEntry {
            name,
            path: norm(&p),
            is_dir,
            is_adoc: adoc,
            is_age: age,
        });
    }
    out.sort_by(|a, b| {
        (b.is_dir as u8)
            .cmp(&(a.is_dir as u8))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

#[tauri::command]
pub fn create_file(state: State<'_, GitState>, path: String) -> Result<String, String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível".to_string())?;
    let p = Path::new(&path);
    if p.exists() {
        return Err(format!("já existe: {path}"));
    }
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(p, "").map_err(|e| format!("nao foi possivel criar {path}: {e}"))?;
    Ok(norm(p))
}

#[tauri::command]
pub fn create_dir(state: State<'_, GitState>, path: String) -> Result<String, String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível".to_string())?;
    let p = Path::new(&path);
    fs::create_dir_all(p).map_err(|e| format!("nao foi possivel criar {path}: {e}"))?;
    Ok(norm(p))
}

#[tauri::command]
pub fn rename_path(state: State<'_, GitState>, from: String, to: String) -> Result<String, String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível".to_string())?;
    let dest = Path::new(&to);
    if dest.exists() {
        return Err(format!("destino já existe: {to}"));
    }
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::rename(&from, &to).map_err(|e| format!("nao foi possivel mover: {e}"))?;
    Ok(norm(dest))
}

#[tauri::command]
pub fn delete_path(state: State<'_, GitState>, path: String) -> Result<(), String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível".to_string())?;
    let p = Path::new(&path);
    let res = if p.is_dir() {
        fs::remove_dir_all(p)
    } else {
        fs::remove_file(p)
    };
    res.map_err(|e| format!("nao foi possivel excluir {path}: {e}"))
}
