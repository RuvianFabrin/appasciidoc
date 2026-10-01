/**
 * Contexto de links para as extensões do editor (renderização de wikilink e
 * navegação por clique). Atualizado pelo React via `setLinkContext`.
 */
import type { NoteInfo } from '../workspace/api';
import { resolveLink, type Resolved } from '../workspace/links';

interface LinkCtx {
  notes: NoteInfo[];
  notePath: string | null;
  inlineMode: boolean;
  navigate: (path: string, anchor: string | null) => void;
}

const ctx: LinkCtx = {
  notes: [],
  notePath: null,
  inlineMode: true,
  navigate: () => undefined,
};

export function setLinkContext(patch: Partial<LinkCtx>): void {
  Object.assign(ctx, patch);
}

export function isInlineMode(): boolean {
  return ctx.inlineMode;
}

export function getNotes(): NoteInfo[] {
  return ctx.notes;
}

export function getCurrentNotePath(): string | null {
  return ctx.notePath;
}

/** `raw` = alvo do link como escrito, podendo conter `#anchor`. */
export function resolveRef(raw: string): Resolved {
  const hash = raw.indexOf('#');
  const target = hash >= 0 ? raw.slice(0, hash) : raw;
  const anchor = hash >= 0 ? raw.slice(hash + 1) : null;
  return resolveLink(ctx.notes, ctx.notePath, target, anchor);
}

/** Segue o link se for interno e resolver. Retorna true se navegou. */
export function followRef(raw: string): boolean {
  const r = resolveRef(raw);
  if (r.external || !r.path) return false;
  ctx.navigate(r.path, r.anchor);
  return true;
}

/** Abre um caminho relativo à nota atual (usado pelos cartões de include). */
export function openRelative(target: string): void {
  const base = ctx.notePath ? ctx.notePath.replace(/[\\/][^\\/]*$/, '') : '';
  const parts = `${base}/${target}`.replace(/\\/g, '/').split('/');
  const stack: string[] = [];
  for (const p of parts) {
    if (p === '..') stack.pop();
    else if (p !== '.' && p !== '') stack.push(p);
  }
  const abs = `${parts[0] === '' ? '/' : ''}${stack.join('/')}`;
  ctx.navigate(abs, null);
}
