/**
 * Widgets de bloco para o modo inline (tarefas 26, 97, 106).
 *
 * Quando o cursor está fora de um bloco (`----`, `[source]`, `|===`, `====`,
 * `____`, `****`), ele é substituído por uma versão renderizada:
 *  - código  → realce do highlight.js + faixa de linguagem + botão "copiar";
 *  - tabela / admonição / citação / exemplo / sidebar → HTML do Asciidoctor
 *    (render síncrono; enquanto o motor carrega, mostra o texto cru).
 * O botão "editar" (ou clicar) leva o cursor para dentro do bloco → a decoration
 * cai e o texto cru reaparece.
 */
import { StateEffect } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';
import { highlightCode } from '../render/highlight';
import { onEngineReady, renderFragmentSync, warmUpEngine } from '../render/asciidoctor';
import { resolveImagesIn } from '../fs/assets';
import { getNotePath } from './imageInsert';

/** Disparado quando o motor do Asciidoctor termina de carregar — força o
 * ViewPlugin do modo inline a reconstruir as decorations dos blocos. */
export const engineRefresh = StateEffect.define<null>();

function editButton(view: EditorView, editPos: number): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = 'editar';
  b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    view.dispatch({ selection: { anchor: Math.min(editPos, view.state.doc.length) } });
    view.focus();
  });
  return b;
}

/** Grupo flutuante de botões no canto do bloco (só aparece no hover — CSS). */
function toolsBar(...buttons: HTMLElement[]): HTMLDivElement {
  const bar = document.createElement('div');
  bar.className = 'cm-adoc-block__tools';
  bar.append(...buttons);
  return bar;
}

export class CodeBlockWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly lang: string,
    readonly editPos: number,
  ) {
    super();
  }

  override eq(o: CodeBlockWidget) {
    return o.code === this.code && o.lang === this.lang;
  }

  override toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-adoc-block cm-adoc-codeblock';

    const { html, lang } = highlightCode(this.code, this.lang || undefined);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'copiar';
    copy.addEventListener('mousedown', (e) => {
      e.preventDefault();
      void navigator.clipboard?.writeText(this.code).then(() => {
        copy.textContent = 'copiado';
        window.setTimeout(() => (copy.textContent = 'copiar'), 1200);
      });
    });

    const pre = document.createElement('pre');
    const codeEl = document.createElement('code');
    codeEl.className = 'hljs';
    codeEl.innerHTML = html;
    pre.append(codeEl);

    wrap.append(pre, toolsBar(copy, editButton(view, this.editPos)));
    if (lang) {
      const chip = document.createElement('span');
      chip.className = 'cm-adoc-block__lang';
      chip.textContent = lang.toUpperCase();
      wrap.append(chip);
    }
    return wrap;
  }

  override ignoreEvent() {
    return true;
  }
}

export class FragmentWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly editPos: number,
  ) {
    super();
  }

  override eq(o: FragmentWidget) {
    return o.source === this.source;
  }

  override toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-adoc-block';

    const body = document.createElement('div');
    body.className = 'preview cm-adoc-fragment';

    const fill = (): boolean => {
      const html = renderFragmentSync(this.source);
      if (html == null) return false;
      body.innerHTML = html;
      body.classList.remove('cm-adoc-fragment--loading');
      resolveImagesIn(body, getNotePath());
      return true;
    };

    if (!fill()) {
      body.classList.add('cm-adoc-fragment--loading');
      const pre = document.createElement('pre');
      pre.className = 'cm-adoc-fragment__raw';
      pre.textContent = this.source;
      body.append(pre);
      warmUpEngine();
      // re-renderiza o próprio DOM quando o motor terminar de carregar
      onEngineReady(() => {
        if (!fill()) return;
        // avisa o ViewPlugin para reprocessar (mede a nova altura)
        view.dispatch({ effects: engineRefresh.of(null) });
      });
    }

    wrap.append(body, toolsBar(editButton(view, this.editPos)));
    return wrap;
  }

  override ignoreEvent() {
    return true;
  }
}
