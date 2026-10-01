/**
 * Barra de formatação flutuante por seleção (tarefa 29).
 *
 * Aparece acima da seleção (via facet `showTooltip` do CodeMirror) e aplica a
 * marcação AsciiDoc correspondente, alternando quando já está aplicada.
 */
import { type EditorState, StateField } from '@codemirror/state';
import { EditorView, showTooltip, type Tooltip } from '@codemirror/view';
import i18n from '../i18n';

function wrapMain(view: EditorView, before: string, after: string) {
  const r = view.state.selection.main;
  if (r.empty) return;
  const text = view.state.sliceDoc(r.from, r.to);
  const outerBefore = view.state.sliceDoc(Math.max(0, r.from - before.length), r.from);
  const outerAfter = view.state.sliceDoc(
    r.to,
    Math.min(view.state.doc.length, r.to + after.length),
  );

  if (
    text.length >= before.length + after.length &&
    text.startsWith(before) &&
    text.endsWith(after)
  ) {
    const inner = text.slice(before.length, text.length - after.length);
    view.dispatch({
      changes: { from: r.from, to: r.to, insert: inner },
      selection: { anchor: r.from, head: r.from + inner.length },
    });
  } else if (outerBefore === before && outerAfter === after) {
    view.dispatch({
      changes: { from: r.from - before.length, to: r.to + after.length, insert: text },
      selection: { anchor: r.from - before.length, head: r.to - before.length },
    });
  } else {
    view.dispatch({
      changes: { from: r.from, to: r.to, insert: before + text + after },
      selection: { anchor: r.from + before.length, head: r.to + before.length },
    });
  }
  view.focus();
}

function setHeading(view: EditorView, level: number) {
  const r = view.state.selection.main;
  const first = view.state.doc.lineAt(r.from);
  const last = view.state.doc.lineAt(r.to);
  const changes: Array<{ from: number; to: number; insert: string }> = [];
  const prefix = '='.repeat(level) + ' ';
  for (let n = first.number; n <= last.number; n += 1) {
    const line = view.state.doc.line(n);
    const m = /^(={1,6}\s+)/.exec(line.text);
    if (m && m[1] === prefix) {
      changes.push({ from: line.from, to: line.from + m[1].length, insert: '' });
    } else if (m) {
      changes.push({ from: line.from, to: line.from + m[1].length, insert: prefix });
    } else {
      changes.push({ from: line.from, to: line.from, insert: prefix });
    }
  }
  view.dispatch({ changes });
  view.focus();
}

function makeLink(view: EditorView) {
  const r = view.state.selection.main;
  if (r.empty) return;
  const text = view.state.sliceDoc(r.from, r.to);
  if (/^https?:\/\/\S+$/.test(text)) {
    view.dispatch({ changes: { from: r.from, to: r.to, insert: `link:${text}[${text}]` } });
  } else {
    const insert = `link:https://[${text}]`;
    view.dispatch({
      changes: { from: r.from, to: r.to, insert },
      // cursor sobre o "https://" para o usuário digitar a URL
      selection: { anchor: r.from + 5, head: r.from + 13 },
    });
  }
  view.focus();
}

function clearFormatting(view: EditorView) {
  const r = view.state.selection.main;
  if (r.empty) return;
  let text = view.state.sliceDoc(r.from, r.to);
  // tira papel [.xxx]# … #
  text = text.replace(/^\[\.[^\]]+\]#([\s\S]*)#$/, '$1');
  // tira wrappers simétricos repetidamente
  let changed = true;
  while (changed) {
    changed = false;
    for (const w of ['**', '__', '*', '_', '`', '#', '^', '~', '+']) {
      if (text.length > w.length * 2 && text.startsWith(w) && text.endsWith(w)) {
        text = text.slice(w.length, text.length - w.length);
        changed = true;
        break;
      }
    }
  }
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: text },
    selection: { anchor: r.from, head: r.from + text.length },
  });
  view.focus();
}

function makeXref(view: EditorView) {
  const r = view.state.selection.main;
  if (r.empty) return;
  const text = view.state.sliceDoc(r.from, r.to);
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: `xref:[${text}]` },
    selection: { anchor: r.from + 5, head: r.from + 5 },
  });
  view.focus();
}

function button(label: string, title: string, run: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'cm-format-toolbar__btn';
  b.type = 'button';
  b.textContent = label;
  b.title = title;
  b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    run();
  });
  return b;
}

function tooltips(state: EditorState): readonly Tooltip[] {
  const r = state.selection.main;
  if (r.empty) return [];
  return [
    {
      pos: Math.min(r.from, r.to),
      above: true,
      strictSide: false,
      arrow: false,
      create: (view) => {
        const dom = document.createElement('div');
        dom.className = 'cm-format-toolbar';
        dom.append(
          button('B', i18n.t('toolbar.bold'), () => wrapMain(view, '*', '*')),
          button('I', i18n.t('toolbar.italic'), () => wrapMain(view, '_', '_')),
          button('</>', i18n.t('toolbar.monospace'), () => wrapMain(view, '`', '`')),
          button('H', i18n.t('toolbar.highlight'), () => wrapMain(view, '#', '#')),
          button('x²', i18n.t('toolbar.superscript'), () => wrapMain(view, '^', '^')),
          button('x₂', i18n.t('toolbar.subscript'), () => wrapMain(view, '~', '~')),
          button('U', i18n.t('toolbar.underline'), () => wrapMain(view, '[.underline]#', '#')),
          button('S', i18n.t('toolbar.strikethrough'), () =>
            wrapMain(view, '[.line-through]#', '#'),
          ),
          button('🔗', i18n.t('toolbar.link'), () => makeLink(view)),
          button('§', i18n.t('toolbar.xref'), () => makeXref(view)),
          button('H1', i18n.t('toolbar.heading', { level: 1 }), () => setHeading(view, 1)),
          button('H2', i18n.t('toolbar.heading', { level: 2 }), () => setHeading(view, 2)),
          button('H3', i18n.t('toolbar.heading', { level: 3 }), () => setHeading(view, 3)),
          button('⌫', i18n.t('toolbar.clear'), () => clearFormatting(view)),
        );
        return { dom };
      },
    },
  ];
}

const toolbarField = StateField.define<readonly Tooltip[]>({
  create: (state) => tooltips(state),
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value;
    return tooltips(tr.state);
  },
  provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
});

export function formatToolbar() {
  return [toolbarField];
}
