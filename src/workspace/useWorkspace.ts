import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  createDir,
  createFile,
  deletePath,
  dirName,
  pickFolder,
  readDir,
  renamePath,
  scanWorkspace,
  readSession,
  unwatchWorkspace,
  watchWorkspace,
  writeSession,
  type DirEntry,
  type NoteInfo,
  type WorkspaceSession,
} from './api';
import { isTauri } from '../platform/win';
import { readTextFile, writeTextFile } from '../fs/files';
import { findReferrers, noteStem, rewriteReferences } from './renameRefs';

export interface PendingRename {
  oldStem: string;
  newStem: string;
  files: string[];
}

const DEFAULT_SESSION: WorkspaceSession = {
  openFiles: [],
  activeFile: null,
  pinnedFiles: [],
  sidebarWidth: 260,
  expandedDirs: [],
  showAllFiles: false,
};

export function useWorkspace(
  onOpenFile: (path: string) => void,
  onRestoreSession?: (session: WorkspaceSession) => void,
) {
  const [root, setRoot] = useState<string | null>(null);
  const [childrenOf, setChildrenOf] = useState<Record<string, DirEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const rootRef = useRef<string | null>(null);
  rootRef.current = root;
  const showAllRef = useRef(showAll);
  showAllRef.current = showAll;
  const session = useRef<WorkspaceSession>(DEFAULT_SESSION);
  const saveTimer = useRef<number | undefined>(undefined);

  const persistSession = useCallback((patch: Partial<WorkspaceSession>) => {
    const r = rootRef.current;
    if (!r) return;
    session.current = { ...session.current, ...patch };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void writeSession(r, session.current).catch(() => undefined);
    }, 400);
  }, []);

  const loadDir = useCallback(async (dir: string) => {
    try {
      const entries = await readDir(dir, showAllRef.current);
      setChildrenOf((prev) => ({ ...prev, [dir]: entries }));
    } catch {
      /* pasta pode ter sumido */
    }
  }, []);

  const rescan = useCallback(async () => {
    const r = rootRef.current;
    if (!r) return;
    try {
      setNotes(await scanWorkspace(r));
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async () => {
    const dirs = Object.keys(childrenOf);
    await Promise.all(dirs.map(loadDir));
    await rescan();
  }, [childrenOf, loadDir, rescan]);

  const openRoot = useCallback(
    async (path: string) => {
      setLoading(true);
      setRoot(path);
      rootRef.current = path;
      const s = isTauri ? await readSession(path).catch(() => DEFAULT_SESSION) : DEFAULT_SESSION;
      session.current = s;
      setShowAll(s.showAllFiles);
      showAllRef.current = s.showAllFiles;
      const exp = new Set(s.expandedDirs.filter((d) => d.startsWith(path)));
      exp.add(path);
      setExpanded(exp);
      setChildrenOf({});
      await Promise.all([...exp].map(loadDir));
      await rescan();
      await watchWorkspace(path).catch(() => undefined);
      setLoading(false);
      if (onRestoreSession) onRestoreSession(s);
      else if (s.activeFile) onOpenFile(s.activeFile);
    },
    [loadDir, rescan, onOpenFile, onRestoreSession],
  );

  const openFolder = useCallback(async () => {
    const picked = await pickFolder();
    if (picked) await openRoot(picked.replace(/\\/g, '/'));
  }, [openRoot]);

  const closeWorkspace = useCallback(() => {
    void unwatchWorkspace().catch(() => undefined);
    setRoot(null);
    rootRef.current = null;
    setChildrenOf({});
    setExpanded(new Set());
    setNotes([]);
  }, []);

  const toggleDir = useCallback(
    (dir: string) => {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(dir)) {
          next.delete(dir);
        } else {
          next.add(dir);
          if (!childrenOf[dir]) void loadDir(dir);
        }
        persistSession({ expandedDirs: [...next] });
        return next;
      });
    },
    [childrenOf, loadDir, persistSession],
  );

  const collapseAll = useCallback(() => {
    const r = rootRef.current;
    const keep = r ? new Set([r]) : new Set<string>();
    setExpanded(keep);
    persistSession({ expandedDirs: [...keep] });
  }, [persistSession]);

  const toggleShowAll = useCallback(() => {
    setShowAll((v) => {
      const next = !v;
      showAllRef.current = next;
      persistSession({ showAllFiles: next });
      void Promise.all(Object.keys(childrenOf).map(loadDir));
      return next;
    });
  }, [childrenOf, loadDir, persistSession]);

  const newNote = useCallback(
    async (parentDir: string, name: string) => {
      const clean = name.endsWith('.adoc') ? name : `${name}.adoc`;
      const path = await createFile(`${parentDir}/${clean}`);
      await loadDir(parentDir);
      await rescan();
      onOpenFile(path);
      return path;
    },
    [loadDir, rescan, onOpenFile],
  );

  const newFolder = useCallback(
    async (parentDir: string, name: string) => {
      await createDir(`${parentDir}/${name}`);
      await loadDir(parentDir);
    },
    [loadDir],
  );

  const [pendingRename, setPendingRename] = useState<PendingRename | null>(null);
  const notesRef = useRef<NoteInfo[]>([]);
  notesRef.current = notes;

  const rename = useCallback(
    async (from: string, to: string) => {
      const referrers = findReferrers(notesRef.current, from);
      const out = await renamePath(from, to);
      await Promise.all([loadDir(dirName(from)), loadDir(dirName(to))]);
      await rescan();
      const oldStem = noteStem(from);
      const newStem = noteStem(out || to);
      if (referrers.length > 0 && oldStem !== newStem) {
        setPendingRename({ oldStem, newStem, files: referrers.map((r) => r.path) });
      }
      return out;
    },
    [loadDir, rescan],
  );

  /** Aplica a reescrita de referências pendente (tarefa 44). */
  const applyPendingRename = useCallback(async () => {
    const p = pendingRename;
    setPendingRename(null);
    if (!p) return;
    for (const file of p.files) {
      try {
        const f = await readTextFile(file);
        const next = rewriteReferences(f.content, p.oldStem, p.newStem);
        if (next !== f.content) {
          await writeTextFile(file, next, { eol: f.eol, bom: f.bom });
        }
      } catch {
        /* arquivo pode ter sumido */
      }
    }
    await rescan();
  }, [pendingRename, rescan]);

  const dismissPendingRename = useCallback(() => setPendingRename(null), []);

  const remove = useCallback(
    async (path: string) => {
      await deletePath(path);
      await loadDir(dirName(path));
      await rescan();
    },
    [loadDir, rescan],
  );

  // recarrega quando o disco muda (watcher)
  useEffect(() => {
    if (!isTauri) return;
    let t: number | undefined;
    const un = listen('workspace-changed', () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => void refresh(), 250);
    });
    return () => {
      window.clearTimeout(t);
      void un.then((f) => f());
    };
  }, [refresh]);

  const actions = useMemo(
    () => ({
      openFolder,
      openRoot,
      closeWorkspace,
      toggleDir,
      collapseAll,
      toggleShowAll,
      refresh,
      newNote,
      newFolder,
      rename,
      remove,
      persistSession,
      applyPendingRename,
      dismissPendingRename,
    }),
    [
      openFolder,
      openRoot,
      closeWorkspace,
      toggleDir,
      collapseAll,
      toggleShowAll,
      refresh,
      newNote,
      newFolder,
      rename,
      remove,
      persistSession,
      applyPendingRename,
      dismissPendingRename,
    ],
  );

  return { root, childrenOf, expanded, showAll, notes, loading, pendingRename, actions };
}

export type WorkspaceModel = ReturnType<typeof useWorkspace>;
