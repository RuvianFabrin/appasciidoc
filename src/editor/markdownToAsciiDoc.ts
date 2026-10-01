/**
 * Conversão best-effort de Markdown → AsciiDoc ao colar (tarefa 120).
 *
 * Não é um parser completo: cobre os casos comuns de um README. O usuário pode
 * desfazer com `Ctrl+Z` (a colagem é uma transação única).
 */

/** Heurística: o texto colado parece Markdown? */
export function looksLikeMarkdown(text: string): boolean {
  const signals = [
    /^#{1,6}\s+\S/m, // # título
    /\*\*[^\n*]+\*\*/, // **negrito**
    /!\[[^\]]*\]\([^)]+\)/, // ![img](src)
    /(?<!!)\[[^\]]+\]\([^)]+\)/, // [texto](url)
    /^```/m, // cerca de código
    /^\s*[-*+]\s+\[[ xX]\]\s/m, // - [ ] tarefa
    /^\s*>\s+\S/m, // > citação
    /^\s*\|.+\|\s*$/m, // | tabela |
  ];
  return signals.some((re) => re.test(text));
}

// marcadores temporários para o negrito não ser reprocessado como itálico
const BOLD_OPEN = 'BOLD';
const BOLD_CLOSE = '/BOLD';

function convertInline(s: string): string {
  return (
    s
      // imagens antes de links
      .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, 'image:$2[$1]')
      // links
      .replace(/(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, t: string, u: string) =>
        /^(https?:|mailto:|ftp:)/.test(u) ? `link:${u}[${t}]` : `xref:${u}[${t}]`,
      )
      // negrito **x** / __x__ → marcadores
      .replace(/\*\*([^\n*]+)\*\*/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`)
      .replace(/(?<!\w)__([^\n_]+)__(?!\w)/g, `${BOLD_OPEN}$1${BOLD_CLOSE}`)
      // itálico *x* / _x_ (simples) → _x_
      .replace(/(?<![\w*])\*([^\n*]+)\*(?![\w*])/g, '_$1_')
      // ~~riscado~~ → [.line-through]#x#
      .replace(/~~([^\n~]+)~~/g, '[.line-through]#$1#')
      // restaura o negrito
      .split(BOLD_OPEN)
      .join('*')
      .split(BOLD_CLOSE)
      .join('*')
  );
}

export function markdownToAsciiDoc(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inFence = false;
  let quote: string[] = [];
  let table: string[][] = [];

  const flushQuote = () => {
    if (quote.length) {
      out.push('[quote]', '____', ...quote, '____');
      quote = [];
    }
  };
  const flushTable = () => {
    if (table.length) {
      out.push('|===');
      for (const row of table) out.push(row.map((c) => `| ${c}`).join(' '));
      out.push('|===');
      table = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    const fence = /^```(.*)$/.exec(line.trim());
    if (fence) {
      flushQuote();
      flushTable();
      if (!inFence) {
        const lang = fence[1].trim();
        out.push(lang ? `[source,${lang}]` : '[source]', '----');
        inFence = true;
      } else {
        out.push('----');
        inFence = false;
      }
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    // tabela pipe: acumula linhas, ignora a linha separadora |---|---|
    if (/^\s*\|.*$/.test(line) && line.includes('|')) {
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-')) continue; // separador
      const cells = line
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => convertInline(c.trim()));
      table.push(cells);
      if (!/^\s*\|.*$/.test(lines[i + 1] ?? '')) flushTable();
      continue;
    }
    flushTable();

    // citação: acumula linhas `> ...`
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      quote.push(convertInline(q[1]));
      continue;
    }
    flushQuote();

    // título ATX
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      out.push(`${'='.repeat(h[1].length)} ${convertInline(h[2])}`);
      continue;
    }

    // régua
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push("'''");
      continue;
    }

    // item de tarefa
    const task = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (task) {
      out.push(
        `${task[1]}* [${task[2].toLowerCase() === 'x' ? 'x' : ' '}] ${convertInline(task[3])}`,
      );
      continue;
    }

    // bullet
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      out.push(`${bullet[1]}* ${convertInline(bullet[2])}`);
      continue;
    }

    // ordenada
    const ol = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      out.push(`${ol[1]}. ${convertInline(ol[2])}`);
      continue;
    }

    out.push(convertInline(line));
  }

  flushTable();
  flushQuote();
  if (inFence) out.push('----');

  return out.join('\n');
}
