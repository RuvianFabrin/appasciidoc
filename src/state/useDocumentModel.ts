import { useCallback, useMemo, useReducer, useRef } from 'react';
import {
  baseName,
  fileMtimeMs,
  pickOpenPath,
  pickSavePath,
  readTextFile,
  writeTextFile,
  type Eol,
} from '../fs/files';
import type { RecoveryEntry } from '../config/config';

/** Resultado de uma tentativa de salvar. */
export interface SaveOutcome {
  ok: boolean;
  /** O arquivo mudou no disco desde que foi carregado/salvo (tarefa 62). */
  conflict: boolean;
}

/** Tolerância p/ comparar mtime (sistemas de arquivo têm resolução grosseira). */
const MTIME_SLACK_MS = 1500;

export interface DocState {
  /** `null` = documento novo, ainda sem arquivo. */
  path: string | null;
  content: string;
  savedContent: string;
  eol: Eol;
  bom: boolean;
  /** Muda a cada buffer carregado; o Editor usa como identidade para trocar o doc. */
  fileKey: string;
  lastMtimeMs: number;
  loadError: string | null;
}

const EMPTY: DocState = {
  path: null,
  content: '',
  savedContent: '',
  eol: 'lf',
  bom: false,
  fileKey: 'new:0',
  lastMtimeMs: 0,
  loadError: null,
};

/** Uma aba = um buffer independente (tarefa 61). */
export interface TabState {
  id: string;
  doc: DocState;
  pinned: boolean;
  cursor: { line: number; col: number };
}

/** Visão enxuta de uma aba para a barra de abas. */
export interface TabView {
  id: string;
  title: string;
  path: string | null;
  dirty: boolean;
  pinned: boolean;
  active: boolean;
}

interface ModelState {
  tabs: TabState[];
  activeId: string;
}

/** Compara caminhos tolerando barra `/` vs `\` e barra final. */
function samePath(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  const n = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '');
  return n(a) === n(b);
}

let idCounter = 1;
const nextId = () => `tab:${idCounter++}`;

function mkTab(doc: DocState): TabState {
  return { id: nextId(), doc, pinned: false, cursor: { line: 1, col: 1 } };
}

function disposable(t: TabState): boolean {
  const d = t.doc;
  return d.path === null && d.content === '' && d.content === d.savedContent && !d.loadError;
}

interface LoadedFile {
  path: string;
  content: string;
  eol: Eol;
  bom: boolean;
  mtimeMs: number;
}

function loadedDoc(f: LoadedFile, seq: number): DocState {
  return {
    path: f.path,
    content: f.content,
    savedContent: f.content,
    eol: f.eol,
    bom: f.bom,
    fileKey: `file:${f.path}:${f.mtimeMs}:${seq}`,
    lastMtimeMs: f.mtimeMs,
    loadError: null,
  };
}

/** Reordena mantendo a fronteira "fixadas antes das soltas". */
function reorder(tabs: TabState[], id: string, toIndex: number): TabState[] {
  const from = tabs.findIndex((t) => t.id === id);
  if (from < 0) return tabs;
  const arr = [...tabs];
  const [item] = arr.splice(from, 1);
  if (!item) return tabs;
  const pinnedCount = arr.filter((t) => t.pinned).length;
  const lo = item.pinned ? 0 : pinnedCount;
  const hi = item.pinned ? pinnedCount : arr.length;
  const at = Math.max(lo, Math.min(hi, toIndex));
  arr.splice(at, 0, item);
  return arr;
}

/** Fixadas primeiro, preservando a ordem relativa dentro de cada grupo. */
function groupByPin(tabs: TabState[]): TabState[] {
  const pinned = tabs.filter((t) => t.pinned);
  const rest = tabs.filter((t) => !t.pinned);
  return pinned.length && rest.length ? [...pinned, ...rest] : tabs;
}

type Action =
  | { type: 'setContent'; content: string }
  | { type: 'newTab'; seq: number }
  | { type: 'loadInto'; id: string; file: LoadedFile; seq: number }
  | { type: 'openInNewTab'; file: LoadedFile; seq: number }
  | { type: 'loadError'; message: string }
  | { type: 'saved'; path: string; content: string; mtimeMs: number }
  | { type: 'adoptRecovery'; entry: RecoveryEntry; seq: number }
  | { type: 'activate'; id: string }
  | { type: 'close'; id: string }
  | { type: 'move'; id: string; toIndex: number }
  | { type: 'togglePin'; id: string }
  | { type: 'cycle'; dir: 1 | -1 }
  | { type: 'setCursor'; id: string; line: number; col: number }
  | {
      type: 'restore';
      files: Array<{ file: LoadedFile; pinned: boolean }>;
      activePath: string | null;
    };

function mapActive(state: ModelState, fn: (t: TabState) => TabState): ModelState {
  return { ...state, tabs: state.tabs.map((t) => (t.id === state.activeId ? fn(t) : t)) };
}

function reducer(state: ModelState, action: Action): ModelState {
  switch (action.type) {
    case 'setContent':
      return mapActive(state, (t) =>
        t.doc.content === action.content ? t : { ...t, doc: { ...t.doc, content: action.content } },
      );

    case 'newTab': {
      const tab = mkTab({ ...EMPTY, fileKey: `new:${action.seq}` });
      return { tabs: groupByPin([...state.tabs, tab]), activeId: tab.id };
    }

    case 'loadInto':
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id
            ? { ...t, doc: loadedDoc(action.file, action.seq), cursor: { line: 1, col: 1 } }
            : t,
        ),
        activeId: action.id,
      };

    case 'openInNewTab': {
      const tab = mkTab(loadedDoc(action.file, action.seq));
      return { tabs: groupByPin([...state.tabs, tab]), activeId: tab.id };
    }

    case 'loadError':
      return mapActive(state, (t) => ({ ...t, doc: { ...t.doc, loadError: action.message } }));

    case 'saved':
      return mapActive(state, (t) => ({
        ...t,
        doc: {
          ...t.doc,
          path: action.path,
          savedContent: action.content,
          lastMtimeMs: action.mtimeMs,
          loadError: null,
        },
      }));

    case 'adoptRecovery':
      return mapActive(state, (t) => ({
        ...t,
        doc: {
          path: action.entry.originalPath,
          content: action.entry.content,
          savedContent: '',
          eol: 'lf',
          bom: false,
          fileKey: `recovery:${action.entry.key}:${action.seq}`,
          lastMtimeMs: 0,
          loadError: null,
        },
      }));

    case 'activate':
      return state.tabs.some((t) => t.id === action.id) ? { ...state, activeId: action.id } : state;

    case 'close': {
      const i = state.tabs.findIndex((t) => t.id === action.id);
      if (i < 0) return state;
      let tabs = state.tabs.filter((t) => t.id !== action.id);
      if (tabs.length === 0) tabs = [mkTab({ ...EMPTY, fileKey: `new:${idCounter}` })];
      let activeId = state.activeId;
      if (state.activeId === action.id) {
        const fallback = tabs[Math.min(i, tabs.length - 1)];
        activeId = fallback ? fallback.id : tabs[0]!.id;
      }
      return { tabs, activeId };
    }

    case 'move':
      return { ...state, tabs: reorder(state.tabs, action.id, action.toIndex) };

    case 'togglePin':
      return {
        ...state,
        tabs: groupByPin(
          state.tabs.map((t) => (t.id === action.id ? { ...t, pinned: !t.pinned } : t)),
        ),
      };

    case 'cycle': {
      if (state.tabs.length < 2) return state;
      const i = state.tabs.findIndex((t) => t.id === state.activeId);
      const n = state.tabs.length;
      const next = state.tabs[(i + action.dir + n) % n];
      return next ? { ...state, activeId: next.id } : state;
    }

    case 'setCursor':
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...t, cursor: { line: action.line, col: action.col } } : t,
        ),
      };

    case 'restore': {
      if (action.files.length === 0) return state;
      const tabs = groupByPin(
        action.files.map(({ file, pinned }, k) => ({
          id: nextId(),
          doc: loadedDoc(file, k),
          pinned,
          cursor: { line: 1, col: 1 },
        })),
      );
      const match = tabs.find((t) => t.doc.path === action.activePath);
      return { tabs, activeId: match ? match.id : tabs[0]!.id };
    }

    default:
      return state;
  }
}

let seqCounter = 1;

function initModel(): ModelState {
  const tab = mkTab({ ...EMPTY });
  return { tabs: [tab], activeId: tab.id };
}

export function useDocumentModel() {
  const [model, dispatch] = useReducer(reducer, undefined, initModel);

  const activeTab = model.tabs.find((t) => t.id === model.activeId) ?? model.tabs[0]!;
  const state = activeTab.doc;
  const dirty = state.content !== state.savedContent;

  const setContent = useCallback((content: string) => {
    dispatch({ type: 'setContent', content });
  }, []);

  const newFile = useCallback(() => {
    dispatch({ type: 'newTab', seq: seqCounter++ });
  }, []);

  // referência viva para decisões síncronas dentro de callbacks
  const modelRef = useRef(model);
  modelRef.current = model;

  const openPath = useCallback(
    async (path: string) => {
      // já aberto? só ativa a aba (comparação tolerante a `/` vs `\`)
      const quick = modelRef.current.tabs.find((t) => samePath(t.doc.path, path));
      if (quick) {
        dispatch({ type: 'activate', id: quick.id });
        return;
      }
      try {
        const f = await readTextFile(path);
        // o caminho da árvore e o do backend podem diferir (barras, `..`) —
        // reconfere com o caminho canônico depois de ler
        const existing = modelRef.current.tabs.find((t) => samePath(t.doc.path, f.path));
        if (existing) {
          dispatch({ type: 'activate', id: existing.id });
          return;
        }
        const file: LoadedFile = {
          path: f.path,
          content: f.content,
          eol: f.eol,
          bom: f.bom,
          mtimeMs: f.modifiedMs,
        };
        const active = modelRef.current.tabs.find((t) => t.id === modelRef.current.activeId);
        if (active && disposable(active)) {
          dispatch({ type: 'loadInto', id: active.id, file, seq: seqCounter++ });
        } else {
          dispatch({ type: 'openInNewTab', file, seq: seqCounter++ });
        }
      } catch (err) {
        dispatch({ type: 'loadError', message: String(err) });
      }
    },
    [modelRef],
  );

  const openViaDialog = useCallback(async () => {
    const picked = await pickOpenPath();
    if (picked) await openPath(picked);
  }, [openPath]);

  const saveTo = useCallback(
    async (
      path: string,
      content: string,
      eol: Eol,
      bom: boolean,
      knownMtimeMs: number,
      force: boolean,
    ): Promise<SaveOutcome> => {
      // tarefa 62: se outra janela/instância gravou depois de carregarmos, avisa.
      if (!force && knownMtimeMs > 0) {
        try {
          const diskMs = await fileMtimeMs(path);
          if (diskMs > 0 && diskMs > knownMtimeMs + MTIME_SLACK_MS) {
            return { ok: false, conflict: true };
          }
        } catch {
          /* sem mtime: segue e tenta gravar */
        }
      }
      try {
        const mtimeMs = await writeTextFile(path, content, { eol, bom });
        dispatch({ type: 'saved', path, content, mtimeMs });
        return { ok: true, conflict: false };
      } catch (err) {
        dispatch({ type: 'loadError', message: String(err) });
        return { ok: false, conflict: false };
      }
    },
    [],
  );

  const saveAs = useCallback(async (): Promise<SaveOutcome> => {
    const cur = modelRef.current.tabs.find((t) => t.id === modelRef.current.activeId)?.doc;
    if (!cur) return { ok: false, conflict: false };
    const target = await pickSavePath(cur.path ?? 'sem-titulo.adoc');
    if (!target) return { ok: false, conflict: false };
    // "Salvar como" é escolha explícita do usuário: sem checagem de conflito.
    return saveTo(target, cur.content, cur.eol, cur.bom, 0, true);
  }, [modelRef, saveTo]);

  const save = useCallback(
    async (force = false): Promise<SaveOutcome> => {
      const cur = modelRef.current.tabs.find((t) => t.id === modelRef.current.activeId)?.doc;
      if (!cur) return { ok: false, conflict: false };
      if (!cur.path) return saveAs();
      return saveTo(cur.path, cur.content, cur.eol, cur.bom, cur.lastMtimeMs, force);
    },
    [modelRef, saveTo, saveAs],
  );

  /** Estado do arquivo da aba ativa em relação ao disco (tarefa 62). */
  const checkActiveDiskChange = useCallback(async (): Promise<'same' | 'changed' | 'gone'> => {
    const cur = modelRef.current.tabs.find((t) => t.id === modelRef.current.activeId)?.doc;
    if (!cur?.path || cur.lastMtimeMs <= 0) return 'same';
    try {
      const diskMs = await fileMtimeMs(cur.path);
      if (diskMs <= 0) return 'gone';
      return diskMs > cur.lastMtimeMs + MTIME_SLACK_MS ? 'changed' : 'same';
    } catch {
      return 'same';
    }
  }, [modelRef]);

  const reloadFromDisk = useCallback(async () => {
    const cur = modelRef.current.tabs.find((t) => t.id === modelRef.current.activeId);
    if (!cur?.doc.path) return;
    try {
      const f = await readTextFile(cur.doc.path);
      dispatch({
        type: 'loadInto',
        id: cur.id,
        file: {
          path: f.path,
          content: f.content,
          eol: f.eol,
          bom: f.bom,
          mtimeMs: f.modifiedMs,
        },
        seq: seqCounter++,
      });
    } catch (err) {
      dispatch({ type: 'loadError', message: String(err) });
    }
  }, [modelRef]);

  const adoptRecovery = useCallback((entry: RecoveryEntry) => {
    dispatch({ type: 'adoptRecovery', entry, seq: seqCounter++ });
  }, []);

  const activateTab = useCallback((id: string) => dispatch({ type: 'activate', id }), []);
  const closeTab = useCallback((id: string) => dispatch({ type: 'close', id }), []);
  const moveTab = useCallback(
    (id: string, toIndex: number) => dispatch({ type: 'move', id, toIndex }),
    [],
  );
  const togglePin = useCallback((id: string) => dispatch({ type: 'togglePin', id }), []);
  const cycleTab = useCallback((dir: 1 | -1) => dispatch({ type: 'cycle', dir }), []);
  const setTabCursor = useCallback(
    (line: number, col: number) =>
      dispatch({ type: 'setCursor', id: modelRef.current.activeId, line, col }),
    [modelRef],
  );

  const restoreSession = useCallback(
    async (paths: string[], activePath: string | null, pinned: string[]) => {
      const results = await Promise.all(
        paths.map(async (p) => {
          try {
            const f = await readTextFile(p);
            return {
              file: {
                path: f.path,
                content: f.content,
                eol: f.eol,
                bom: f.bom,
                mtimeMs: f.modifiedMs,
              } as LoadedFile,
              pinned: pinned.includes(p),
            };
          } catch {
            return null;
          }
        }),
      );
      const files = results.filter((r): r is { file: LoadedFile; pinned: boolean } => r !== null);
      dispatch({ type: 'restore', files, activePath });
    },
    [],
  );

  const actions = useMemo(
    () => ({
      setContent,
      newFile,
      openPath,
      openViaDialog,
      save,
      saveAs,
      reloadFromDisk,
      checkActiveDiskChange,
      adoptRecovery,
      activateTab,
      closeTab,
      moveTab,
      togglePin,
      cycleTab,
      setTabCursor,
      restoreSession,
    }),
    [
      setContent,
      newFile,
      openPath,
      openViaDialog,
      save,
      saveAs,
      reloadFromDisk,
      checkActiveDiskChange,
      adoptRecovery,
      activateTab,
      closeTab,
      moveTab,
      togglePin,
      cycleTab,
      setTabCursor,
      restoreSession,
    ],
  );

  const title = state.path ? baseName(state.path) : 'Sem título';

  const tabs: TabView[] = model.tabs.map((t) => ({
    id: t.id,
    title: t.doc.path ? baseName(t.doc.path) : 'Sem título',
    path: t.doc.path,
    dirty: t.doc.content !== t.doc.savedContent,
    pinned: t.pinned,
    active: t.id === model.activeId,
  }));

  /** Abas modificadas — usado no fechamento da janela (recuperação + salvar tudo). */
  const dirtyDocs = model.tabs
    .filter((t) => t.doc.content !== t.doc.savedContent)
    .map((t) => ({
      id: t.id,
      path: t.doc.path,
      content: t.doc.content,
      eol: t.doc.eol,
      bom: t.doc.bom,
    }));

  /** Identidade do editor: muda ao trocar de aba ou recarregar o buffer. */
  const editorKey = `${activeTab.id}#${state.fileKey}`;

  return {
    state,
    dirty,
    title,
    actions,
    tabs,
    activeId: model.activeId,
    activeCursor: activeTab.cursor,
    dirtyDocs,
    editorKey,
  };
}

export type DocumentModel = ReturnType<typeof useDocumentModel>;
