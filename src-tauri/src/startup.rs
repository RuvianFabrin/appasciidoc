//! Arquivo passado na linha de comando / "Abrir com" (tarefa 9).
//!
//! `appasciidoc caminho/nota.adoc` abre direto naquela nota. No `tauri dev`,
//! use `npm run tauri dev -- -- caminho/nota.adoc`.

use std::path::Path;

#[tauri::command]
pub fn startup_file() -> Option<String> {
    std::env::args().skip(1).find_map(|arg| {
        if arg.starts_with('-') {
            return None;
        }
        let p = Path::new(&arg);
        if p.is_file() {
            Some(
                std::fs::canonicalize(p)
                    .map(|c| c.to_string_lossy().replace(r"\\?\", ""))
                    .unwrap_or(arg),
            )
        } else {
            None
        }
    })
}
