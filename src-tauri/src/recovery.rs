//! Rascunhos de recuperacao (tarefa 13).
//!
//! Quando o app fecha com alteracoes nao salvas, o conteudo vai para
//! `<app_config_dir>/recovery/<chave>.adoc` com um `<chave>.json` de metadados.
//! No proximo boot o frontend lista os rascunhos e oferece restaurar/descartar.

use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryMeta {
    pub key: String,
    /// Caminho original, se a nota ja tinha sido salva alguma vez.
    pub original_path: Option<String>,
    pub saved_at_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryEntry {
    #[serde(flatten)]
    pub meta: RecoveryMeta,
    pub content: String,
}

fn recovery_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("sem diretorio de config: {e}"))?
        .join("recovery");
    fs::create_dir_all(&dir).map_err(|e| format!("nao foi possivel criar {dir:?}: {e}"))?;
    Ok(dir)
}

fn key_for(original_path: &Option<String>) -> String {
    match original_path {
        Some(p) => {
            let mut h = DefaultHasher::new();
            p.hash(&mut h);
            format!("f{:016x}", h.finish())
        }
        None => "untitled".to_string(),
    }
}

#[tauri::command]
pub fn save_recovery(
    app: tauri::AppHandle,
    original_path: Option<String>,
    content: String,
) -> Result<String, String> {
    let dir = recovery_dir(&app)?;
    let key = key_for(&original_path);
    let saved_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    fs::write(dir.join(format!("{key}.adoc")), content)
        .map_err(|e| format!("falha ao gravar rascunho: {e}"))?;
    let meta = RecoveryMeta {
        key: key.clone(),
        original_path,
        saved_at_ms,
    };
    fs::write(
        dir.join(format!("{key}.json")),
        serde_json::to_string_pretty(&meta).unwrap_or_default(),
    )
    .map_err(|e| format!("falha ao gravar metadados do rascunho: {e}"))?;

    Ok(key)
}

#[tauri::command]
pub fn list_recovery(app: tauri::AppHandle) -> Result<Vec<RecoveryEntry>, String> {
    let dir = recovery_dir(&app)?;
    let mut out = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| format!("nao foi possivel ler {dir:?}: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(meta_text) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(meta) = serde_json::from_str::<RecoveryMeta>(&meta_text) else {
            continue;
        };
        let content =
            fs::read_to_string(dir.join(format!("{}.adoc", meta.key))).unwrap_or_default();
        out.push(RecoveryEntry { meta, content });
    }
    out.sort_by_key(|e| std::cmp::Reverse(e.meta.saved_at_ms));
    Ok(out)
}

#[tauri::command]
pub fn discard_recovery(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let dir = recovery_dir(&app)?;
    let _ = fs::remove_file(dir.join(format!("{key}.adoc")));
    let _ = fs::remove_file(dir.join(format!("{key}.json")));
    Ok(())
}
