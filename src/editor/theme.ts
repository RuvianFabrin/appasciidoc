import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * Tema do editor (tarefa 70). Todas as cores vêm de CSS custom properties
 * definidas em `global.css` e trocadas via `data-theme` no `<html>` — então
 * claro/escuro alternam sem reconstruir o CodeMirror.
 */
export const editorTheme = EditorView.theme({
  '&': {
    color: 'var(--fg)',
    backgroundColor: 'var(--editor-bg)',
    height: '100%',
    fontSize: 'var(--editor-font-size, 14px)',
  },
  '.cm-scroller': {
    // texto do documento; blocos/linhas de código voltam ao mono via CSS
    // (`.cm-adoc-code`, `.cm-adoc-code-line`, …) e o modo fonte via `.editor-host--source`.
    fontFamily: 'var(--doc-font, var(--ui-font, system-ui, sans-serif))',
    lineHeight: '1.6',
    padding: '8px 0',
  },
  '.cm-content': { caretColor: 'var(--accent)' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' },
  '.cm-gutters': {
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--fg-dim)',
    border: 'none',
  },
  '.cm-activeLine': { backgroundColor: 'var(--cm-active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--cm-active-line-gutter)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--cm-selection)',
  },
  '.cm-selectionMatch': { backgroundColor: 'var(--cm-selection-match)' },
});

const highlightStyle = HighlightStyle.define([
  { tag: t.heading, color: 'var(--accent)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700', color: 'var(--syn-strong)' },
  { tag: t.emphasis, fontStyle: 'italic', color: 'var(--syn-emphasis)' },
  { tag: t.monospace, color: 'var(--syn-mono)' },
  { tag: t.literal, color: 'var(--syn-mono)' },
  { tag: t.comment, color: 'var(--fg-dim)', fontStyle: 'italic' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: t.labelName, color: 'var(--syn-label)' },
  { tag: [t.meta, t.processingInstruction], color: 'var(--syn-meta)' },
  { tag: t.list, color: 'var(--syn-list)' },
  { tag: t.atom, color: 'var(--syn-atom)' },
  { tag: t.separator, color: 'var(--fg-dim)' },
]);

export const editorHighlighting = syntaxHighlighting(highlightStyle);
