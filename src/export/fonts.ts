/**
 * Fontes embutidas na exportação HTML/PDF (data URI), para o arquivo exportado
 * ficar idêntico em qualquer máquina — mesma fonte do editor e do preview.
 *
 * Só o subconjunto `latin` (cobre PT-BR). O `?inline` faz o Vite devolver um
 * data URI base64 do `.woff2`.
 */
import interWoff2 from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline';
import literataWoff2 from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?inline';
import sourceSerifWoff2 from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2?inline';
import jetbrainsWoff2 from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?inline';
import type { DocFont } from '../config/config';
import { DOC_FONT_STACK } from '../platform/theme';

function face(family: string, url: string): string {
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:100 900;font-display:swap;src:url(${url}) format('woff2-variations')}`;
}

const MONO_FACE = face('JetBrains Mono Variable', jetbrainsWoff2);

const DOC_FACE: Record<Exclude<DocFont, 'system'>, string> = {
  inter: face('Inter Variable', interWoff2),
  literata: face('Literata Variable', literataWoff2),
  'source-serif': face('Source Serif 4 Variable', sourceSerifWoff2),
};

/** Bloco `<style>` com `@font-face` + `--doc-font` para o HTML exportado. */
export function exportFontCss(docFont: DocFont): string {
  const faces = docFont === 'system' ? MONO_FACE : DOC_FACE[docFont] + MONO_FACE;
  return `${faces}
:root{--doc-font:${DOC_FONT_STACK[docFont]};--mono-font:'JetBrains Mono Variable',ui-monospace,'Cascadia Code','Consolas',monospace}`;
}
