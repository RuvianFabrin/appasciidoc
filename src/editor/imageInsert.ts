/**
 * Inserção de imagens no editor (tarefas 27, 28, 84).
 *
 * A extensão de colar (Editor.tsx) e o handler de drag-drop (EditorArea.tsx)
 * chamam estas funções. Como as extensões do CodeMirror não enxergam o estado
 * do React, o contexto (caminho da nota + padrão da pasta) é mantido aqui e
 * atualizado por `setImageContext`.
 */
import type { EditorView } from '@codemirror/view';
import { invoke } from '@tauri-apps/api/core';
import i18n from '../i18n';

interface ImageContext {
  notePath: string | null;
  pattern: string;
  notify: (msg: string) => void;
}

const ctx: ImageContext = {
  notePath: null,
  pattern: '<nome>_img',
  notify: () => undefined,
};

export function setImageContext(patch: Partial<ImageContext>): void {
  Object.assign(ctx, patch);
}

/** Caminho da nota aberta — usado pelos widgets de imagem para resolver o `src`. */
export function getNotePath(): string | null {
  return ctx.notePath;
}

/** Mostra um aviso curto (mesma "toast" das imagens). */
export function notify(msg: string): void {
  ctx.notify(msg);
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];

export function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTS.includes(ext);
}

function insertRef(view: EditorView, rel: string): void {
  const pos = view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const atLineStart = pos === line.from;
  const prefix = atLineStart ? '' : '\n';
  const insert = `${prefix}image::${rel}[]\n`;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
    scrollIntoView: true,
  });
  view.focus();
}

/** Copia um arquivo do disco (drag do Explorer) para a pasta de anexos. */
export async function insertImageFromDiskPath(view: EditorView, sourcePath: string): Promise<void> {
  if (!ctx.notePath) {
    ctx.notify(i18n.t('editor.saveBeforeImage'));
    return;
  }
  try {
    const rel = await invoke<string>('copy_attachment', {
      notePath: ctx.notePath,
      source: sourcePath,
      pattern: ctx.pattern,
    });
    insertRef(view, rel);
  } catch (err) {
    ctx.notify(i18n.t('image.copyError', { error: String(err) }));
  }
}

/** Grava um File/Blob (colar da área de transferência) na pasta de anexos. */
export async function insertImageFromBlob(view: EditorView, file: File): Promise<void> {
  if (!ctx.notePath) {
    ctx.notify(i18n.t('editor.saveBeforePaste'));
    return;
  }
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const ext = (file.name.split('.').pop() || file.type.split('/').pop() || 'png').toLowerCase();
    const rel = await invoke<string>('save_attachment', {
      notePath: ctx.notePath,
      bytes: Array.from(buf),
      ext,
      pattern: ctx.pattern,
    });
    insertRef(view, rel);
  } catch (err) {
    ctx.notify(i18n.t('image.saveError', { error: String(err) }));
  }
}
