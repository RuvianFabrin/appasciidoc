import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from './win';

/** Rótulo da janela atual (ou `"main"` fora do Tauri). */
export function currentWindowLabel(): string {
  return isTauri ? getCurrentWindow().label : 'main';
}

/** Registra/atualiza o workspace desta janela (tarefa 66). */
export function trackWindow(workspace: string | null): void {
  if (!isTauri) return;
  void invoke('window_track', { label: currentWindowLabel(), workspace }).catch(() => undefined);
}

/** Remove esta janela do registro (chamar antes de destruir). */
export async function untrackWindow(): Promise<void> {
  if (!isTauri) return;
  await invoke('window_untrack', { label: currentWindowLabel() }).catch(() => undefined);
}

/** Lê (e apaga) a lista de workspaces a reabrir no boot (tarefa 66). */
export function takeReopenWorkspaces(): Promise<string[]> {
  if (!isTauri) return Promise.resolve([]);
  return invoke<string[]>('take_reopen_workspaces').catch(() => [] as string[]);
}

/**
 * Abre uma nova janela do editor no **mesmo processo** (tarefa 59).
 *
 * Cada janela carrega o mesmo `index.html` com um rótulo único; o estado
 * (arquivo/workspace) é próprio. Um `?workspace=` opcional faz a nova janela
 * abrir direto numa pasta — senão ela usa o `lastWorkspace` do config, como
 * a janela principal.
 */
export async function openNewWindow(opts?: { workspace?: string | null }): Promise<void> {
  if (!isTauri) {
    // Fora do Tauri (inspeção no navegador) não há como criar janelas nativas.
    window.open(window.location.href, '_blank');
    return;
  }
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const label = `editor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const url = opts?.workspace
    ? `index.html?workspace=${encodeURIComponent(opts.workspace)}`
    : 'index.html';
  const win = new WebviewWindow(label, {
    url,
    title: 'AppAsciiDoc',
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    resizable: true,
    center: true,
  });
  await new Promise<void>((resolve, reject) => {
    void win.once('tauri://created', () => resolve());
    void win.once('tauri://error', (e) => reject(new Error(String(e.payload))));
  });
}

/** Workspace passado por query string ao abrir uma nova janela (tarefa 59). */
export function workspaceFromQuery(): string | null {
  try {
    const v = new URLSearchParams(window.location.search).get('workspace');
    return v ? v : null;
  } catch {
    return null;
  }
}
