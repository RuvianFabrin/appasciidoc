/**
 * Exportar o workspace inteiro como site estático (tarefa 50).
 *
 * Uma página `.html` por nota (nomes achatados na raiz, com sufixo em caso de
 * colisão) + `index.html` com a lista. Imagens embutidas como data URI, então o
 * diretório é portátil e funciona offline. Links entre notas (`xref:`/wikilink)
 * são reescritos para o arquivo `.html` correspondente.
 */
import { renderExportBody, wrapHtmlPage, escapeHtml } from './html';
import { exportFontCss } from './fonts';
import { baseName, type NoteInfo } from '../workspace/api';
import type { DocFont, HtmlExportOptions } from '../config/config';
import i18n from '../i18n';

export interface SiteNote {
  path: string;
  title: string;
  content: string;
}

const NAV_CSS = `
.site-nav{max-width:820px;margin:0 auto;padding:14px 28px 0;font-size:.9em}
.site-nav a{color:var(--pv-accent);text-decoration:none}
.site-index{list-style:none;margin:0;padding:0}
.site-index li{padding:4px 0;border-bottom:1px solid var(--pv-border)}
`;

function stemOf(path: string): string {
  return baseName(path).replace(/\.(adoc|asciidoc|asc|txt)$/i, '');
}

function fileName(stem: string): string {
  return (
    stem
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'nota'
  );
}

/** Gera o mapa `caminho-no-site` → `HTML`. */
export async function buildSite(
  notes: SiteNote[],
  allNotes: NoteInfo[],
  opts: HtmlExportOptions,
  docFont: DocFont = 'inter',
): Promise<Map<string, string>> {
  const fontCss = exportFontCss(docFont);
  // nome de arquivo por nota (achatado, sem colisão)
  const fileOf = new Map<string, string>();
  const used = new Set<string>(['index.html']);
  for (const n of notes) {
    const base = fileName(stemOf(n.path));
    let name = `${base}.html`;
    let i = 2;
    while (used.has(name)) name = `${base}-${i++}.html`;
    used.add(name);
    fileOf.set(n.path, name);
  }
  // stem (minúsculo) → arquivo, para reescrever links entre notas
  const byStem = new Map<string, string>();
  for (const n of notes) {
    const s = stemOf(n.path).toLowerCase();
    if (!byStem.has(s)) byStem.set(s, fileOf.get(n.path)!);
  }

  const out = new Map<string, string>();

  for (const n of notes) {
    const { body, title } = await renderExportBody(n.content, n.path, allNotes, {
      toc: opts.toc,
      tocLevels: opts.tocLevels,
      sectnums: opts.sectnums,
      embedImages: true,
      linkNotes: true,
    });

    body.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      const m = /^([^/#?]+)\.html(#.*)?$/.exec(href);
      if (!m) return;
      const target = byStem.get(m[1].toLowerCase());
      if (target) a.setAttribute('href', target + (m[2] ?? ''));
      else a.classList.add('xref-missing');
    });

    const nav = `<nav class="site-nav"><a href="index.html">← ${i18n.t('html.index')}</a></nav>`;
    out.set(
      fileOf.get(n.path)!,
      wrapHtmlPage(title, nav + body.outerHTML, opts.theme, fontCss + NAV_CSS),
    );
  }

  const items = notes
    .slice()
    .sort((a, b) => (a.title || a.path).localeCompare(b.title || b.path))
    .map(
      (n) =>
        `<li><a href="${escapeHtml(fileOf.get(n.path)!)}">${escapeHtml(
          n.title || stemOf(n.path),
        )}</a></li>`,
    )
    .join('\n');
  const indexTitle = i18n.t('html.index');
  const indexBody = `<div class="preview export"><h1>${indexTitle}</h1><ul class="site-index">${items}</ul></div>`;
  out.set('index.html', wrapHtmlPage(indexTitle, indexBody, opts.theme, fontCss + NAV_CSS));

  return out;
}
