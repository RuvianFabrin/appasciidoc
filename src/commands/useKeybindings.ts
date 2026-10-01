import { useEffect } from 'react';

export interface KeyHandlers {
  onNew: () => void;
  onNewWindow: () => void;
  onOpen: () => void;
  onCloseTab: () => void;
  onNextTab: () => void;
  onPrevTab: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onTogglePalette: () => void;
  onTogglePreview: () => void;
  onToggleInlineMode: () => void;
  onQuickOpen: () => void;
  onInsertLink: () => void;
  onOpenSettings: () => void;
  onNavBack: () => void;
  onNavForward: () => void;
  /** Quando true, só o atalho da paleta continua ativo (modais abertos). */
  suspended?: boolean;
}

/**
 * Atalhos de nível de aplicativo (funcionam mesmo sem foco no editor).
 * Registrados na fase de captura para ter prioridade sobre o CodeMirror.
 */
export function useKeybindings(h: KeyHandlers) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // navegação: Alt+setas
      if (e.altKey && !e.ctrlKey && !e.metaKey && !h.suspended) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          h.onNavBack();
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          h.onNavForward();
          return;
        }
      }

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      // Ctrl+Tab / Ctrl+Shift+Tab: alterna abas (mesmo com modal? não).
      if (e.key === 'Tab') {
        if (h.suspended) return;
        e.preventDefault();
        if (e.shiftKey) h.onPrevTab();
        else h.onNextTab();
        return;
      }

      if (key === 'p' && e.shiftKey) {
        e.preventDefault();
        h.onTogglePalette();
        return;
      }
      if (key === 'p') {
        e.preventDefault();
        h.onQuickOpen();
        return;
      }
      if (h.suspended) return;

      if (key === 'v' && e.shiftKey) {
        e.preventDefault();
        h.onTogglePreview();
      } else if (key === 'm' && e.shiftKey) {
        e.preventDefault();
        h.onToggleInlineMode();
      } else if (key === 's' && e.shiftKey) {
        e.preventDefault();
        h.onSaveAs();
      } else if (key === 's') {
        e.preventDefault();
        h.onSave();
      } else if (key === 'o') {
        e.preventDefault();
        h.onOpen();
      } else if (key === 'n' && e.shiftKey) {
        e.preventDefault();
        h.onNewWindow();
      } else if (key === 'n') {
        e.preventDefault();
        h.onNew();
      } else if (key === 'k') {
        e.preventDefault();
        h.onInsertLink();
      } else if (key === ',') {
        e.preventDefault();
        h.onOpenSettings();
      } else if (key === 'w') {
        e.preventDefault();
        h.onCloseTab();
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [h]);
}
