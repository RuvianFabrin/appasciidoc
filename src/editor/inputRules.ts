/**
 * Regras de digitação (tarefa 118) — atalhos de músculo do Markdown/Typora.
 *
 * - ``` ``` ``` no início de linha → abre `[source]` + `----`, cursor dentro.
 * - `#`…`# ` no início de linha → vira `=`…`= ` (título AsciiDoc).
 * - `[] ` / `[ ] ` logo após um marcador de lista → `[ ] ` (item de tarefa).
 *
 * Envolver seleção com `*` `_` `` ` `` `#` já é feito por `pairing.ts` (119).
 * Cada regra é uma transação única → um só `Ctrl+Z` desfaz a conversão.
 */
import { EditorView } from '@codemirror/view';

const HEADING_PREFIX = /^(#{1,6})$/;
const LIST_BEFORE_TASK = /^(\s*(?:[*.-]+|\d+[.)])\s+)(\[[ xX]?)$/;

export const inputRules = EditorView.inputHandler.of((view, from, to, text) => {
  if (from !== to) return false;
  const line = view.state.doc.lineAt(from);
  const before = view.state.sliceDoc(line.from, from);

  // ``` no início da linha → bloco de código
  if (text === '`' && before === '``' && line.from === from - 2) {
    const scaffold = '[source]\n----\n\n----\n';
    view.dispatch({
      changes: { from: line.from, to: from, insert: scaffold },
      selection: { anchor: line.from + '[source]\n----\n'.length },
      userEvent: 'input.type',
    });
    return true;
  }

  // "# " … "###### " → "= " … "====== "
  if (text === ' ') {
    const h = HEADING_PREFIX.exec(before);
    if (h) {
      const eq = '='.repeat(h[1].length);
      view.dispatch({
        changes: { from: line.from, to: from, insert: `${eq} ` },
        selection: { anchor: line.from + eq.length + 1 },
        userEvent: 'input.type',
      });
      return true;
    }

    // "* [] " / "* [ ] " → "* [ ] "
    const tk = LIST_BEFORE_TASK.exec(before);
    if (tk && tk[2] === '[') {
      view.dispatch({
        changes: { from, insert: ' ]' },
        selection: { anchor: from + 2 },
        userEvent: 'input.type',
      });
      return true;
    }
  }

  return false;
});
