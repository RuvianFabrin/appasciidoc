/**
 * Realce de blocos de código (tarefa 19). highlight.js empacotado no bundle,
 * só com as linguagens comuns para não inflar o binário. Nenhuma requisição de rede.
 */
import hljs from 'highlight.js/lib/core';

import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

type LanguageFn = Parameters<typeof hljs.registerLanguage>[1];

let registered = false;

function ensureRegistered() {
  if (registered) return;
  registered = true;
  const langs: Record<string, LanguageFn> = {
    bash,
    c,
    cpp,
    csharp,
    css,
    diff,
    go,
    ini,
    java,
    javascript,
    json,
    kotlin,
    markdown,
    php,
    python,
    ruby,
    rust,
    shell,
    sql,
    typescript,
    xml,
    yaml,
  };
  for (const [name, fn] of Object.entries(langs)) hljs.registerLanguage(name, fn);
  hljs.registerAliases(['js'], { languageName: 'javascript' });
  hljs.registerAliases(['ts'], { languageName: 'typescript' });
  hljs.registerAliases(['sh', 'zsh'], { languageName: 'bash' });
  hljs.registerAliases(['yml'], { languageName: 'yaml' });
  hljs.registerAliases(['html', 'xhtml'], { languageName: 'xml' });
  hljs.registerAliases(['toml'], { languageName: 'ini' });
  hljs.registerAliases(['py'], { languageName: 'python' });
  hljs.registerAliases(['rb'], { languageName: 'ruby' });
  hljs.registerAliases(['rs'], { languageName: 'rust' });
  hljs.registerAliases(['cs'], { languageName: 'csharp' });
  hljs.registerAliases(['kt'], { languageName: 'kotlin' });
}

/** Realça um trecho de código e devolve o HTML + a linguagem detectada. */
export function highlightCode(code: string, lang?: string): { html: string; lang: string } {
  ensureRegistered();
  try {
    if (lang && hljs.getLanguage(lang)) {
      return { html: hljs.highlight(code, { language: lang }).value, lang };
    }
    if (!lang) {
      const r = hljs.highlightAuto(code);
      return { html: r.value, lang: r.language ?? '' };
    }
  } catch {
    /* cai no texto puro */
  }
  const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return { html: esc, lang: lang ?? '' };
}

/** Aplica realce a todo bloco de código dentro do container do preview. */
export function highlightWithin(container: HTMLElement) {
  ensureRegistered();
  const blocks = container.querySelectorAll<HTMLElement>('pre code');
  blocks.forEach((el) => {
    if (el.dataset.highlighted === 'yes') return;
    // Asciidoctor emite class="language-xxx"; se a linguagem não estiver
    // registrada, deixa como texto simples em vez de estourar.
    const cls = Array.from(el.classList).find((c2) => c2.startsWith('language-'));
    const lang = cls?.slice('language-'.length);
    try {
      if (lang && hljs.getLanguage(lang)) {
        el.innerHTML = hljs.highlight(el.textContent ?? '', { language: lang }).value;
      } else {
        el.innerHTML = hljs.highlightAuto(el.textContent ?? '').value;
      }
      el.dataset.highlighted = 'yes';
      el.classList.add('hljs');
    } catch {
      /* mantém texto simples */
    }
  });
}
