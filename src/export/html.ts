/**
 * Exportação para HTML standalone (Fase 6, tarefas 47–49) e base compartilhada
 * com o export PDF (Fase 7). Gera um documento único, sem referência externa:
 * CSS do tema embutido, código realçado, imagens como data URI, links resolvidos.
 */
import asciidocCssRaw from '../render/asciidoc.css?raw';
import { renderAsciiDoc } from '../render/asciidoctor';
import { highlightWithin } from '../render/highlight';
import { assetUrl } from '../fs/assets';
import { preprocessWikilinks } from '../workspace/links';
import { baseName, type NoteInfo } from '../workspace/api';
import type { DocFont, HtmlExportOptions } from '../config/config';
import { exportFontCss } from './fonts';
import i18n from '../i18n';

export type { HtmlExportOptions };

const LIGHT_VARS = `--pv-fg:#1f2328;--pv-fg-dim:#656d76;--pv-bg:#fff;--pv-border:#d0d7de;--pv-code-bg:#f4f5f7;--pv-accent:#0969da;--pv-quote-bar:#d0d7de;--hl-keyword:#cf222e;--hl-string:#0a3069;--hl-number:#0550ae;--hl-comment:#6e7781;--hl-title:#6639ba;--hl-attr:#0550ae;--hl-built_in:#953800;--hl-meta:#8250df;`;
const DARK_VARS = `--pv-fg:#dfe1e6;--pv-fg-dim:#9aa0a6;--pv-bg:#1b1b1f;--pv-border:#33343b;--pv-code-bg:#26262b;--pv-accent:#6ea8fe;--pv-quote-bar:#3f4046;--hl-keyword:#c792ea;--hl-string:#c3e88d;--hl-number:#f78c6c;--hl-comment:#6b7280;--hl-title:#82aaff;--hl-attr:#ffcb6b;--hl-built_in:#89ddff;--hl-meta:#7f848e;`;

export function themeOverride(theme: HtmlExportOptions['theme']): string {
  if (theme === 'auto') return '';
  const vars = theme === 'dark' ? DARK_VARS : LIGHT_VARS;
  // redeclara dentro do @media também, para vencer o prefers-color-scheme
  return `\n:root{${vars}}\n@media (prefers-color-scheme: dark){:root{${vars}}}\n`;
}

export const BASE_EXPORT_CSS = asciidocCssRaw;

const EXPORT_CSS = `
:root{--ui-font:'Inter Variable',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;--mono-font:'JetBrains Mono Variable',ui-monospace,'Cascadia Code','Consolas',monospace}
body{margin:0}
.preview.export{max-width:820px;margin:0 auto;padding:40px 28px 80px}
.toc{border:1px solid var(--pv-border);border-radius:8px;padding:12px 16px;margin:0 0 28px;font-size:.92em}
.toc-title{font-weight:700;margin-bottom:6px}
.toc ul{list-style:none;margin:0;padding:0}
.toc ul ul{padding-left:16px}
.toc a{color:var(--pv-accent);text-decoration:none}
.toc a:hover{text-decoration:underline}
.xref-missing{color:var(--pv-fg-dim);border-bottom:1px dotted var(--pv-fg-dim)}
@media print{.preview.export{max-width:none}.toc{break-inside:avoid}}
`;

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function buildToc(body: HTMLElement, levels: number): HTMLElement | null {
  const sel = Array.from({ length: Math.min(levels, 5) }, (_, i) => `h${i + 2}`).join(',');
  const heads = Array.from(body.querySelectorAll<HTMLElement>(sel));
  if (heads.length < 2) return null;

  const minLevel = Math.min(...heads.map((h) => Number(h.tagName[1])));
  const toc = document.createElement('div');
  toc.id = 'toc';
  toc.className = 'toc';
  toc.innerHTML = `<div class="toc-title">${i18n.t('html.toc')}</div>`;
  const rootUl = document.createElement('ul');
  toc.append(rootUl);

  const lists: HTMLUListElement[] = [rootUl];
  heads.forEach((h, i) => {
    const level = Number(h.tagName[1]) - minLevel;
    if (!h.id) h.id = `_toc_${i}`;
    while (lists.length <= level) {
      const prev = lists[lists.length - 1];
      const nested = document.createElement('ul');
      (prev.lastElementChild ?? prev).append(nested);
      lists.push(nested);
    }
    lists.length = level + 1;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.textContent ?? '';
    li.append(a);
    lists[level].append(li);
  });
  return toc;
}

async function resolveImages(body: HTMLElement, notePath: string | null, embed: boolean) {
  const imgs = Array.from(body.querySelectorAll('img'));
  for (const img of imgs) {
    const raw = img.getAttribute('src') ?? '';
    if (/^data:/i.test(raw)) continue;
    const url = assetUrl(notePath, raw);
    if (embed) {
      const data = await toDataUrl(url);
      if (data) img.setAttribute('src', data);
      else img.setAttribute('alt', i18n.t('image.notFound', { path: raw }));
    } else {
      img.setAttribute('src', url);
    }
  }
}

export interface ExportBodyOptions {
  toc: boolean;
  tocLevels: number;
  sectnums: boolean;
  embedImages: boolean;
  /** true = manter os links `.html` para outras notas (export de site — tarefa 50). */
  linkNotes?: boolean;
}

/** Renderiza o corpo (`<div class="preview export">…`) já com highlight, imagens
 * embutidas, links marcados e ToC. Compartilhado por HTML e PDF. */
export async function renderExportBody(
  source: string,
  notePath: string | null,
  notes: NoteInfo[],
  opts: ExportBodyOptions,
): Promise<{ body: HTMLElement; title: string }> {
  const prepared = preprocessWikilinks(source, notes, notePath);
  const baseDir = notePath ? notePath.replace(/[\\/][^\\/]*$/, '') : null;

  const attributes: Record<string, string> = {};
  if (opts.sectnums) attributes.sectnums = '';

  const result = await renderAsciiDoc(prepared, { baseDir, attributes, sourcemap: false });
  const doc = new DOMParser().parseFromString(
    `<div class="preview export">${result.html}</div>`,
    'text/html',
  );
  const body = doc.querySelector('.preview') as HTMLElement;

  highlightWithin(body);
  await resolveImages(body, notePath, opts.embedImages);
  if (!opts.linkNotes) markMissingXrefs(body);

  const wantToc = opts.toc || /^:toc:/m.test(source);
  if (wantToc) {
    const toc = buildToc(body, opts.tocLevels);
    if (toc) {
      const h1 = body.querySelector('h1');
      if (h1 && h1.nextSibling) h1.parentNode?.insertBefore(toc, h1.nextSibling);
      else body.insertBefore(toc, body.firstChild);
    }
  }

  const titleEl = body.querySelector('h1');
  const title = (titleEl?.textContent || baseName(notePath ?? 'documento')).trim();
  return { body, title };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Links para notas não incluídas no export viram texto simples. */
function markMissingXrefs(body: HTMLElement) {
  body.querySelectorAll<HTMLAnchorElement>('a[href$=".html"], a[href*=".html#"]').forEach((a) => {
    const span = document.createElement('span');
    span.className = 'xref-missing';
    span.title = i18n.t('html.externalLinkTitle', { href: a.getAttribute('href') });
    span.textContent = a.textContent ?? '';
    a.replaceWith(span);
  });
}

/** Monta uma página HTML completa a partir de um corpo já renderizado. */
export function wrapHtmlPage(
  title: string,
  bodyHtml: string,
  theme: HtmlExportOptions['theme'],
  extraCss = '',
): string {
  return `<!doctype html>
<html lang="${i18n.language}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${asciidocCssRaw}
${themeOverride(theme)}
${EXPORT_CSS}
${extraCss}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

export async function buildStandaloneHtml(
  source: string,
  notePath: string | null,
  notes: NoteInfo[],
  opts: HtmlExportOptions,
  docFont: DocFont = 'inter',
): Promise<string> {
  const { body, title } = await renderExportBody(source, notePath, notes, opts);
  return wrapHtmlPage(title, body.outerHTML, opts.theme, exportFontCss(docFont));
}
