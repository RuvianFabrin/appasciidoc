//! Observador de mudanças no disco (tarefa 33).
//!
//! Um watcher recursivo por janela; ao detectar mudança, emite `workspace-changed`
//! (com debounce curto) para o frontend recarregar a árvore/índice.

use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatchState(pub Mutex<Option<RecommendedWatcher>>);

#[tauri::command]
pub fn watch_workspace(
    app: AppHandle,
    root: String,
    state: State<'_, WatchState>,
) -> Result<(), String> {
    let app = app.clone();
    let last = Mutex::new(
        Instant::now()
            .checked_sub(Duration::from_secs(2))
            .unwrap_or_else(Instant::now),
    );

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if !matches!(
            event.kind,
            notify::EventKind::Create(_)
                | notify::EventKind::Modify(_)
                | notify::EventKind::Remove(_)
        ) {
            return;
        }
        let mut l = last.lock().unwrap();
        if l.elapsed() >= Duration::from_millis(350) {
            *l = Instant::now();
            let _ = app.emit("workspace-changed", ());
        }
    })
    .map_err(|e| format!("watcher: {e}"))?;

    watcher
        .watch(Path::new(&root), RecursiveMode::Recursive)
        .map_err(|e| format!("watch {root}: {e}"))?;

    // substitui (e derruba) o watcher anterior desta janela
    *state.0.lock().unwrap() = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn unwatch_workspace(state: State<'_, WatchState>) {
    *state.0.lock().unwrap() = None;
}
