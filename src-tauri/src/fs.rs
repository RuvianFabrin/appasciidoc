//! Leitura e escrita de arquivos de texto para o editor.
//!
//! - A leitura normaliza o fim de linha para `\n` e reporta o EOL/BOM originais
//!   (tarefa 12), para que a escrita possa reconstruir o arquivo fielmente.
//! - A escrita e atomica: grava num arquivo temporario ao lado do destino e
//!   depois renomeia por cima (tarefa 11).

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(windows)]
pub(crate) fn replace_file(tmp: &Path, dest: &Path) -> std::io::Result<()> {
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING};

    let tmp: Vec<u16> = tmp.as_os_str().encode_wide().chain(once(0)).collect();
    let dest: Vec<u16> = dest.as_os_str().encode_wide().chain(once(0)).collect();

    // O temporário fica na mesma pasta, então a substituição permanece no
    // mesmo volume e preserva a gravação atômica no Windows.
    unsafe {
        MoveFileExW(
            PCWSTR(tmp.as_ptr()),
            PCWSTR(dest.as_ptr()),
            MOVEFILE_REPLACE_EXISTING,
        )
    }
    .map_err(std::io::Error::other)
}

#[cfg(not(windows))]
pub(crate) fn replace_file(tmp: &Path, dest: &Path) -> std::io::Result<()> {
    fs::rename(tmp, dest)
}

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::git::GitState;

const UTF8_BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Eol {
    Lf,
    Crlf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedFile {
    /// Caminho absoluto e normalizado.
    pub path: String,
    /// Conteudo com fim de linha normalizado para `\n`.
    pub content: String,
    pub eol: Eol,
    pub bom: bool,
    /// Milissegundos desde a epoca (mtime) - usado para detectar mudanca externa.
    pub modified_ms: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveOptions {
    /// `"lf"` ou `"crlf"`. Ausente = `"lf"`.
    #[serde(default)]
    pub eol: Option<String>,
    /// Prefixar BOM de UTF-8.
    #[serde(default)]
    pub bom: bool,
}

fn mtime_ms(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<LoadedFile, String> {
    let p = PathBuf::from(&path);
    let raw = fs::read(&p).map_err(|e| format!("nao foi possivel ler {path}: {e}"))?;

    let (bom, body) = if raw.starts_with(&UTF8_BOM) {
        (true, &raw[3..])
    } else {
        (false, &raw[..])
    };

    let text =
        String::from_utf8(body.to_vec()).map_err(|_| "arquivo nao esta em UTF-8".to_string())?;

    let eol = if text.contains("\r\n") {
        Eol::Crlf
    } else {
        Eol::Lf
    };
    let content = text.replace("\r\n", "\n");

    let canon = fs::canonicalize(&p).unwrap_or(p);
    Ok(LoadedFile {
        // barras normais e sem o prefixo `\\?\` do Windows — mesmo formato que
        // `workspace::norm` usa na árvore, para o front casar abas já abertas.
        path: canon
            .to_string_lossy()
            .replace(r"\\?\", "")
            .replace('\\', "/"),
        content,
        eol,
        bom,
        modified_ms: mtime_ms(&canon),
    })
}

#[tauri::command]
pub fn write_text_file(
    state: State<'_, GitState>,
    path: String,
    content: String,
    options: SaveOptions,
) -> Result<u64, String> {
    let _guard = state
        .operation
        .lock()
        .map_err(|_| "Git ficou indisponível".to_string())?;
    let dest = PathBuf::from(&path);
    let dir = dest
        .parent()
        .ok_or_else(|| format!("caminho sem diretorio: {path}"))?;
    fs::create_dir_all(dir).map_err(|e| format!("nao foi possivel criar {dir:?}: {e}"))?;

    // Reconstroi o fim de linha pedido a partir do conteudo normalizado (\n).
    let normalized = content.replace("\r\n", "\n");
    let body = match options.eol.as_deref() {
        Some("crlf") => normalized.replace('\n', "\r\n"),
        _ => normalized,
    };

    let mut bytes = Vec::with_capacity(body.len() + 3);
    if options.bom {
        bytes.extend_from_slice(&UTF8_BOM);
    }
    bytes.extend_from_slice(body.as_bytes());

    // Arquivo temporario no mesmo diretorio -> rename atomico no mesmo volume.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let stem = dest
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "arquivo".into());
    let tmp = dir.join(format!(".{stem}.{}.{nanos}.tmp", std::process::id()));

    {
        let mut f = fs::File::create(&tmp)
            .map_err(|e| format!("nao foi possivel gravar temporario: {e}"))?;
        f.write_all(&bytes)
            .map_err(|e| format!("falha ao escrever: {e}"))?;
        f.sync_all().ok();
    }

    if let Err(e) = replace_file(&tmp, &dest) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("nao foi possivel salvar {path}: {e}"));
    }

    Ok(mtime_ms(&dest))
}

#[tauri::command]
pub fn file_exists(path: String) -> bool {
    Path::new(&path).is_file()
}

/// `"file"`, `"dir"` ou `"missing"` — usado ao soltar algo na janela (tarefa 64).
#[tauri::command]
pub fn path_kind(path: String) -> String {
    let p = Path::new(&path);
    if p.is_dir() {
        "dir".into()
    } else if p.is_file() {
        "file".into()
    } else {
        "missing".into()
    }
}

#[tauri::command]
pub fn file_mtime_ms(path: String) -> u64 {
    mtime_ms(Path::new(&path))
}
