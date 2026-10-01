import { useEffect, useRef } from 'react';
import { applyLineMap, renderAsciiDoc, type RenderMessage } from './asciidoctor';
import { highlightWithin } from './highlight';
import { resolveImagesIn } from '../fs/assets';
import { preprocessWikilinks } from '../workspace/links';
import type { NoteInfo } from '../workspace/api';
import './asciidoc.css';

export interface PreviewApi {
  /** Rola até o bloco cuja linha-fonte é a maior <= `line`. */
  scrollToLine: (line: number) => void;
  /** Linha-fonte do primeiro bloco visível no topo. */
  topLine: () => number | null;
}

interface Props {
  source: string;
  baseDir: string | null;
  /** Caminho da nota — usado para resolver `image::` relativos. */
  notePath: string | null;
  notes: NoteInfo[];
  debounceMs?: number;
  onMessages: (messages: RenderMessage[]) => void;
  onRendering: (rendering: boolean) => void;
  onScrollLine?: (line: number) => void;
  onReady?: (api: PreviewApi) => void;
}

export function Preview({
  source,
  baseDir,
  notePath,
  notes,
  debounceMs = 200,
  onMessages,
  onRendering,
  onScrollLine,
  onReady,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef({ onMessages, onRendering, onScrollLine, onReady });
  cbRef.current = { onMessages, onRendering, onScrollLine, onReady };

  // ---- API imperativa para a sincronização de scroll ----
  useEffect(() => {
    const scroller = scrollerRef.current;
    const body = bodyRef.current;
    if (!scroller || !body) return;

    const lineEls = () =>
      Array.from(body.querySelectorAll<HTMLElement>('[data-line]')).map((el) => ({
        el,
        line: Number(el.dataset.line),
      }));

    const api: PreviewApi = {
      scrollToLine(line) {
        const els = lineEls();
        let target: HTMLElement | null = null;
        for (const { el, line: l } of els) {
          if (l <= line) target = el;
          else break;
        }
        if (target) scroller.scrollTop = target.offsetTop - 12;
      },
      topLine() {
        const top = scroller.scrollTop;
        let best: number | null = null;
        for (const { el, line } of lineEls()) {
          if (el.offsetTop - 12 <= top + 4) best = line;
          else break;
        }
        return best;
      },
    };
    cbRef.current.onReady?.(api);

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const cb = cbRef.current.onScrollLine;
        const line = api.topLine();
        if (cb && line != null) cb(line);
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // ---- render com debounce ----
  useEffect(() => {
    let cancelled = false;
    cbRef.current.onRendering(true);
    const id = window.setTimeout(async () => {
      try {
        const prepared = notes.length ? preprocessWikilinks(source, notes, notePath) : source;
        const result = await renderAsciiDoc(prepared, { baseDir });
        if (cancelled) return;
        const body = bodyRef.current;
        if (body) {
          body.innerHTML = result.html;
          applyLineMap(body, result.sourceLines);
          highlightWithin(body);
          resolveImagesIn(body, notePath);
        }
        cbRef.current.onMessages(result.messages);
      } catch (err) {
        if (!cancelled) {
          cbRef.current.onMessages([
            {
              severity: 'FATAL',
              text: `Falha ao renderizar: ${String(err)}`,
              line: null,
              file: null,
            },
          ]);
        }
      } finally {
        if (!cancelled) cbRef.current.onRendering(false);
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [source, baseDir, notePath, notes, debounceMs]);

  return (
    <div className="preview-scroller" ref={scrollerRef}>
      <div className="preview" ref={bodyRef} />
    </div>
  );
}
