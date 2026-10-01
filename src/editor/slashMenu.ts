/**
 * Menu "/" no início da linha (tarefa 116).
 *
 * Ao digitar `/` numa linha vazia (ou logo após a indentação), abre a lista de
 * autocompletar do CodeMirror com esqueletos de blocos e macros do AsciiDoc.
 * Selecionar insere o trecho e posiciona o cursor.
 */
import {
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { getCurrentNotePath, getNotes } from './linkContext';
import { baseName } from '../workspace/api';
import { resolveLink } from '../workspace/links';
import i18n from '../i18n';

interface SlashItem {
  label: string;
  detail: string;
  /** Texto inserido no lugar do `/…`. Use `\n` livremente. */
  text: string;
  /** Offset do cursor dentro de `text` após inserir. */
  cursor: number;
}

const ITEMS: SlashItem[] = [
  { label: 'Título 1', detail: '= ', text: '= ', cursor: 2 },
  { label: 'Título 2', detail: '== ', text: '== ', cursor: 3 },
  { label: 'Título 3', detail: '=== ', text: '=== ', cursor: 4 },
  { label: 'Título 4', detail: '==== ', text: '==== ', cursor: 5 },
  { label: 'Lista', detail: '* item', text: '* ', cursor: 2 },
  { label: 'Lista numerada', detail: '. item', text: '. ', cursor: 2 },
  { label: 'Tarefa', detail: '* [ ] item', text: '* [ ] ', cursor: 6 },
  { label: 'Citação', detail: '[quote]', text: '[quote]\n____\n\n____\n', cursor: 13 },
  {
    label: 'Bloco de código',
    detail: '[source,lang]',
    text: '[source,]\n----\n\n----\n',
    cursor: 8,
  },
  { label: 'Nota (NOTE)', detail: 'admoestação', text: 'NOTE: ', cursor: 6 },
  { label: 'Dica (TIP)', detail: 'admoestação', text: 'TIP: ', cursor: 5 },
  { label: 'Importante (IMPORTANT)', detail: 'admoestação', text: 'IMPORTANT: ', cursor: 11 },
  { label: 'Aviso (WARNING)', detail: 'admoestação', text: 'WARNING: ', cursor: 9 },
  { label: 'Cuidado (CAUTION)', detail: 'admoestação', text: 'CAUTION: ', cursor: 9 },
  {
    label: 'Tabela',
    detail: '|===',
    text: '[cols="1,1"]\n|===\n| \n| \n\n| \n| \n|===\n',
    cursor: 20,
  },
  { label: 'Régua', detail: "'''", text: "'''\n", cursor: 4 },
  { label: 'Quebra de página', detail: '<<<', text: '<<<\n', cursor: 4 },
  { label: 'Imagem', detail: 'image::', text: 'image::[]\n', cursor: 7 },
  { label: 'Link', detail: 'link:url[texto]', text: 'link:[]', cursor: 5 },
  { label: 'Referência cruzada', detail: '<<id>>', text: '<<>>', cursor: 2 },
  { label: 'Nota de rodapé', detail: 'footnote:[]', text: 'footnote:[]', cursor: 10 },
  { label: 'Comentário', detail: '// …', text: '// ', cursor: 3 },
  { label: 'Bloco de exemplo', detail: '[example]', text: '[example]\n====\n\n====\n', cursor: 15 },
  { label: 'Bloco lateral (sidebar)', detail: '****', text: '****\n\n****\n', cursor: 5 },
  { label: 'Sumário', detail: ':toc:', text: ':toc:\n', cursor: 6 },
  { label: 'Passagem literal', detail: '++++', text: '++++\n\n++++\n', cursor: 5 },
];

const LABEL_KEYS: Record<string, string> = {
  'Título 1': 'slash.heading',
  'Título 2': 'slash.heading',
  'Título 3': 'slash.heading',
  'Título 4': 'slash.heading',
  Lista: 'slash.list',
  'Lista numerada': 'slash.orderedList',
  Tarefa: 'slash.task',
  Citação: 'slash.quote',
  'Bloco de código': 'slash.code',
  'Nota (NOTE)': 'slash.note',
  'Dica (TIP)': 'slash.tip',
  'Importante (IMPORTANT)': 'slash.important',
  'Aviso (WARNING)': 'slash.warning',
  'Cuidado (CAUTION)': 'slash.caution',
  Tabela: 'slash.table',
  Régua: 'slash.ruler',
  'Quebra de página': 'slash.pageBreak',
  Imagem: 'slash.image',
  Link: 'slash.link',
  'Referência cruzada': 'slash.xref',
  'Nota de rodapé': 'slash.footnote',
  Comentário: 'slash.comment',
  'Bloco de exemplo': 'slash.example',
  'Bloco lateral (sidebar)': 'slash.sidebar',
  Sumário: 'slash.toc',
  'Passagem literal': 'slash.passthrough',
};

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function slashSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const m = /^(\s*)\/([\p{L}\d ]*)$/u.exec(before);
  if (!m) return null;

  const from = line.from + m[1].length; // posição do "/"
  const query = fold(m[2]);
  const localized = ITEMS.map((it) => {
    const level = Number(it.label.match(/\d+$/)?.[0] ?? 0);
    return {
      ...it,
      label: i18n.t(LABEL_KEYS[it.label] ?? it.label, { level }),
      detail: it.detail === 'admoestação' ? i18n.t('slash.admonition') : it.detail,
    };
  });
  const matched = query ? localized.filter((it) => fold(it.label).includes(query)) : localized;
  if (matched.length === 0) return null;

  const options: Completion[] = matched.map((it) => ({
    label: it.label,
    detail: it.detail,
    type: 'keyword',
    apply: (view, _c, a, b) => {
      view.dispatch({
        changes: { from: a, to: b, insert: it.text },
        selection: { anchor: a + it.cursor },
        scrollIntoView: true,
      });
    },
  }));
  // filter:false — nós já filtramos por m[2]; o CM não deve refiltrar pela "/query".
  return { from, to: context.pos, options, filter: false };
}

/** Dispara a lista assim que o `/` é digitado no início da linha. */
const triggerOnSlash = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  let typedSlash = false;
  update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.toString() === '/') typedSlash = true;
  });
  if (!typedSlash) return;
  const { state } = update;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  if (/^\s*\/$/.test(line.text.slice(0, pos - line.from))) {
    startCompletion(update.view);
  }
});

/** Autocomplete de referência entre notas — `xref:` e `[[` (tarefa 39). */
function refSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const notes = getNotes();
  if (notes.length === 0) return null;

  // âncora: `xref:alvo#frag` ou `[[alvo#frag`
  const anchorM = /(?:xref:|\[\[)([^\s[\]#|]+)#([^\s[\]|]*)$/.exec(before);
  if (anchorM) {
    const r = resolveLink(notes, getCurrentNotePath(), anchorM[1], null);
    const target = notes.find((n) => n.path === r.path);
    if (!target) return null;
    const from = context.pos - anchorM[2].length;
    return {
      from,
      to: context.pos,
      options: target.anchors.map((a) => ({ label: a, type: 'property' })),
      filter: true,
    };
  }

  // nota: `xref:xxx` ou `[[xxx`
  const noteM = /(xref:|\[\[)([^\s[\]#|]*)$/.exec(before);
  if (!noteM) return null;
  const wiki = noteM[1] === '[[';
  const from = context.pos - noteM[2].length;
  const options: Completion[] = notes.map((n) => {
    const stem = baseName(n.path).replace(/\.(adoc|asciidoc|asc)$/i, '');
    const insert = wiki ? `${n.title || stem}]]` : `${baseName(n.path)}[${n.title || stem}]`;
    return {
      label: n.title || stem,
      detail: baseName(n.path),
      type: 'file',
      apply: (view, _c, a, b) => {
        view.dispatch({
          changes: { from: a, to: b, insert },
          selection: { anchor: a + insert.length },
        });
      },
    };
  });
  return { from, to: context.pos, options, filter: true };
}

export function slashMenu() {
  return [
    autocompletion({
      override: [slashSource, refSource],
      icons: false,
      activateOnTyping: true,
    }),
    triggerOnSlash,
  ];
}
