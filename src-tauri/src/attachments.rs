//! Pasta de anexos por nota (tarefa 83) e cópia/gravação de imagens (84 / 28).
//!
//! A pasta fica ao lado do `.adoc`: nome = `attachment_pattern` com `<nome>`
//! trocado pelo nome do arquivo sem extensão (padrão `<nome>_img`). Criada sob
//! demanda. Os comandos devolvem o **caminho relativo** (com `/`) a partir do
//! diretório da nota, pronto para virar `image::<rel>[]`.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

use crate::git::GitState;

fn attach_folder(note_path: &str, pattern: &str) -> Result<(PathBuf, String), String> {
    let p = Path::new(note_path);
    let dir = p
        .parent()
        .ok_or_else(|| "a nota precisa estar salva numa pasta".to_string())?;
    let stem = p
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .ok_or_else(|| "nome de nota inválido".to_string())?;
    let folder_name = if pattern.contains("<nome>") {
        pattern.replace("<nome>", &stem)
    } else {
        pattern.to_string()
    };
    Ok((dir.join(&folder_name), folder_name))
}

fn uniquify(dir: &Path, name: &str) -> String {
    if !dir.join(name).exists() {
        return name.to_string();
    }
    let (base, ext) = match name.rfind('.') {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };
    let mut n = 1;
    loop {
        let candidate = format!("{base}-{n}{ext}");
        if !dir.join(&candidate).exists() {
            return candidate;
        }
        n += 1;
    }
}

fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) { '-' } else { c })
        .collect()
}

/// Copia um arquivo externo para a pasta de anexos da nota.
#[tauri::command]
pub fn copy_attachment(
    state: State<'_, GitState>,
    note_path: String,
    source: String,
    pattern: String,
) -> Result<String, String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível".to_string())?;
    let (folder, folder_name) = attach_folder(&note_path, &pattern)?;
    fs::create_dir_all(&folder).map_err(|e| format!("nao foi possivel criar {folder:?}: {e}"))?;

    let src = Path::new(&source);
    let fname = src
        .file_name()
        .map(|s| sanitize(&s.to_string_lossy()))
        .ok_or_else(|| "origem inválida".to_string())?;
    let target = uniquify(&folder, &fname);
    fs::copy(src, folder.join(&target)).map_err(|e| format!("cópia falhou: {e}"))?;
    Ok(format!("{folder_name}/{target}"))
}

/// Grava bytes (imagem da área de transferência) na pasta de anexos.
#[tauri::command]
pub fn save_attachment(
    state: State<'_, GitState>,
    note_path: String,
    bytes: Vec<u8>,
    ext: String,
    pattern: String,
) -> Result<String, String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível".to_string())?;
    let (folder, folder_name) = attach_folder(&note_path, &pattern)?;
    fs::create_dir_all(&folder).map_err(|e| format!("nao foi possivel criar {folder:?}: {e}"))?;

    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let ext = ext.trim_start_matches('.').to_lowercase();
    let ext = if ext.is_empty() {
        "png".to_string()
    } else {
        ext
    };
    let target = uniquify(&folder, &format!("colado-{secs}.{ext}"));
    fs::write(folder.join(&target), &bytes).map_err(|e| format!("falha ao gravar: {e}"))?;
    Ok(format!("{folder_name}/{target}"))
}
