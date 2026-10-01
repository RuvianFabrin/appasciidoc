//! Configuracao do usuario em `<app_config_dir>/config.json`.
//!
//! Minimo necessario para a Fase 1 (tarefa 13). A tela de configuracoes completa
//! e a migracao de versao chegam na Fase 9 (tarefas 71-72).

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Versão atual do schema de config (tarefa 72).
const CONFIG_VERSION: u32 = 1;

fn default_true() -> bool {
    true
}

fn default_preview_mode() -> String {
    "split".to_string()
}

fn default_language() -> String {
    "pt-BR".to_string()
}

fn default_theme() -> String {
    "system".to_string()
}

fn default_editor_font_size() -> u8 {
    14
}

fn default_doc_font() -> String {
    "inter".to_string()
}

fn default_wikilink_mode() -> String {
    "wikilink".to_string()
}

fn default_attachment_pattern() -> String {
    "<nome>_img".to_string()
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct HtmlExport {
    pub theme: String,
    pub embed_images: bool,
    pub toc: bool,
    pub toc_levels: u8,
    pub sectnums: bool,
}

impl Default for HtmlExport {
    fn default() -> Self {
        Self {
            theme: "light".to_string(),
            embed_images: true,
            toc: true,
            toc_levels: 3,
            sectnums: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct PdfExport {
    pub page_size: String,
    pub margin: String,
    pub theme: String,
    pub toc: bool,
    pub toc_levels: u8,
    pub sectnums: bool,
    pub page_break_before_h1: bool,
}

impl Default for PdfExport {
    fn default() -> Self {
        Self {
            page_size: "A4".to_string(),
            margin: "normal".to_string(),
            theme: "light".to_string(),
            toc: true,
            toc_levels: 3,
            sectnums: true,
            page_break_before_h1: false,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    /// Versao do schema (tarefa 72). Ausente = 0 (config pre-migracao).
    #[serde(default)]
    pub version: u32,
    /// Idioma da interface: pt-BR, en, es ou zh.
    #[serde(default = "default_language")]
    pub language: String,
    /// Remoto principal Git. O token fica neste arquivo quando não há cofre nativo.
    #[serde(default)]
    pub git_remote: GitRemoteConfig,
    /// Trava local da interface; não criptografa os arquivos do workspace.
    #[serde(default)]
    pub lock: LockConfig,
    /// Autosave apos N ms de inatividade. `0` = desligado (padrao).
    pub autosave_ms: u64,
    /// Quebra de linha visual no editor.
    #[serde(default = "default_true")]
    pub word_wrap: bool,
    /// Mostrar numeros de linha.
    #[serde(default = "default_true")]
    pub line_numbers: bool,
    /// Layout do preview: "editor" | "split" | "preview".
    #[serde(default = "default_preview_mode")]
    pub preview_mode: String,
    /// true = edicao inline (live preview); false = modo fonte.
    #[serde(default = "default_true")]
    pub inline_mode: bool,
    /// Tema: "light" | "dark" | "system" (tarefa 70).
    #[serde(default = "default_theme")]
    pub theme: String,
    /// Tamanho da fonte do editor em px (tarefa 71).
    #[serde(default = "default_editor_font_size")]
    pub editor_font_size: u8,
    /// Fonte do documento: "inter" | "literata" | "source-serif" | "system".
    #[serde(default = "default_doc_font")]
    pub doc_font: String,
    /// "wikilink" | "xref" — o que Ctrl+K insere ao ligar notas (tarefa 71).
    #[serde(default = "default_wikilink_mode")]
    pub wikilink_mode: String,
    /// Ultima pasta aberta como workspace (para reabrir ao iniciar).
    #[serde(default)]
    pub last_workspace: Option<String>,
    /// Padrao do nome da pasta de anexos por nota. `<nome>` = nome do arquivo sem extensao.
    #[serde(default = "default_attachment_pattern")]
    pub attachment_pattern: String,
    /// Ultimas opcoes do diálogo de exportacao HTML.
    #[serde(default)]
    pub html_export: HtmlExport,
    /// Ultimas opcoes do diálogo de exportacao PDF.
    #[serde(default)]
    pub pdf_export: PdfExport,
    /// Reabrir as janelas/workspaces que estavam abertos ao iniciar (tarefa 66).
    #[serde(default)]
    pub reopen_windows_on_start: bool,
    /// Aviso para a UI (config corrompida / migrada). Nao e persistido.
    #[serde(skip)]
    pub notice: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct LockConfig {
    pub enabled: bool,
    pub salt: String,
    pub verifier: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct GitRemoteConfig {
    pub name: String,
    pub url: String,
    pub username: String,
    pub token: String,
}

impl Default for GitRemoteConfig {
    fn default() -> Self {
        Self {
            name: "origin".into(),
            url: String::new(),
            username: String::new(),
            token: String::new(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: CONFIG_VERSION,
            language: default_language(),
            git_remote: GitRemoteConfig::default(),
            lock: LockConfig::default(),
            autosave_ms: 0,
            word_wrap: true,
            line_numbers: true,
            preview_mode: default_preview_mode(),
            inline_mode: true,
            theme: default_theme(),
            editor_font_size: default_editor_font_size(),
            doc_font: default_doc_font(),
            wikilink_mode: default_wikilink_mode(),
            last_workspace: None,
            attachment_pattern: default_attachment_pattern(),
            html_export: HtmlExport::default(),
            pdf_export: PdfExport::default(),
            reopen_windows_on_start: false,
            notice: None,
        }
    }
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("sem diretorio de config: {e}"))?;
    Ok(dir.join("config.json"))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
pub fn read_config(app: tauri::AppHandle) -> AppConfig {
    let Ok(path) = config_path(&app) else {
        return AppConfig::default();
    };
    let Ok(text) = fs::read_to_string(&path) else {
        // Sem arquivo ainda: padrao, sem aviso.
        return AppConfig::default();
    };

    match serde_json::from_str::<AppConfig>(&text) {
        Ok(mut cfg) => {
            // Migracao de versao (tarefa 72). Campos ausentes ja viraram padrao
            // via `#[serde(default)]`; aqui so registramos e regravamos.
            if cfg.version < CONFIG_VERSION {
                let from = cfg.version;
                cfg.version = CONFIG_VERSION;
                let _ = write_config(app.clone(), cfg.clone());
                cfg.notice = Some(format!(
                    "Configuração migrada da versão {from} para {CONFIG_VERSION}."
                ));
            }
            cfg
        }
        Err(err) => {
            // Corrompida: guarda um backup e cai no padrao com aviso (tarefa 72).
            let bak = path.with_extension(format!("corrupt-{}.json", now_secs()));
            let _ = fs::rename(&path, &bak);
            AppConfig {
                notice: Some(format!(
                    "config.json inválido ({err}). Um backup foi salvo e os padrões foram restaurados."
                )),
                ..AppConfig::default()
            }
        }
    }
}

#[tauri::command]
pub fn write_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("nao foi possivel criar {dir:?}: {e}"))?;
    }
    let text =
        serde_json::to_string_pretty(&config).map_err(|e| format!("falha ao serializar: {e}"))?;
    fs::write(&path, text).map_err(|e| format!("nao foi possivel gravar config: {e}"))
}
