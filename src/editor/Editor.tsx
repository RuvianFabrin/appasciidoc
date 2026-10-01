import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers as lineNumbersExt,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  rectangularSelection,
  crosshairCursor,
} from '@codemirror/view';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import { editorTheme, editorHighlighting } from './theme';
import { asciidoc } from './asciidocLanguage';
import { livePreview } from './livePreview';
import { formatToolbar } from './formatToolbar';
import { slashMenu } from './slashMenu';
import { pairing } from './pairing';
import { inputRules } from './inputRules';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
  insertImageFromBlob,
  insertImageFromDiskPath,
  isImagePath,
  notify,
  setImageContext,
} from './imageInsert';
import { looksLikeMarkdown, markdownToAsciiDoc } from './markdownToAsciiDoc';
import { isTauri } from '../platform/win';
import { pathKind } from '../fs/files';
import { warmUpEngine } from '../render/asciidoctor';
import { followRef, isInlineMode, setLinkContext } from './linkContext';
import type { NoteInfo } from '../workspace/api';

function modeExtension(inlineMode: boolean) {
  return inlineMode ? [livePreview] : [asciidoc(), editorHighlighting];
}

const linkClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    const el = (event.target as HTMLElement | null)?.closest?.('[data-href]');
    if (!(el instanceof HTMLElement)) return false;
    const href = el.dataset.href;
    if (!href) return false;
    if (!isInlineMode() && !event.ctrlKey && !event.metaKey) return false;
    event.preventDefault();
    view.focus();
    followRef(href);
    return true;
  },
});

function pasteHandler() {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const dt = event.clipboardData;
      if (!dt) return false;

      const imgItem = Array.from(dt.items).find(
        (it) => it.kind === 'file' && it.type.startsWith('image/'),
      );
      if (imgItem) {
        const file = imgItem.getAsFile();
        if (file) {
          event.preventDefault();
          void insertImageFromBlob(view, file);
          return true;
        }
      }

      const text = dt.getData('text/plain').trim();
      const sel = view.state.selection.main;
      if (!sel.empty && /^(https?:\/\/|mailto:)\S+$/.test(text)) {
        event.preventDefault();
        const label = view.state.sliceDoc(sel.from, sel.to);
        const macro = text.startsWith('mailto:') ? text : `link:${text}`;
        view.dispatch({ changes: { from: sel.from, to: sel.to, insert: `${macro}[${label}]` } });
        return true;
      }

      // Colar Markdown → AsciiDoc (tarefa 120). Converte e avisa; Ctrl+Z desfaz.
      if (text.length > 2 && looksLikeMarkdown(text)) {
        const converted = markdownToAsciiDoc(text);
        if (converted !== text) {
          event.preventDefault();
          view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: converted },
            selection: { anchor: sel.from + converted.length },
            userEvent: 'input.paste',
          });
          notify(i18n.t('editor.pasteMarkdown'));
          return true;
        }
      }
      return false;
    },
  });
}

export interface EditorApi {
  scrollToLine: (line: number) => void;
  /** Substitui a seleção (ou insere no cursor). */
  insertText: (text: string) => void;
  getSelection: () => string;
  focus: () => void;
  /** Substitui as linhas [start..end] (1-based, inclusive) por `text` — tarefa 112. */
  replaceLineRange: (start: number, end: number, text: string) => void;
}

interface Props {
  /** Identidade do buffer aberto. Ao mudar, o editor troca o documento inteiro. */
  fileKey: string;
  initialDoc: string;
  wordWrap: boolean;
  lineNumbers: boolean;
  onDocChange: (content: string) => void;
  onCursorChange?: (line: number, col: number) => void;
  /** Linha visível no topo, para sincronizar o preview (tarefa 17). */
  onScrollLine?: (line: number) => void;
  onReady?: (api: EditorApi) => void;
  /** true = modo inline (live preview); false = modo fonte (tarefa 30). */
  inlineMode: boolean;
  /** caminho da nota atual — necessário para a pasta de anexos (tarefas 27/28/84). */
  notePath: string | null;
  attachmentPattern: string;
  onNotify?: (msg: string) => void;
  onOpenExternalFile?: (path: string) => void;
  /** Soltar uma pasta na janela abre-a como workspace (tarefa 64). */
  onOpenFolder?: (path: string) => void;
  /** índice do workspace + navegação, para links entre notas (Fase 5). */
  notes: NoteInfo[];
  onNavigate: (path: string, anchor: string | null) => void;
}

const wrapCompartment = new Compartment();
const gutterCompartment = new Compartment();
const modeCompartment = new Compartment();
const ariaCompartment = new Compartment();

function gutterExtension(enabled: boolean) {
  return enabled ? [lineNumbersExt(), highlightActiveLineGutter()] : [];
}

export function Editor({
  fileKey,
  initialDoc,
  wordWrap,
  lineNumbers,
  onDocChange,
  onCursorChange,
  onScrollLine,
  onReady,
  inlineMode,
  notePath,
  attachmentPattern,
  onNotify,
  onOpenExternalFile,
  onOpenFolder,
  notes,
  onNavigate,
}: Props) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const cbRef = useRef({
    onDocChange,
    onCursorChange,
    onScrollLine,
    onReady,
    onOpenExternalFile,
    onOpenFolder,
  });
  cbRef.current = {
    onDocChange,
    onCursorChange,
    onScrollLine,
    onReady,
    onOpenExternalFile,
    onOpenFolder,
  };

  // Contextos setados no corpo (síncrono) — precisam estar corretos já na
  // primeira construção das decorations (imagens e links entre notas).
  setImageContext({
    notePath,
    pattern: attachmentPattern,
    notify: onNotify ?? (() => undefined),
  });
  setLinkContext({ notes, notePath, inlineMode, navigate: onNavigate });

  function buildState(doc: string): EditorState {
    return EditorState.create({
      doc,
      extensions: [
        history(),
        drawSelection(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        editorTheme,
        formatToolbar(),
        slashMenu(),
        pairing(),
        inputRules,
        linkClickHandler,
        pasteHandler(),
        ariaCompartment.of(EditorView.contentAttributes.of({ 'aria-label': t('editor.aria') })),
        gutterCompartment.of(gutterExtension(lineNumbers)),
        wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
        modeCompartment.of(modeExtension(inlineMode)),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cbRef.current.onDocChange(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            cbRef.current.onCursorChange?.(line.number, head - line.from + 1);
          }
        }),
      ],
    });
  }

  // Cria a view uma vez (no mount).
  useEffect(() => {
    if (!hostRef.current) return;
    // pré-aquece o Asciidoctor para os blocos (tabela/admonição) renderizarem já na 1ª abertura
    warmUpEngine();
    const view = new EditorView({ state: buildState(initialDoc), parent: hostRef.current });
    viewRef.current = view;
    view.focus();

    const api: EditorApi = {
      scrollToLine(line) {
        const total = view.state.doc.lines;
        const n = Math.min(Math.max(1, Math.round(line)), total);
        const pos = view.state.doc.line(n).from;
        view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 8 }) });
      },
      insertText(text) {
        const r = view.state.selection.main;
        view.dispatch({
          changes: { from: r.from, to: r.to, insert: text },
          selection: { anchor: r.from + text.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      getSelection() {
        const r = view.state.selection.main;
        return r.empty ? '' : view.state.sliceDoc(r.from, r.to);
      },
      focus: () => view.focus(),
      replaceLineRange(start, end, text) {
        const total = view.state.doc.lines;
        const s = Math.min(Math.max(1, Math.round(start)), total);
        const e = Math.min(Math.max(s, Math.round(end)), total);
        const from = view.state.doc.line(s).from;
        const to = view.state.doc.line(e).to;
        if (view.state.sliceDoc(from, to) === text) return;
        view.dispatch({ changes: { from, to, insert: text } });
      },
    };
    cbRef.current.onReady?.(api);

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const cb = cbRef.current.onScrollLine;
        if (!cb) return;
        const r = view.scrollDOM.getBoundingClientRect();
        const pos = view.posAtCoords({ x: r.left + 6, y: r.top + 4 });
        if (pos == null) return;
        cb(view.state.doc.lineAt(pos).number);
      });
    };
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      view.scrollDOM.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Troca de arquivo: substitui o documento inteiro e zera o histórico.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.setState(buildState(initialDoc));
    view.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  // Arrastar arquivos do Explorer para dentro do editor (tarefas 64 / 84).
  useEffect(() => {
    if (!isTauri) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let lastDropAt = 0;

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;
        // O evento pode disparar em duplicata (StrictMode / plataforma) — dedup.
        const now = Date.now();
        if (now - lastDropAt < 500) return;
        lastDropAt = now;

        const view = viewRef.current;
        if (!view) return;
        const rect = view.dom.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const px = event.payload.position.x / dpr;
        const py = event.payload.position.y / dpr;
        const overEditor =
          px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom;
        for (const raw of event.payload.paths) {
          const path = raw.replace(/\\/g, '/');
          if (isImagePath(path)) {
            if (overEditor) void insertImageFromDiskPath(view, raw);
          } else if (/\.(adoc|asciidoc|asc|txt)$/i.test(path)) {
            cbRef.current.onOpenExternalFile?.(path);
          } else {
            // pasta -> abre como workspace; arquivo desconhecido -> ignora (tarefa 64)
            void pathKind(path).then((k) => {
              if (k === 'dir') cbRef.current.onOpenFolder?.(path);
            });
          }
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
  }, [wordWrap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: modeCompartment.reconfigure(modeExtension(inlineMode)),
    });
  }, [inlineMode]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: gutterCompartment.reconfigure(gutterExtension(lineNumbers)),
    });
  }, [lineNumbers]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: ariaCompartment.reconfigure(
        EditorView.contentAttributes.of({ 'aria-label': t('editor.aria') }),
      ),
    });
  }, [t]);

  return (
    <div ref={hostRef} className={'editor-host' + (inlineMode ? '' : ' editor-host--source')} />
  );
}
