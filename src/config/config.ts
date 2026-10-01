/** Configuracao do usuario (subconjunto necessario para a Fase 1). */
import { invoke } from '@tauri-apps/api/core';

export type PreviewMode = 'editor' | 'split' | 'preview';
export type ThemePref = 'light' | 'dark' | 'system';
export type WikilinkMode = 'wikilink' | 'xref';
export type Language = 'pt-BR' | 'en' | 'es' | 'zh';
export interface GitRemoteConfig {
  name: string;
  url: string;
  username: string;
  token: string;
}
export interface LockConfig {
  enabled: boolean;
  salt: string;
  verifier: string;
}
/** Fonte do texto do documento (editor em modo inline + preview + exportação). */
export type DocFont = 'inter' | 'literata' | 'source-serif' | 'system';

/** Versão do schema de config, para migração (tarefa 72). */
export const CONFIG_VERSION = 1;

export interface HtmlExportOptions {
  theme: 'light' | 'dark' | 'auto';
  embedImages: boolean;
  toc: boolean;
  tocLevels: number;
  sectnums: boolean;
}

export interface PdfExportOptions {
  pageSize: 'A4' | 'Letter' | 'Legal';
  margin: 'normal' | 'narrow' | 'wide';
  theme: 'light' | 'dark' | 'auto';
  toc: boolean;
  tocLevels: number;
  sectnums: boolean;
  pageBreakBeforeH1: boolean;
}

export interface AppConfig {
  /** Versão do schema — usada para migração (tarefa 72). */
  version: number;
  language: Language;
  gitRemote: GitRemoteConfig;
  lock: LockConfig;
  autosaveMs: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  previewMode: PreviewMode;
  inlineMode: boolean;
  /** Tema da aplicação: claro, escuro ou seguir o sistema (tarefa 70). */
  theme: ThemePref;
  /** Tamanho da fonte do editor em px (tarefa 71). */
  editorFontSize: number;
  /** Fonte do texto do documento (editor inline + preview + exportação). */
  docFont: DocFont;
  /** O que o Ctrl+K / autocomplete insere ao ligar duas notas (tarefa 71). */
  wikilinkMode: WikilinkMode;
  lastWorkspace: string | null;
  attachmentPattern: string;
  htmlExport: HtmlExportOptions;
  pdfExport: PdfExportOptions;
  /** Reabrir janelas/workspaces abertos ao iniciar (tarefa 66). */
  reopenWindowsOnStart: boolean;
  /** Aviso vindo do backend (config corrompida / migrada). Não é persistido. */
  notice?: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  version: CONFIG_VERSION,
  language: 'pt-BR',
  gitRemote: { name: 'origin', url: '', username: '', token: '' },
  lock: { enabled: false, salt: '', verifier: '' },
  autosaveMs: 0,
  wordWrap: true,
  lineNumbers: true,
  previewMode: 'split',
  inlineMode: true,
  theme: 'system',
  editorFontSize: 14,
  docFont: 'inter',
  wikilinkMode: 'wikilink',
  lastWorkspace: null,
  attachmentPattern: '<nome>_img',
  htmlExport: { theme: 'light', embedImages: true, toc: true, tocLevels: 3, sectnums: false },
  pdfExport: {
    pageSize: 'A4',
    margin: 'normal',
    theme: 'light',
    toc: true,
    tocLevels: 3,
    sectnums: true,
    pageBreakBeforeH1: false,
  },
  reopenWindowsOnStart: false,
};

export function readConfig(): Promise<AppConfig> {
  return invoke<AppConfig>('read_config');
}

export function writeConfig(config: AppConfig): Promise<void> {
  return invoke('write_config', { config });
}

export function setScreenLock(password: string): Promise<void> {
  return invoke('lock_set', { password });
}

export function verifyScreenLock(password: string): Promise<boolean> {
  return invoke<boolean>('lock_verify', { password });
}

export function clearScreenLock(): Promise<void> {
  return invoke('lock_clear');
}

export interface RecoveryEntry {
  key: string;
  originalPath: string | null;
  savedAtMs: number;
  content: string;
}

export function listRecovery(): Promise<RecoveryEntry[]> {
  return invoke<RecoveryEntry[]>('list_recovery');
}

export function saveRecovery(originalPath: string | null, content: string): Promise<string> {
  return invoke<string>('save_recovery', { originalPath, content });
}

export function discardRecovery(key: string): Promise<void> {
  return invoke('discard_recovery', { key });
}
