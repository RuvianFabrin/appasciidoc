/**
 * Acesso a arquivos: dialogos nativos (plugin) + leitura/escrita no nucleo Rust.
 * Nada de `invoke` fora desta camada.
 */
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';

export type Eol = 'lf' | 'crlf';

export interface LoadedFile {
  path: string;
  content: string;
  eol: Eol;
  bom: boolean;
  modifiedMs: number;
}

export interface SaveOptions {
  eol: Eol;
  bom: boolean;
}

const ADOC_FILTER = {
  name: 'AsciiDoc',
  extensions: ['adoc', 'asciidoc', 'adoc.txt', 'asc', 'txt'],
};

/** Abre o dialogo "Abrir" e retorna o caminho escolhido (ou null). */
export async function pickOpenPath(): Promise<string | null> {
  const picked = await openDialog({ multiple: false, directory: false, filters: [ADOC_FILTER] });
  return typeof picked === 'string' ? picked : null;
}

export async function pickAgePath(): Promise<string | null> {
  const picked = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: 'AGE', extensions: ['age'] }],
  });
  return typeof picked === 'string' ? picked : null;
}

export function ageEncryptFile(path: string, passphrase: string): Promise<string> {
  return invoke<string>('age_encrypt_file', { path, passphrase });
}

export function ageDecryptFile(path: string, passphrase: string): Promise<string> {
  return invoke<string>('age_decrypt_file', { path, passphrase });
}

const HTML_FILTER = { name: 'HTML', extensions: ['html', 'htm'] };
const PDF_FILTER = { name: 'PDF', extensions: ['pdf'] };

/** Abre o dialogo "Salvar como" e retorna o caminho escolhido (ou null). */
export async function pickSavePath(
  defaultPath?: string,
  kind: 'adoc' | 'html' | 'pdf' = 'adoc',
): Promise<string | null> {
  const filter = kind === 'html' ? HTML_FILTER : kind === 'pdf' ? PDF_FILTER : ADOC_FILTER;
  const picked = await saveDialog({
    filters: [filter],
    ...(defaultPath ? { defaultPath } : {}),
  });
  return picked ?? null;
}

/** Grava o PDF de impressão direto num caminho, sem diálogo (tarefa 55/56). */
export function printToPdf(html: string, outPath: string): Promise<void> {
  return invoke('print_to_pdf', { html, outPath });
}

/** Injeta marcadores no PDF a partir dos títulos (tarefa 57). */
export function addPdfOutline(
  path: string,
  headings: Array<{ text: string; level: number }>,
): Promise<void> {
  return invoke('add_pdf_outline', { path, headings });
}

export function readTextFile(path: string): Promise<LoadedFile> {
  return invoke<LoadedFile>('read_text_file', { path });
}

/** Escrita atomica. Retorna o novo mtime em ms. */
export function writeTextFile(
  path: string,
  content: string,
  options: SaveOptions,
): Promise<number> {
  return invoke<number>('write_text_file', { path, content, options });
}

export function fileExists(path: string): Promise<boolean> {
  return invoke<boolean>('file_exists', { path });
}

export function fileMtimeMs(path: string): Promise<number> {
  return invoke<number>('file_mtime_ms', { path });
}

/** `"file"`, `"dir"` ou `"missing"` — para tratar algo solto na janela. */
export function pathKind(path: string): Promise<'file' | 'dir' | 'missing'> {
  return invoke<'file' | 'dir' | 'missing'>('path_kind', { path });
}

export function startupFile(): Promise<string | null> {
  return invoke<string | null>('startup_file');
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
