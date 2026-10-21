use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::AndroidFiles;
#[cfg(mobile)]
use mobile::AndroidFiles;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the android-files APIs.
pub trait AndroidFilesExt<R: Runtime> {
  fn android_files(&self) -> &AndroidFiles<R>;
}

impl<R: Runtime, T: Manager<R>> crate::AndroidFilesExt<R> for T {
  fn android_files(&self) -> &AndroidFiles<R> {
    self.state::<AndroidFiles<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("android-files")
    .invoke_handler(tauri::generate_handler![commands::ping])
    .setup(|app, api| {
      #[cfg(mobile)]
      let android_files = mobile::init(app, api)?;
      #[cfg(desktop)]
      let android_files = desktop::init(app, api)?;
      app.manage(android_files);
      Ok(())
    })
    .build()
}
