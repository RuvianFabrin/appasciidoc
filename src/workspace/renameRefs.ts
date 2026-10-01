/**
 * Atualização de referências ao renomear uma nota (tarefa 44).
 */
import { baseName, type NoteInfo } from './api';

function stemOf(path: string): string {
  return baseName(path).replace(/\.(adoc|asciidoc|asc|txt)$/i, '');
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Notas (exceto a própria) que têm um link apontando para `oldPath`. */
export function findReferrers(notes: NoteInfo[], oldPath: string): NoteInfo[] {
  const stem = stemOf(oldPath).toLowerCase();
  return notes.filter((n) => {
    if (n.path === oldPath) return false;
    return n.outLinks.some((l) => stemOf(l.target).toLowerCase() === stem);
  });
}

/**
 * Reescreve, no conteúdo de um arquivo, os links que citam `oldStem` para
 * `newStem` — em `xref:`, `link:`, `include::` e `[[wikilink]]`. Preserva
 * subpasta, âncora e extensão.
 */
export function rewriteReferences(content: string, oldStem: string, newStem: string): string {
  const o = esc(oldStem);
  // xref:.../oldStem(.adoc)?[  |  link:.../oldStem.adoc[  |  include::.../oldStem.adoc[
  const macro = new RegExp(
    `((?:xref|link|include):{1,2}(?:[^\\s\\[\\]#|]*/)?)${o}(\\.(?:adoc|asciidoc|asc))?(?=[\\[#])`,
    'g',
  );
  // [[oldStem]] / [[oldStem#sec]] / [[oldStem|texto]]
  const wiki = new RegExp(`(\\[\\[(?:[^\\]\\[|#\\n]*/)?)${o}(?=[\\]#|])`, 'g');
  return content
    .replace(macro, (_m, pre: string, ext = '') => `${pre}${newStem}${ext}`)
    .replace(wiki, (_m, pre: string) => `${pre}${newStem}`);
}

export { stemOf as noteStem };
