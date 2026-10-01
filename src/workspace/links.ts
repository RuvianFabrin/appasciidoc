/**
 * Resolução de links entre notas + backlinks + relatório de links quebrados
 * (Fase 5, tarefas 39–43).
 */
import { baseName, dirName, type NoteInfo, type OutLink } from './api';

const EXTERNAL_RE = /^(https?:|mailto:|ftp:|tel:)/i;
const ADOC_EXT_RE = /\.(adoc|asciidoc|asc)$/i;

export interface Resolved {
  /** Caminho absoluto da nota-alvo, ou `null` se não resolveu. */
  path: string | null;
  anchor: string | null;
  external: boolean;
}

function stem(p: string): string {
  return baseName(p).replace(ADOC_EXT_RE, '').toLowerCase();
}

function joinNorm(dir: string, rel: string): string {
  const parts = `${dir}/${rel}`.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

export function resolveLink(
  notes: NoteInfo[],
  fromPath: string | null,
  target: string,
  anchor: string | null,
): Resolved {
  const t = target.trim();
  if (!t && anchor) return { path: fromPath, anchor, external: false };
  if (EXTERNAL_RE.test(t)) return { path: null, anchor: null, external: true };

  const norm = t.replace(/\\/g, '/');
  const lc = norm.toLowerCase();

  // 1) caminho relativo com extensão .adoc
  if (ADOC_EXT_RE.test(norm) && fromPath) {
    const abs = joinNorm(dirName(fromPath), norm).toLowerCase();
    const hit = notes.find((n) => n.path.toLowerCase() === abs);
    if (hit) return { path: hit.path, anchor, external: false };
  }
  // 2) por nome de arquivo (sem extensão), em qualquer lugar
  const byStem = notes.find((n) => stem(n.path) === stem(norm));
  if (byStem) return { path: byStem.path, anchor, external: false };
  // 3) por título
  const byTitle = notes.find((n) => n.title.trim().toLowerCase() === lc);
  if (byTitle) return { path: byTitle.path, anchor, external: false };
  // 4) id de âncora (xref/<<>> só com id)
  if (!anchor && !norm.includes('/')) {
    const self = notes.find((n) => n.path === fromPath);
    if (self?.anchors.some((a) => a.toLowerCase() === lc)) {
      return { path: fromPath, anchor: t, external: false };
    }
    const byAnchor = notes.find((n) => n.anchors.some((a) => a.toLowerCase() === lc));
    if (byAnchor) return { path: byAnchor.path, anchor: t, external: false };
  }
  return { path: null, anchor, external: false };
}

export interface Backlink {
  fromPath: string;
  fromTitle: string;
  line: number;
}

export function backlinksFor(notes: NoteInfo[], targetPath: string | null): Backlink[] {
  if (!targetPath) return [];
  const out: Backlink[] = [];
  for (const n of notes) {
    if (n.path === targetPath) continue;
    for (const l of n.outLinks) {
      const r = resolveLink(notes, n.path, l.target, l.anchor);
      if (r.path === targetPath) {
        out.push({ fromPath: n.path, fromTitle: n.title || baseName(n.path), line: l.line });
      }
    }
  }
  return out.sort((a, b) => a.fromTitle.localeCompare(b.fromTitle));
}

export interface GraphNode {
  path: string;
  title: string;
}

/** Vizinhos da nota atual: notas para as quais ela aponta (tarefa 46). */
export function outNeighbors(notes: NoteInfo[], fromPath: string | null): GraphNode[] {
  if (!fromPath) return [];
  const self = notes.find((n) => n.path === fromPath);
  if (!self) return [];
  const seen = new Set<string>();
  const out: GraphNode[] = [];
  for (const l of self.outLinks) {
    const r = resolveLink(notes, fromPath, l.target, l.anchor);
    if (!r.path || r.path === fromPath || seen.has(r.path)) continue;
    seen.add(r.path);
    const n = notes.find((x) => x.path === r.path);
    out.push({ path: r.path, title: n?.title || baseName(r.path) });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export interface BrokenLink {
  fromPath: string;
  fromTitle: string;
  line: number;
  target: string;
  kind: OutLink['kind'];
}

export function unresolvedLinks(notes: NoteInfo[]): BrokenLink[] {
  const out: BrokenLink[] = [];
  for (const n of notes) {
    for (const l of n.outLinks) {
      // `link:` para recurso externo ou arquivo não-adoc não é "quebrado"
      if (l.kind === 'link' && !ADOC_EXT_RE.test(l.target) && !/^[\w.\- /]+$/.test(l.target)) {
        continue;
      }
      const r = resolveLink(notes, n.path, l.target, l.anchor);
      if (!r.external && !r.path) {
        out.push({
          fromPath: n.path,
          fromTitle: n.title || baseName(n.path),
          line: l.line,
          target: l.anchor ? `${l.target}#${l.anchor}` : l.target,
          kind: l.kind,
        });
      }
    }
  }
  return out;
}

const WIKILINK_RE = /\[\[([^\][|#\n]+)(?:#([^\][|\n]+))?(?:\|([^\][\n]+))?\]\]/g;

/**
 * Reescreve `[[nota#sec|texto]]` para `xref:`/`link:` (ou texto puro se não
 * resolver) — para o Asciidoctor entender no preview e no export (tarefas 40/49).
 */
export function preprocessWikilinks(
  source: string,
  notes: NoteInfo[],
  fromPath: string | null,
): string {
  return source.replace(WIKILINK_RE, (_whole, target: string, anchor?: string, label?: string) => {
    const t = target.trim();
    const a = anchor?.trim() || null;
    const text = (label?.trim() || t + (a ? ` › ${a}` : '')).replace(/[[\]]/g, '');
    const r = resolveLink(notes, fromPath, t, a);
    if (r.external) return `link:${t}[${text}]`;
    if (!r.path) return text; // não resolveu → texto puro
    const file = baseName(r.path);
    return `xref:${file}${r.anchor ? `#${r.anchor}` : ''}[${text}]`;
  });
}

/** Encontra a linha (1-based) de uma âncora dentro do texto de uma nota. */
export function anchorLine(content: string, anchor: string): number | null {
  const want = anchor.toLowerCase();
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (
      t === `[[${anchor}]]` ||
      t.startsWith(`[[${anchor},`) ||
      t === `[#${anchor}]` ||
      t.startsWith(`[#${anchor}`) ||
      t.includes(`anchor:${anchor}[`)
    ) {
      return i + 1;
    }
    const h = /^(={2,6})\s+(.+)$/.exec(t);
    if (h && slug(h[2]) === want) return i + 1;
  }
  return null;
}

function slug(title: string): string {
  let s = '_';
  let prevSep = true;
  for (const ch of title.trim()) {
    if (/[\p{L}\p{N}]/u.test(ch)) {
      s += ch.toLowerCase();
      prevSep = false;
    } else if (!prevSep) {
      s += '_';
      prevSep = true;
    }
  }
  return s.replace(/_+$/, '') || '_';
}
