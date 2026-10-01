/**
 * Parser leve de AsciiDoc para o CodeMirror (tarefa 21).
 *
 * É um `StreamParser` (linha a linha) — suficiente para colorir a sintaxe no
 * "modo fonte" e barato o bastante para arquivos grandes. As decorations do
 * modo inline (tarefas 22–25) fazem a varredura própria e não dependem disto.
 */
import { StreamLanguage, type StreamParser, LanguageSupport } from '@codemirror/language';

interface State {
  /** Delimitador que abriu um bloco verbatim (sem marcação interna). */
  verbatim: string | null;
  /** Delimitador de bloco não-verbatim aberto (`====`, `****`, `____`, `--`). */
  block: string | null;
  inTable: boolean;
  /** O resto da linha pertence a um título. */
  headingRest: boolean;
}

const VERBATIM_DELIMS = ['----', '....', '++++'];
const BLOCK_DELIMS = ['====', '****', '____', '--'];

function isBlankOrDelim(line: string, delim: string): boolean {
  return line.trimEnd() === delim;
}

const parser: StreamParser<State> = {
  startState: () => ({ verbatim: null, block: null, inTable: false, headingRest: false }),

  token(stream, state) {
    // ---- início de linha ----
    if (stream.sol()) {
      state.headingRest = false;
      const line = stream.string;

      if (state.verbatim) {
        if (isBlankOrDelim(line, state.verbatim)) {
          state.verbatim = null;
          stream.skipToEnd();
          return 'processingInstruction';
        }
        stream.skipToEnd();
        return 'string';
      }

      if (state.inTable && line.trimEnd() === '|===') {
        state.inTable = false;
        stream.skipToEnd();
        return 'processingInstruction';
      }

      const trimmed = line.trim();

      if (VERBATIM_DELIMS.includes(trimmed)) {
        state.verbatim = trimmed;
        stream.skipToEnd();
        return 'processingInstruction';
      }
      if (BLOCK_DELIMS.includes(trimmed)) {
        state.block = state.block === trimmed ? null : trimmed;
        stream.skipToEnd();
        return 'processingInstruction';
      }
      if (trimmed === '|===') {
        state.inTable = true;
        stream.skipToEnd();
        return 'processingInstruction';
      }
      if (trimmed.startsWith('//') && !trimmed.startsWith('///')) {
        stream.skipToEnd();
        return 'comment';
      }
      // linha de atributos de bloco: [source,js] , [NOTE] , [.role]
      if (/^\[.*\]$/.test(trimmed)) {
        stream.skipToEnd();
        return 'meta';
      }
      // atributo de documento: :name: value
      if (/^:[\w!-]+:/.test(trimmed)) {
        stream.skipToEnd();
        return 'meta';
      }
      // título
      const h = /^(={1,6})(\s+)(?=\S)/.exec(line);
      if (h) {
        stream.pos += h[0].length;
        state.headingRest = true;
        return 'heading';
      }
      // marcador de lista / item de descrição
      const li = /^(\s*)([*.•-]+|\d+\.|\w+::?)(\s+)/.exec(line);
      if (li && (/[*.-]/.test(li[2]) || /^\d+\.$/.test(li[2]))) {
        stream.pos += li[0].length;
        return 'list';
      }
      if (trimmed.startsWith('|') && state.inTable) {
        stream.next();
        return 'separator';
      }
    }

    if (state.headingRest) {
      stream.skipToEnd();
      return 'heading';
    }
    if (state.verbatim) {
      stream.skipToEnd();
      return 'string';
    }

    // ---- inline ----
    const ch = stream.peek();
    if (ch == null) {
      stream.next();
      return null;
    }

    if (ch === '\\') {
      stream.next();
      stream.next();
      return null;
    }
    // checkbox
    if (stream.match(/^\[[ xX*]\]/)) return 'atom';
    // mono `code`
    if (ch === '`' && stream.match(/^`[^`\n]+`/)) return 'monospace';
    // strong *text* / **text**
    if (ch === '*' && stream.match(/^\*{1,2}[^*\n]+\*{1,2}/)) return 'strong';
    // emphasis _text_ / __text__
    if (ch === '_' && stream.match(/^_{1,2}[^_\n]+_{1,2}/)) return 'emphasis';
    // mark #text#
    if (ch === '#' && stream.match(/^#[^#\n]+#/)) return 'strong';
    // passthrough +text+
    if (ch === '+' && stream.match(/^\+[^+\n]+\+/)) return 'literal';
    // atributo {nome}
    if (ch === '{' && stream.match(/^\{[\w-]+\}/)) return 'atom';
    // xref <<id>>
    if (ch === '<' && stream.match(/^<<[^<>\n]+>>/)) return 'link';
    // macros: link: xref: image: kbd: etc.
    if (stream.match(/^(?:link|xref|image|mailto|kbd|btn|menu):{1,2}[^[\s]*\[[^\]\n]*\]/)) {
      return 'link';
    }
    // URL nua
    if (stream.match(/^https?:\/\/\S+/)) return 'url';
    // referência a nota de rodapé / anchor inline [[id]]
    if (stream.match(/^\[\[[^\]\n]+\]\]/)) return 'labelName';

    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: '//' },
  },
};

const language = StreamLanguage.define(parser);

export function asciidoc(): LanguageSupport {
  return new LanguageSupport(language);
}
