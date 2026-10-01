mod age_files;
mod attachments;
mod config;
mod fs;
mod git;
mod index;
mod lock;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod menu;
mod print_pdf;
mod recovery;
mod session;
mod startup;
mod watcher;
mod windows;
mod workspace;

use serde::Serialize;

/// Retorno do comando `ping`. Prova, no boot, de que a ponte IPC funciona (tarefa 5).
#[derive(Serialize)]
struct AppInfo {
    name: String,
    version: String,
    #[serde(rename = "tauriVersion")]
    tauri_version: String,
    os: String,
}

#[tauri::command]
fn set_app_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    let language = match language.as_str() {
        "pt-BR" | "en" | "es" | "zh" => language,
        _ => "pt-BR".to_string(),
    };
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        menu::install(&app, &language).map_err(|e| e.to_string())
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = (app, language);
        Ok(())
    }
}

#[tauri::command]
fn ping(app: tauri::AppHandle) -> AppInfo {
    let pkg = app.package_info();
    AppInfo {
        name: pkg.name.clone(),
        version: pkg.version.to_string(),
        tauri_version: tauri::VERSION.to_string(),
        os: std::env::consts::OS.to_string(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(watcher::WatchState::default())
        .manage(windows::WindowState::default())
        .manage(git::GitState::default())
        .setup(|_app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                let language = config::read_config(_app.handle().clone()).language;
                menu::install(_app.handle(), &language)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            set_app_language,
            git::git_status,
            git::git_remote_test,
            git::git_remote_set,
            git::git_preview,
            git::git_sync,
            lock::lock_set,
            lock::lock_verify,
            lock::lock_clear,
            age_files::age_encrypt_file,
            age_files::age_decrypt_file,
            startup::startup_file,
            fs::read_text_file,
            fs::write_text_file,
            fs::file_exists,
            fs::file_mtime_ms,
            fs::path_kind,
            config::read_config,
            config::write_config,
            recovery::save_recovery,
            recovery::list_recovery,
            recovery::discard_recovery,
            workspace::read_dir,
            workspace::create_file,
            workspace::create_dir,
            workspace::rename_path,
            workspace::delete_path,
            index::scan_workspace,
            index::search_workspace,
            watcher::watch_workspace,
            watcher::unwatch_workspace,
            session::read_session,
            session::write_session,
            windows::window_track,
            windows::window_untrack,
            windows::take_reopen_workspaces,
            print_pdf::print_to_pdf,
            print_pdf::add_pdf_outline,
            attachments::copy_attachment,
            attachments::save_attachment,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o AppAsciiDoc");
}
