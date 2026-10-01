/**
 * Ponte com o Asciidoctor.js (tarefa 15). O pacote `@asciidoctor/core` é
 * empacotado no bundle (sem CDN) e carregado sob demanda no primeiro render.
 */
import type { Asciidoctor } from '@asciidoctor/core';

export type Severity = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface RenderMessage {
  severity: Severity;
  text: string;
  line: number | null;
  file: string | null;
}

export interface RenderResult {
  html: string;
  messages: RenderMessage[];
  /** Linha-fonte de cada bloco renderizado, em ordem de documento (tarefa 17). */
  sourceLines: number[];
  durationMs: number;
}

let enginePromise: Promise<Asciidoctor> | null = null;
let readyEngine: Asciidoctor | null = null;
const readyCallbacks = new Set<() => void>();

async function getEngine(): Promise<Asciidoctor> {
  if (!enginePromise) {
    enginePromise = import('@asciidoctor/core').then((mod) => {
      readyEngine = mod.default();
      readyCallbacks.forEach((cb) => cb());
      readyCallbacks.clear();
      return readyEngine;
    });
  }
  return enginePromise;
}

/** Pré-carrega o motor (chamado quando o preview / bloco inline é aberto). */
export function warmUpEngine(): void {
  void getEngine();
}

export function engineReady(): boolean {
  return readyEngine !== null;
}

/** Executa `cb` quando o motor estiver pronto (agora, se já estiver). */
export function onEngineReady(cb: () => void): void {
  if (readyEngine) cb();
  else readyCallbacks.add(cb);
}

const fragmentCache = new Map<string, string>();

/**
 * Render síncrono de um trecho de AsciiDoc (bloco isolado) — para os widgets do
 * modo inline (tabelas, admonições, citações). Retorna `null` se o motor ainda
 * não carregou; nesse caso chame `warmUpEngine()` + `onEngineReady(...)`.
 */
export function renderFragmentSync(source: string, baseDir?: string | null): string | null {
  if (!readyEngine) return null;
  const cached = fragmentCache.get(source);
  if (cached !== undefined) return cached;
  try {
    const doc = readyEngine.load(source, {
      standalone: false,
      safe: 'secure',
      attributes: {
        'source-highlighter': 'highlight.js',
        showtitle: '',
        sectanchors: '',
      },
      ...(baseDir ? { base_dir: baseDir } : {}),
    });
    const html = doc.convert();
    if (fragmentCache.size > 200) fragmentCache.clear();
    fragmentCache.set(source, html);
    return html;
  } catch {
    return null;
  }
}

interface RawLocation {
  getLineNumber?: () => number;
  getFile?: () => string | null | undefined;
}
interface RawEntry {
  getSeverity?: () => string;
  severity?: string;
  getText?: () => string;
  text?: string;
  message?: string | { text?: string };
  getSourceLocation?: () => RawLocation | undefined;
}
interface RawBlock {
  getContext?: () => string;
  getLineNumber?: () => number | undefined;
  getBlocks?: () => RawBlock[];
}

function parseEntry(entry: RawEntry): RenderMessage {
  const severity = String(
    entry.getSeverity?.() ?? entry.severity ?? 'WARN',
  ).toUpperCase() as Severity;

  let text = entry.getText?.() ?? entry.text ?? '';
  if (!text) {
    const m = entry.message;
    text = typeof m === 'string' ? m : (m?.text ?? '');
  }

  const loc = entry.getSourceLocation?.();
  return {
    severity,
    text,
    line: loc?.getLineNumber?.() ?? null,
    file: loc?.getFile?.() ?? null,
  };
}

// Contextos da AST sem elemento de bloco correspondente no HTML embutido.
const SKIP_CONTEXTS = new Set(['preamble', 'floating_title', 'document']);

function collectSourceLines(blocks: RawBlock[], out: number[]): void {
  for (const block of blocks) {
    const ctx = block.getContext?.();
    const ln = block.getLineNumber?.();
    if (!ctx || !SKIP_CONTEXTS.has(ctx)) {
      out.push(typeof ln === 'number' ? ln : 0);
    }
    const children = block.getBlocks?.() ?? [];
    if (children.length) collectSourceLines(children, out);
  }
}

/**
 * O Asciidoctor.js não emite aviso para `<<id>>` não resolvido; fazemos uma
 * checagem própria (tarefa 20). A resolução completa de wikilinks e xref entre
 * arquivos é da Fase 5 (tarefas 40, 43).
 */
const REF_RE = /<<([^,<>\n]+?)(?:,[^<>\n]*)?>>|xref:([^[\s#\]]+)(?:#[^[\]]*)?\[/g;

function checkReferences(source: string, html: string): RenderMessage[] {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return [];
  }
  const ids = new Set<string>();
  doc.querySelectorAll('[id]').forEach((el) => ids.add(el.id));
  const titles = new Set<string>();
  doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    const t = (h.textContent ?? '').trim().toLowerCase();
    if (t) titles.add(t);
  });

  const out: RenderMessage[] = [];
  source.split('\n').forEach((lineText, i) => {
    REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = REF_RE.exec(lineText)) !== null) {
      const raw = (m[1] ?? m[2] ?? '').trim();
      const target = raw.split('#')[0].trim();
      if (!target || target.includes('://')) continue;
      if (/\.(adoc|asciidoc|html?|pdf)$/i.test(target)) continue; // cross-doc: Fase 5
      const norm = target.toLowerCase();
      if (ids.has(target) || titles.has(norm) || titles.has(norm.replace(/[-_]+/g, ' '))) {
        continue;
      }
      out.push({
        severity: 'WARN',
        text: `referência não resolvida: ${raw}`,
        line: i + 1,
        file: null,
      });
    }
  });
  return out;
}

export interface RenderOptions {
  baseDir?: string | null;
  /** Atributos extras (ex.: `toc`, `sectnums`) para exportação. */
  attributes?: Record<string, string>;
  /** `standalone: true` gera o HTML completo (só usado no export). */
  standalone?: boolean;
  sourcemap?: boolean;
}

export async function renderAsciiDoc(
  source: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const engine = await getEngine();
  const started = performance.now();

  const memoryLogger = engine.MemoryLogger.create();
  const previousLogger = engine.LoggerManager.getLogger();
  engine.LoggerManager.setLogger(memoryLogger);

  let html = '';
  const sourceLines: number[] = [];
  try {
    const doc = engine.load(source, {
      standalone: options.standalone ?? false,
      sourcemap: options.sourcemap ?? true,
      // 'secure': sem leitura de arquivos/includes a partir do preview.
      safe: 'secure',
      attributes: {
        'source-highlighter': 'highlight.js',
        showtitle: '',
        sectanchors: '',
        experimental: '',
        'skip-front-matter': '',
        ...options.attributes,
      },
      ...(options.baseDir ? { base_dir: options.baseDir } : {}),
    });
    html = doc.convert();
    collectSourceLines((doc as unknown as RawBlock).getBlocks?.() ?? [], sourceLines);
  } finally {
    engine.LoggerManager.setLogger(previousLogger);
  }

  const messages = [
    ...(memoryLogger.getMessages() as unknown as RawEntry[]).map(parseEntry),
    ...checkReferences(source, html),
  ];
  return { html, messages, sourceLines, durationMs: performance.now() - started };
}

/** Seletor dos elementos de bloco no HTML embutido, em ordem de documento. */
export const BLOCK_SELECTOR = [
  '.sect1',
  '.sect2',
  '.sect3',
  '.sect4',
  '.sect5',
  '.paragraph',
  '.listingblock',
  '.literalblock',
  '.admonitionblock',
  '.ulist',
  '.olist',
  '.dlist',
  '.colist',
  '.exampleblock',
  '.quoteblock',
  '.verseblock',
  '.sidebarblock',
  '.openblock',
  '.imageblock',
  '.videoblock',
  '.audioblock',
  '.tableblock',
  'hr',
].join(',');

/** Marca cada elemento de bloco com `data-line` a partir da lista da AST. */
export function applyLineMap(container: HTMLElement, sourceLines: number[]): void {
  const els = container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR);
  const count = Math.min(els.length, sourceLines.length);
  for (let i = 0; i < count; i += 1) {
    const line = sourceLines[i];
    if (line && line > 0) els[i].dataset.line = String(line);
  }
}
