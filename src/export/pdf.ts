/**
 * Exportação para PDF (Fase 7).
 *
 * Caminho atual: gera um HTML com CSS Paged Media (`@page`, quebras sensatas) e
 * aciona a impressão do webview num iframe oculto — o usuário escolhe
 * "Salvar como PDF" no diálogo do SO (tarefa 52). Os comandos nativos
 * `print_to_pdf` (WebView2 / WebKitGTK, tarefas 55/56) e o ToC com número de
 * página (54) continuam no `fazer`.
 */
import { BASE_EXPORT_CSS, escapeHtml, renderExportBody, themeOverride } from './html';
import { exportFontCss } from './fonts';
import type { NoteInfo } from '../workspace/api';
import type { DocFont, PdfExportOptions } from '../config/config';
import i18n from '../i18n';

export type { PdfExportOptions };

const MARGINS: Record<PdfExportOptions['margin'], string> = {
  narrow: '12mm',
  normal: '20mm',
  wide: '30mm',
};

function pagedCss(opts: PdfExportOptions): string {
  const size = opts.pageSize === 'Letter' ? 'letter' : opts.pageSize === 'Legal' ? 'legal' : 'A4';
  return `
@page { size: ${size}; margin: ${MARGINS[opts.margin]}; }
html, body { background: #fff; }
.preview.export {
  max-width: none; margin: 0; padding: 0;
  font-size: 11pt; line-height: 1.5;
}
.toc { border: none; padding: 0; margin: 0 0 12pt; }
.toc a { color: inherit; }
h1, h2, h3, h4 { break-after: avoid; }
pre, table, .admonitionblock, .imageblock, .listingblock, figure, blockquote {
  break-inside: avoid;
}
img { max-width: 100%; }
a { color: inherit; text-decoration: underline; }
${opts.toc ? '.toc { break-after: page; }' : ''}
${opts.pageBreakBeforeH1 ? '.preview.export > h1:not(:first-child) { break-before: page; }' : ''}
${opts.pageBreakBeforeH1 ? '.preview.export > .sect1 > h2 { break-before: page; }' : ''}
@media print { a[href^="http"]::after { content: " (" attr(href) ")"; font-size: .8em; color: #666; } }
`;
}

export interface PrintDoc {
  html: string;
  /** Títulos do documento, para os marcadores do PDF (tarefa 57). */
  headings: Array<{ text: string; level: number }>;
}

export async function buildPrintDoc(
  source: string,
  notePath: string | null,
  notes: NoteInfo[],
  opts: PdfExportOptions,
  docFont: DocFont = 'inter',
): Promise<PrintDoc> {
  const { body, title } = await renderExportBody(source, notePath, notes, {
    toc: opts.toc,
    tocLevels: opts.tocLevels,
    sectnums: opts.sectnums,
    embedImages: true,
  });

  const headings = Array.from(body.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .filter((h) => !h.closest('.toc'))
    .map((h) => ({ text: (h.textContent ?? '').trim(), level: Number(h.tagName[1]) }))
    .filter((h) => h.text.length > 0);

  const html = `<!doctype html>
<html lang="${i18n.language}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
${exportFontCss(docFont)}
${BASE_EXPORT_CSS}
${themeOverride(opts.theme)}
${pagedCss(opts)}
</style>
</head>
<body>
${body.outerHTML}
</body>
</html>
`;
  return { html, headings };
}

/** Abre o diálogo de impressão do SO com o HTML dado (num iframe oculto). */
export function printViaBrowser(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    iframe.srcdoc = html;

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.setTimeout(() => {
        iframe.remove();
        resolve();
      }, 500);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) return finish();
      const go = () => {
        try {
          win.focus();
          win.print();
        } catch {
          /* ignore */
        }
        finish();
      };
      const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts?.ready) void fonts.ready.then(go).catch(go);
      else window.setTimeout(go, 150);
    };

    document.body.append(iframe);
  });
}
