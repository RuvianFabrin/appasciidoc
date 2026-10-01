/**
 * Fechamento automático de pares (tarefa 119).
 *
 * - `(` `[` `{` — via `closeBrackets` do CodeMirror (fecha, pula, apaga o par vazio).
 * - `*` `_` `` ` `` `#` `^` `~` — com seleção, envolvem a seleção; sem seleção, o
 *   comportamento normal (não poluir prosa com pares vazios).
 * - `<` digitado após `<` → completa `<<>>` com o cursor no meio.
 */
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { keymap, EditorView } from '@codemirror/view';

const WRAPPERS = new Set(['*', '_', '`', '#', '^', '~']);

const wrapOrXref = EditorView.inputHandler.of((view, from, to, text) => {
  // digitou "<" logo após outro "<" → vira <<|>>
  if (text === '<' && from === to && from > 0 && view.state.sliceDoc(from - 1, from) === '<') {
    view.dispatch({
      changes: { from, insert: '<>>' },
      selection: { anchor: from + 1 },
      userEvent: 'input.type',
    });
    return true;
  }

  // wrapper com seleção não-vazia → envolve
  if (WRAPPERS.has(text)) {
    const r = view.state.selection.main;
    if (!r.empty && from === r.from && to === r.to) {
      view.dispatch({
        changes: [
          { from: r.from, insert: text },
          { from: r.to, insert: text },
        ],
        selection: { anchor: r.from + 1, head: r.to + 1 },
        userEvent: 'input.type',
      });
      return true;
    }
  }
  return false;
});

export function pairing() {
  return [closeBrackets(), keymap.of(closeBracketsKeymap), wrapOrXref];
}
