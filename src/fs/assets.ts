/**
 * Resolve caminhos de imagem do AsciiDoc (relativos à nota aberta) para URLs
 * que o webview consegue carregar (`asset://` via `convertFileSrc`).
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauri } from '../platform/win';

function joinAndNormalize(dir: string, rel: string): string {
  const parts = `${dir}/${rel}`.split(/[\\/]+/);
  const out: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

/** `notePath` = caminho absoluto da nota aberta; `ref` = alvo do `image::`. */
export function assetUrl(notePath: string | null, ref: string): string {
  const r = ref.trim();
  if (!r || /^(https?:|data:|asset:|blob:|tauri:|file:)/i.test(r)) return r;
  if (!isTauri || !notePath) return r;
  const dir = notePath.replace(/[\\/][^\\/]*$/, '');
  try {
    return convertFileSrc(joinAndNormalize(dir, r));
  } catch {
    return r;
  }
}

/** Reescreve os `src` das `<img>` de um HTML já inserido no DOM. */
export function resolveImagesIn(container: HTMLElement, notePath: string | null): void {
  container.querySelectorAll('img').forEach((img) => {
    const raw = img.getAttribute('src') ?? '';
    const url = assetUrl(notePath, raw);
    if (url !== raw) img.setAttribute('src', url);
  });
}
