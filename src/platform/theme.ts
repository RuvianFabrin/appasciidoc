import type { DocFont, ThemePref } from '../config/config';

/**
 * Tema da aplicação (tarefa 70). O `<html>` sempre carrega
 * `data-theme="light"|"dark"` — "system" é resolvido aqui via `matchMedia` e
 * reacompanha mudanças do SO. CSS de UI, editor e preview leem os mesmos tokens.
 */

let pref: ThemePref = 'system';
let bound = false;

function resolved(p: ThemePref): 'light' | 'dark' {
  if (p === 'light' || p === 'dark') return p;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function paint(): void {
  document.documentElement.dataset.theme = resolved(pref);
}

/** Define a preferência e aplica; liga o listener do SO na primeira chamada. */
export function applyTheme(next: ThemePref): void {
  pref = next;
  paint();
  if (!bound && window.matchMedia) {
    bound = true;
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (pref === 'system') paint();
    });
  }
}

/** Tema efetivo no momento (para escolhas de exportação "auto", etc). */
export function currentTheme(): 'light' | 'dark' {
  return resolved(pref);
}

/** Tamanho da fonte do editor (px) via CSS var (tarefa 71). */
export function applyEditorFontSize(px: number): void {
  document.documentElement.style.setProperty('--editor-font-size', `${Math.round(px)}px`);
}

/** Pilha CSS de cada opção de fonte do documento. */
export const DOC_FONT_STACK: Record<DocFont, string> = {
  inter: "'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  literata: "'Literata Variable', Georgia, 'Times New Roman', serif",
  'source-serif': "'Source Serif 4 Variable', Georgia, 'Times New Roman', serif",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

/** Fonte do texto do documento (editor inline + preview) via CSS var `--doc-font`. */
export function applyDocFont(name: DocFont): void {
  document.documentElement.style.setProperty(
    '--doc-font',
    DOC_FONT_STACK[name] ?? DOC_FONT_STACK.inter,
  );
}
