/**
 * Cabeçalho do documento AsciiDoc (tarefa 112).
 *
 * `= Título` na linha 1; opcionalmente autor na linha 2 (`Nome <email>`) e
 * revisão na linha 3 (`v1.0, 2026-08-28: nota`); depois um bloco de
 * `:nome: valor` até a primeira linha em branco.
 */

export interface DocAttr {
  name: string;
  value: string;
}

export interface DocHeader {
  title: string;
  author: string;
  revision: string;
  attrs: DocAttr[];
  /** Nº da última linha (1-based) que pertence ao cabeçalho. */
  endLine: number;
}

const ATTR_LINE = /^:([\w][\w-]*!?):(?:\s+(.*))?$/;

/** Interpreta o cabeçalho. Retorna `null` se a linha 1 não for `= Título`. */
export function parseDocHeader(content: string): DocHeader | null {
  const lines = content.split('\n');
  const t = /^=\s+(\S.*)$/.exec(lines[0] ?? '');
  if (!t) return null;

  const title = t[1].trim();
  let i = 1;
  let author = '';
  let revision = '';

  const isMeta = (s: string | undefined) =>
    s !== undefined && s.trim() !== '' && !ATTR_LINE.test(s.trim()) && !s.startsWith('//');

  if (isMeta(lines[1])) {
    author = lines[1].trim();
    i = 2;
    if (isMeta(lines[2])) {
      revision = lines[2].trim();
      i = 3;
    }
  }

  const attrs: DocAttr[] = [];
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === '') break;
    const m = ATTR_LINE.exec(line);
    if (!m) break;
    attrs.push({ name: m[1], value: (m[2] ?? '').trim() });
    i += 1;
  }

  return { title, author, revision, attrs, endLine: i };
}

/** Reconstrói o texto do cabeçalho (linhas 1..endLine) a partir de um `DocHeader`. */
export function buildDocHeader(h: DocHeader): string {
  const out = [`= ${h.title}`.trimEnd()];
  if (h.author.trim()) {
    out.push(h.author.trim());
    if (h.revision.trim()) out.push(h.revision.trim());
  }
  for (const a of h.attrs) {
    out.push(a.value ? `:${a.name}: ${a.value}` : `:${a.name}:`);
  }
  return out.join('\n');
}
