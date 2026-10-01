import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Fora do runtime do Tauri (ex.: `vite` no navegador para inspeção de UI) as
 * APIs nativas não existem. Estes guardas deixam o app renderizar mesmo assim.
 */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function appWindow(): ReturnType<typeof getCurrentWindow> | null {
  return isTauri ? getCurrentWindow() : null;
}
