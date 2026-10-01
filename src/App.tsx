import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { appWindow, isTauri } from './platform/win';
import {
  currentWindowLabel,
  openNewWindow,
  takeReopenWorkspaces,
  trackWindow,
  untrackWindow,
  workspaceFromQuery,
} from './platform/newWindow';
import { AppShell } from './ui/AppShell';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { SettingsDialog } from './ui/SettingsDialog';
import { PromptDialog } from './ui/PromptDialog';
import { UnlockScreen } from './ui/UnlockScreen';
import { GitPreviewDialog } from './git/GitPreviewDialog';
import { CommandPalette } from './commands/CommandPalette';
import { useKeybindings } from './commands/useKeybindings';
import { buildCommands, type CommandContext } from './commands/registry';
import { useDocumentModel } from './state/useDocumentModel';
import { useWorkspace } from './workspace/useWorkspace';
import { QuickOpen } from './workspace/QuickOpen';
import { anchorLine, unresolvedLinks } from './workspace/links';
import {
  baseName,
  pickFolder,
  readGitStatus,
  testGitRemote,
  syncGit,
  type GitStatus,
  type GitPreview,
  type NoteInfo,
  type DirEntry,
} from './workspace/api';
import { ExportDialog } from './export/ExportDialog';
import { PdfExportDialog } from './export/PdfExportDialog';
import { buildStandaloneHtml } from './export/html';
import { buildPrintDoc, printViaBrowser } from './export/pdf';
import { buildSite } from './export/site';
import {
  ageDecryptFile,
  ageEncryptFile,
  addPdfOutline,
  pickAgePath,
  pickSavePath,
  printToPdf,
  readTextFile,
  startupFile,
  writeTextFile,
} from './fs/files';
import type { EditorApi } from './editor/Editor';
import { warmUpEngine } from './render/asciidoctor';
import { applyDocFont, applyEditorFontSize, applyTheme } from './platform/theme';
import { ping, type AppInfo } from './ipc';
import {
  discardRecovery,
  listRecovery,
  readConfig,
  saveRecovery,
  setScreenLock,
  verifyScreenLock,
  clearScreenLock,
  writeConfig,
  type AppConfig,
  type PreviewMode,
  type RecoveryEntry,
  type ThemePref,
} from './config/config';
import i18n from './i18n';

type ClosePrompt = { resolve: (v: string) => void } | null;
type AgePrompt = {
  action: 'encrypt' | 'decrypt';
  step: 'password' | 'confirm';
  path: string;
  password?: string;
};
type LockPrompt = { step: 'password' | 'confirm'; password?: string } | null;

export function App({ initialConfig }: { initialConfig: AppConfig }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [ipcError, setIpcError] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig>(initialConfig);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [closePrompt, setClosePrompt] = useState<ClosePrompt>(null);
  const [closeTabPrompt, setCloseTabPrompt] = useState<{ id: string; title: string } | null>(null);
  const [conflict, setConflict] = useState<'save' | 'external' | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recovery, setRecovery] = useState<RecoveryEntry[]>([]);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [quickOpen, setQuickOpen] = useState<'off' | 'open' | 'link'>('off');
  const [pendingGoto, setPendingGoto] = useState<number | null>(null);
  const [showBroken, setShowBroken] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitPreview, setGitPreview] = useState<GitPreview | null>(null);
  const [gitSyncMessage, setGitSyncMessage] = useState<string | null>(null);
  const [remoteTestState, setRemoteTestState] = useState<'idle' | 'testing' | 'success' | 'error'>(
    'idle',
  );
  const [gitSyncBusy, setGitSyncBusy] = useState(false);
  const [agePrompt, setAgePrompt] = useState<AgePrompt | null>(null);
  const [lockPrompt, setLockPrompt] = useState<LockPrompt>(null);
  const [lockUnlocked, setLockUnlocked] = useState(!initialConfig.lock.enabled);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const doc = useDocumentModel();
  const { state, dirty } = doc;
  const editorApiRef = useRef<EditorApi | null>(null);
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const openFileFromWorkspace = useCallback(
    (path: string) => void doc.actions.openPath(path),
    [doc.actions],
  );
  const restoreWorkspaceSession = useCallback(
    (s: { openFiles: string[]; activeFile: string | null; pinnedFiles: string[] }) => {
      const paths = s.openFiles.length ? s.openFiles : s.activeFile ? [s.activeFile] : [];
      if (paths.length === 0) return;
      void doc.actions.restoreSession(paths, s.activeFile, s.pinnedFiles ?? []);
    },
    [doc.actions],
  );
  const workspace = useWorkspace(openFileFromWorkspace, restoreWorkspaceSession);

  const refreshGitStatus = useCallback(async () => {
    if (!workspace.root) {
      setGitStatus(null);
      return;
    }
    try {
      setGitStatus(await readGitStatus(workspace.root));
    } catch {
      setGitStatus(null);
    }
  }, [workspace.root]);

  useEffect(() => {
    void refreshGitStatus();
  }, [refreshGitStatus]);

  const onTestGitRemote = useCallback(async () => {
    setRemoteTestState('testing');
    try {
      await testGitRemote(workspace.root ?? '', config.gitRemote);
      setRemoteTestState('success');
    } catch (error) {
      setRemoteTestState('error');
      window.alert(t('git.error', { message: String(error) }));
    }
  }, [config.gitRemote, t, workspace.root]);

  const onSetLock = useCallback(() => setLockPrompt({ step: 'password' }), []);

  const onResolveLockPrompt = useCallback(
    async (value: string | null) => {
      if (!lockPrompt) return;
      if (value === null) {
        setLockPrompt(null);
        return;
      }
      if (lockPrompt.step === 'password') {
        setLockPrompt({ step: 'confirm', password: value });
        return;
      }
      if (lockPrompt.password !== value) {
        setLockPrompt(null);
        window.alert(t('lock.passwordMismatch'));
        return;
      }
      try {
        await setScreenLock(value);
        setConfig(await readConfig());
        setLockUnlocked(true);
        setLockPrompt(null);
      } catch (error) {
        setLockPrompt(null);
        window.alert(t('lock.error', { message: String(error) }));
      }
    },
    [lockPrompt, t],
  );

  const onClearLock = useCallback(async () => {
    try {
      await clearScreenLock();
      setConfig(await readConfig());
      setLockUnlocked(true);
    } catch (error) {
      window.alert(t('lock.error', { message: String(error) }));
    }
  }, [t]);

  const onUnlock = useCallback(async (password: string) => {
    const valid = await verifyScreenLock(password);
    if (valid) setLockUnlocked(true);
    return valid;
  }, []);

  const onConfirmGitSync = useCallback(async () => {
    if (!workspace.root || !config.gitRemote.url || gitSyncBusy) return;
    setGitSyncBusy(true);
    try {
      const result = await syncGit(workspace.root, config.gitRemote);
      await refreshGitStatus();
      const message = result.conflicts.length
        ? t('git.syncCompleteWithConflicts', {
            local: result.localBranch,
            remote: result.remoteBranch,
            count: result.conflicts.length,
          })
        : t('git.syncComplete', { local: result.localBranch, remote: result.remoteBranch });
      if (result.preview) {
        setGitSyncMessage(message);
        setGitPreview(result.preview);
      } else {
        window.alert(message);
      }
    } catch (error) {
      window.alert(t('git.error', { message: String(error) }));
      await refreshGitStatus();
    } finally {
      setGitSyncBusy(false);
    }
  }, [config.gitRemote, gitSyncBusy, refreshGitStatus, t, workspace.root]);

  const onGitSync = onConfirmGitSync;

  const onOpenHit = useCallback(
    async (path: string, line: number) => {
      await doc.actions.openPath(path);
      setPendingGoto(line);
    },
    [doc.actions],
  );

  // --- histórico de navegação entre notas (tarefa 41) ---
  const navBack = useRef<Array<{ path: string; line: number }>>([]);
  const navFwd = useRef<Array<{ path: string; line: number }>>([]);
  const statePathRef = useRef(state.path);
  statePathRef.current = state.path;

  const goTo = useCallback(
    async (path: string, anchor: string | null) => {
      if (anchor) {
        try {
          const f = await readTextFile(path);
          await doc.actions.openPath(path);
          setPendingGoto(anchorLine(f.content, anchor) ?? 1);
          return;
        } catch {
          /* cai no open simples */
        }
      }
      await doc.actions.openPath(path);
    },
    [doc.actions],
  );

  const navigate = useCallback(
    (path: string, anchor: string | null) => {
      if (statePathRef.current) {
        navBack.current.push({ path: statePathRef.current, line: cursorRef.current.line });
      }
      navFwd.current = [];
      void goTo(path, anchor);
    },
    [goTo],
  );

  const goBack = useCallback(() => {
    const prev = navBack.current.pop();
    if (!prev) return;
    if (statePathRef.current) {
      navFwd.current.push({ path: statePathRef.current, line: cursorRef.current.line });
    }
    void doc.actions.openPath(prev.path).then(() => setPendingGoto(prev.line));
  }, [doc.actions]);

  const goForward = useCallback(() => {
    const next = navFwd.current.pop();
    if (!next) return;
    if (statePathRef.current) {
      navBack.current.push({ path: statePathRef.current, line: cursorRef.current.line });
    }
    void doc.actions.openPath(next.path).then(() => setPendingGoto(next.line));
  }, [doc.actions]);

  const newWindow = useCallback(() => {
    void openNewWindow({ workspace: workspace.root }).catch((err: unknown) =>
      window.alert(t('app.openWindowError', { error: String(err) })),
    );
  }, [workspace.root, t]);

  // --- exportar workspace como site estático (tarefa 50) ---
  const doSiteExport = useCallback(async () => {
    const notes = workspace.notes;
    if (notes.length === 0) {
      window.alert(t('app.noNotesToExport'));
      return;
    }
    const dir = await pickFolder();
    if (!dir) return;
    try {
      const withContent = await Promise.all(
        notes.map(async (n) => {
          try {
            const f = await readTextFile(n.path);
            return { path: n.path, title: n.title, content: f.content };
          } catch {
            return null;
          }
        }),
      );
      const siteNotes = withContent.filter((n): n is NonNullable<typeof n> => n !== null);
      const pages = await buildSite(
        siteNotes,
        notes,
        configRef.current.htmlExport,
        configRef.current.docFont,
      );
      const root = dir.replace(/\\/g, '/').replace(/\/$/, '');
      for (const [name, html] of pages) {
        await writeTextFile(`${root}/${name}`, html, { eol: 'lf', bom: false });
      }
      window.alert(t('app.siteExported', { count: pages.size, path: root }));
    } catch (err) {
      window.alert(t('app.siteExportError', { error: String(err) }));
    }
  }, [workspace.notes, t]);

  // --- abas: fechar com guarda de "não salvo" (tarefa 61) ---
  const requestCloseTab = useCallback(
    (id: string) => {
      const tab = doc.tabs.find((t) => t.id === id);
      if (!tab) return;
      if (tab.dirty) {
        doc.actions.activateTab(id);
        setCloseTabPrompt({ id, title: tab.title });
      } else {
        doc.actions.closeTab(id);
      }
    },
    [doc.tabs, doc.actions],
  );

  const resolveCloseTab = useCallback(
    async (choice: string) => {
      const p = closeTabPrompt;
      setCloseTabPrompt(null);
      if (!p || choice === 'cancel') return;
      if (choice === 'save') {
        const r = await doc.actions.save();
        if (!r.ok) {
          if (r.conflict) setConflict('save');
          return;
        }
      }
      doc.actions.closeTab(p.id);
    },
    [closeTabPrompt, doc.actions],
  );

  // --- salvar com detecção de conflito de disco (tarefa 62) ---
  const trySave = useCallback(async (): Promise<boolean> => {
    const r = await doc.actions.save();
    if (r.conflict) {
      setConflict('save');
      return false;
    }
    return r.ok;
  }, [doc.actions]);

  const onLockNow = useCallback(async () => {
    const otherDirtyTabs = doc.dirtyDocs.filter((entry) => entry.id !== doc.activeId);
    if (otherDirtyTabs.length > 0) {
      window.alert(t('lock.saveBefore'));
      return;
    }
    if (dirty && !(await trySave())) return;
    setSettingsOpen(false);
    setLockUnlocked(false);
  }, [dirty, doc.activeId, doc.dirtyDocs, t, trySave]);

  const trySaveAs = useCallback(async (): Promise<boolean> => {
    const r = await doc.actions.saveAs();
    return r.ok;
  }, [doc.actions]);

  const requestAgeEncrypt = useCallback(async (path = state.path) => {
    if (!path) return;
    const openTab = doc.tabs.find((tab) => tab.path === path);
    if (openTab?.dirty && path !== state.path) {
      window.alert(t('age.saveBeforeEncrypt'));
      return;
    }
    if (path === state.path && dirty && !(await trySave())) return;
    window.alert(t('age.gitHistoryWarning'));
    setAgePrompt({ action: 'encrypt', step: 'password', path });
  }, [doc.tabs, dirty, state.path, t, trySave]);

  const requestAgeDecrypt = useCallback(async (path?: string) => {
    const selectedPath = path ?? await pickAgePath();
    if (selectedPath) {
      window.alert(t('age.decryptSafety'));
      setAgePrompt({ action: 'decrypt', step: 'password', path: selectedPath });
    }
  }, [t]);

  const handleAgeTreeAction = useCallback((entry: DirEntry) => {
    if (entry.isDir) return;
    if (entry.isAge) void requestAgeDecrypt(entry.path);
    else void requestAgeEncrypt(entry.path);
  }, [requestAgeDecrypt, requestAgeEncrypt]);

  const resolveAgePrompt = useCallback(
    async (value: string | null) => {
      if (!agePrompt) return;
      if (value === null) {
        setAgePrompt(null);
        return;
      }
      if (agePrompt.action === 'encrypt' && agePrompt.step === 'password') {
        setAgePrompt({ ...agePrompt, step: 'confirm', password: value });
        return;
      }
      if (agePrompt.action === 'encrypt' && agePrompt.password !== value) {
        setAgePrompt(null);
        window.alert(t('age.passwordMismatch'));
        return;
      }
      try {
        const output =
          agePrompt.action === 'encrypt'
            ? await ageEncryptFile(agePrompt.path, agePrompt.password ?? '')
            : await ageDecryptFile(agePrompt.path, value);
        if (agePrompt.action === 'encrypt') {
          for (const tab of doc.tabs.filter((entry) => entry.path === agePrompt.path)) {
            doc.actions.closeTab(tab.id);
          }
        } else {
          await doc.actions.openPath(output);
        }
        await refreshGitStatus();
        await workspace.actions.refresh();
        setAgePrompt(null);
        window.alert(t(agePrompt.action === 'encrypt' ? 'age.encrypted' : 'age.decrypted'));
      } catch (error) {
        setAgePrompt(null);
        window.alert(t('age.error', { message: String(error) }));
      }
    },
    [agePrompt, doc.actions, doc.tabs, refreshGitStatus, t, workspace.actions],
  );

  const resolveConflict = useCallback(
    (choice: string) => {
      const mode = conflict;
      setConflict(null);
      if (choice === 'overwrite') void doc.actions.save(true);
      else if (choice === 'reload') void doc.actions.reloadFromDisk();
      // 'keep' / 'cancel': não faz nada
      void mode;
    },
    [conflict, doc.actions],
  );

  // --- restaurar cursor ao trocar de aba ---
  const prevEditorKey = useRef(doc.editorKey);
  useEffect(() => {
    if (prevEditorKey.current === doc.editorKey) return;
    prevEditorKey.current = doc.editorKey;
    if (doc.activeCursor.line > 1) setPendingGoto(doc.activeCursor.line);
  }, [doc.editorKey, doc.activeCursor.line]);

  // Referência viva para os handlers de fechamento/autosave.
  const live = useRef({ dirty, state, save: doc.actions.save, dirtyDocs: doc.dirtyDocs });
  live.current = { dirty, state, save: doc.actions.save, dirtyDocs: doc.dirtyDocs };
  const configRef = useRef(config);
  configRef.current = config;

  // --- boot: ping + config + arquivo de inicialização + rascunhos ---
  useEffect(() => {
    ping()
      .then(setInfo)
      .catch((err: unknown) => setIpcError(String(err)));

    const wsFromQuery = workspaceFromQuery();
    const isMain = currentWindowLabel() === 'main';
    Promise.resolve(initialConfig)
      .then(async (cfg) => {
        if (wsFromQuery) {
          await workspace.actions.openRoot(wsFromQuery);
          return;
        }
        // tarefa 66: janela principal reabre o conjunto salvo, se ativado
        if (isMain && cfg.reopenWindowsOnStart) {
          const list = await takeReopenWorkspaces();
          if (list.length > 0) {
            await workspace.actions.openRoot(list[0]!);
            for (const extra of list.slice(1)) void openNewWindow({ workspace: extra });
            return;
          }
        }
        if (cfg.lastWorkspace) void workspace.actions.openRoot(cfg.lastWorkspace);
      })
      .catch(() => {
        if (wsFromQuery) void workspace.actions.openRoot(wsFromQuery);
      });

    startupFile()
      .then((p) => {
        if (p) void doc.actions.openPath(p);
      })
      .catch(() => undefined);

    listRecovery()
      .then(setRecovery)
      .catch(() => setRecovery([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- persistir config ao mudar ---
  const persistConfig = useCallback((next: AppConfig) => {
    setConfig(next);
    void writeConfig(next).catch(() => undefined);
  }, []);

  useEffect(() => {
    void i18n.changeLanguage(config.language);
    document.documentElement.lang = config.language;
    if (isTauri)
      void invoke('set_app_language', { language: config.language }).catch(() => undefined);
  }, [config.language]);

  // --- tema + fonte do editor (tarefa 70 / 71) ---
  useEffect(() => {
    applyTheme(config.theme);
  }, [config.theme]);
  useEffect(() => {
    applyEditorFontSize(config.editorFontSize);
  }, [config.editorFontSize]);
  useEffect(() => {
    applyDocFont(config.docFont);
  }, [config.docFont]);

  // --- aviso do backend sobre a config (corrompida / migrada — tarefa 72) ---
  useEffect(() => {
    if (config.notice) window.alert(config.notice);
    // roda só quando a mensagem muda (uma vez no boot)
  }, [config.notice]);

  const setPreviewMode = useCallback(
    (previewMode: PreviewMode) => {
      if (previewMode !== 'editor') warmUpEngine();
      persistConfig({ ...configRef.current, previewMode });
    },
    [persistConfig],
  );

  const cyclePreviewMode = useCallback(() => {
    const order: PreviewMode[] = ['editor', 'split', 'preview'];
    const next = order[(order.indexOf(configRef.current.previewMode) + 1) % order.length];
    setPreviewMode(next);
  }, [setPreviewMode]);

  const cycleTheme = useCallback(() => {
    const order: ThemePref[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(configRef.current.theme) + 1) % order.length]!;
    persistConfig({ ...configRef.current, theme: next });
  }, [persistConfig]);

  // --- título da janela reflete arquivo + estado "modificado" ---
  useEffect(() => {
    const prefix = dirty ? '● ' : '';
    void appWindow()?.setTitle(`${prefix}${doc.title} — AppAsciiDoc`);
  }, [dirty, doc.title]);

  // --- lembrar workspace + nota ativa (tarefa 38 / 66) ---
  useEffect(() => {
    if (workspace.root && workspace.root !== configRef.current.lastWorkspace) {
      persistConfig({ ...configRef.current, lastWorkspace: workspace.root });
    }
  }, [workspace.root, persistConfig]);

  // --- registrar esta janela p/ "reabrir ao iniciar" (tarefa 66) ---
  useEffect(() => {
    trackWindow(workspace.root);
  }, [workspace.root]);

  // --- lembrar abas abertas / fixadas / ativa (tarefa 38 / 61 / 66) ---
  useEffect(() => {
    if (!workspace.root) return;
    const withPath = doc.tabs.filter((t) => t.path);
    workspace.actions.persistSession({
      openFiles: withPath.map((t) => t.path as string),
      pinnedFiles: withPath.filter((t) => t.pinned).map((t) => t.path as string),
      activeFile: doc.tabs.find((t) => t.active)?.path ?? null,
    });
  }, [doc.tabs, workspace.root, workspace.actions]);

  // --- autosave opcional ---
  useEffect(() => {
    if (config.autosaveMs <= 0 || !dirty || !state.path) return;
    const id = window.setTimeout(() => {
      void live.current.save();
    }, config.autosaveMs);
    return () => window.clearTimeout(id);
  }, [config.autosaveMs, dirty, state.path, state.content]);

  // --- interceptar fechamento com alterações não salvas ---
  useEffect(() => {
    const w = appWindow();
    if (!w) return;
    let unlisten: (() => void) | undefined;
    void w
      .onCloseRequested(async (event) => {
        const dd = live.current.dirtyDocs;
        if (dd.length === 0) {
          await untrackWindow(); // tarefa 66
          return; // deixa fechar
        }
        event.preventDefault();

        // rede de segurança: grava rascunho de cada aba modificada
        for (const d of dd) {
          await saveRecovery(d.path, d.content).catch(() => undefined);
        }

        const choice = await new Promise<string>((resolve) => setClosePrompt({ resolve }));
        setClosePrompt(null);

        if (choice === 'cancel') return;
        if (choice === 'save') {
          for (const d of dd) {
            if (d.path) {
              await writeTextFile(d.path, d.content, { eol: d.eol, bom: d.bom }).catch(
                () => undefined,
              );
            }
          }
        }
        await untrackWindow(); // tarefa 66
        await w.destroy();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  // --- ao focar a janela, checa se o arquivo mudou fora do editor (tarefa 62) ---
  useEffect(() => {
    const w = appWindow();
    if (!w) return;
    let unlisten: (() => void) | undefined;
    void w
      .onFocusChanged(({ payload: focused }) => {
        if (!focused) return;
        void doc.actions.checkActiveDiskChange().then((st) => {
          if (st !== 'changed') return;
          if (live.current.dirty) setConflict('external');
          else void doc.actions.reloadFromDisk();
        });
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [doc.actions]);

  useKeybindings(
    useMemo(
      () => ({
        onNew: doc.actions.newFile,
        onNewWindow: newWindow,
        onOpen: () => void doc.actions.openViaDialog(),
        onCloseTab: () => requestCloseTab(doc.activeId),
        onNextTab: () => doc.actions.cycleTab(1),
        onPrevTab: () => doc.actions.cycleTab(-1),
        onSave: () => void trySave(),
        onSaveAs: () => void trySaveAs(),
        onTogglePalette: () => setPaletteOpen((v) => !v),
        onTogglePreview: cyclePreviewMode,
        onToggleInlineMode: () =>
          persistConfig({ ...configRef.current, inlineMode: !configRef.current.inlineMode }),
        onQuickOpen: () => setQuickOpen((v) => (v === 'off' ? 'open' : 'off')),
        onInsertLink: () => setQuickOpen('link'),
        onOpenSettings: () => setSettingsOpen(true),
        onNavBack: goBack,
        onNavForward: goForward,
        suspended:
          paletteOpen ||
          quickOpen !== 'off' ||
          !!closePrompt ||
          !!closeTabPrompt ||
          !!conflict ||
          settingsOpen,
      }),
      [
        doc.actions,
        doc.activeId,
        paletteOpen,
        quickOpen,
        closePrompt,
        closeTabPrompt,
        conflict,
        settingsOpen,
        cyclePreviewMode,
        persistConfig,
        goBack,
        goForward,
        newWindow,
        requestCloseTab,
        trySave,
        trySaveAs,
      ],
    ),
  );

  const commandContext = useMemo<CommandContext>(
    () => ({
      newFile: doc.actions.newFile,
      newWindow,
      closeTab: () => requestCloseTab(doc.activeId),
      openViaDialog: doc.actions.openViaDialog,
      save: trySave,
      saveAs: trySaveAs,
      reloadFromDisk: doc.actions.reloadFromDisk,
      hasPath: !!state.path,
      openFolder: workspace.actions.openFolder,
      toggleWordWrap: () => persistConfig({ ...config, wordWrap: !config.wordWrap }),
      toggleLineNumbers: () => persistConfig({ ...config, lineNumbers: !config.lineNumbers }),
      togglePreview: cyclePreviewMode,
      toggleInlineMode: () =>
        persistConfig({ ...configRef.current, inlineMode: !configRef.current.inlineMode }),
      inlineMode: config.inlineMode,
      previewAvailable: true,
      navBack: goBack,
      navForward: goForward,
      insertLink: () => setQuickOpen('link'),
      unresolvedLinks: () => setShowBroken(true),
      hasWorkspace: !!workspace.root,
      exportHtml: () => setExportOpen(true),
      exportPdf: () => setPdfOpen(true),
      exportSite: () => void doSiteExport(),
      canExport: !!state.content.trim(),
      toggleReopenWindows: () =>
        persistConfig({
          ...configRef.current,
          reopenWindowsOnStart: !configRef.current.reopenWindowsOnStart,
        }),
      reopenWindows: config.reopenWindowsOnStart,
      openSettings: () => setSettingsOpen(true),
      cycleTheme,
      encryptCurrent: requestAgeEncrypt,
      decryptAgeFile: requestAgeDecrypt,
      syncGit: onGitSync,
      hasGitRemote: !!config.gitRemote.url,
    }),
    [
      doc.actions,
      doc.activeId,
      state.path,
      state.content,
      config,
      persistConfig,
      cyclePreviewMode,
      workspace.actions,
      workspace.root,
      goBack,
      goForward,
      newWindow,
      requestCloseTab,
      trySave,
      trySaveAs,
      cycleTheme,
      doSiteExport,
      requestAgeEncrypt,
      requestAgeDecrypt,
      onGitSync,
    ],
  );

  // --- menu de aplicativo nativo (tarefa 63) ---
  const menuHandler = useCallback(
    (id: string) => {
      if (id === 'go.quickOpen') return setQuickOpen('open');
      if (id === 'go.palette') return setPaletteOpen(true);
      if (id === 'help.about') {
        window.alert(info ? t('app.about', { ...info }) : t('app.aboutFallback'));
        return;
      }
      const cmd = buildCommands(commandContext, (key) => t(key)).find((c) => c.id === id);
      if (cmd && cmd.enabled !== false) void cmd.run();
    },
    [commandContext, info, t],
  );
  const menuHandlerRef = useRef(menuHandler);
  menuHandlerRef.current = menuHandler;

  useEffect(() => {
    if (!appWindow()) return;
    const un = listen<string>('menu', (e) => menuHandlerRef.current(e.payload));
    return () => {
      void un.then((fn) => fn());
    };
  }, []);

  const onRestoreRecovery = useCallback(
    (entry: RecoveryEntry) => {
      doc.actions.adoptRecovery(entry);
      void discardRecovery(entry.key).catch(() => undefined);
      setRecovery((list) => list.filter((r) => r.key !== entry.key));
    },
    [doc.actions],
  );

  const onDiscardRecovery = useCallback((entry: RecoveryEntry) => {
    void discardRecovery(entry.key).catch(() => undefined);
    setRecovery((list) => list.filter((r) => r.key !== entry.key));
  }, []);

  // Ctrl+K → escolher nota e inserir a ligação (tarefa 45; formato via config — tarefa 71)
  const onPickNote = useCallback((note: NoteInfo) => {
    const api = editorApiRef.current;
    if (!api) return;
    const sel = api.getSelection().trim();
    const stem = baseName(note.path).replace(/\.(adoc|asciidoc|asc)$/i, '');
    if (configRef.current.wikilinkMode === 'wikilink') {
      api.insertText(sel ? `[[${stem}|${sel}]]` : `[[${stem}]]`);
    } else {
      const label = sel || note.title || baseName(note.path);
      api.insertText(`xref:${baseName(note.path)}[${label}]`);
    }
  }, []);

  const broken = useMemo(
    () => (showBroken ? unresolvedLinks(workspace.notes) : []),
    [showBroken, workspace.notes],
  );

  // --- exportar HTML (Fase 6) ---
  const doExport = useCallback(async () => {
    setExportBusy(true);
    try {
      const html = await buildStandaloneHtml(
        state.content,
        state.path,
        workspace.notes,
        configRef.current.htmlExport,
        configRef.current.docFont,
      );
      const suggested = state.path
        ? state.path.replace(/\.(adoc|asciidoc|asc)$/i, '.html')
        : `${doc.title || 'documento'}.html`;
      const target = await pickSavePath(suggested, 'html');
      if (target) {
        await writeTextFile(target, html, { eol: 'lf', bom: false });
        setExportOpen(false);
      }
    } catch (err) {
      window.alert(t('app.exportError', { error: String(err) }));
    } finally {
      setExportBusy(false);
    }
  }, [state.content, state.path, workspace.notes, doc.title, t]);

  const doPdfExport = useCallback(async () => {
    setPdfBusy(true);
    try {
      const { html, headings } = await buildPrintDoc(
        state.content,
        state.path,
        workspace.notes,
        configRef.current.pdfExport,
        configRef.current.docFont,
      );
      setPdfOpen(false);

      // Tenta o caminho nativo (grava direto, sem diálogo — tarefas 55–57).
      if (isTauri) {
        const suggested = state.path
          ? state.path.replace(/\.(adoc|asciidoc|asc)$/i, '.pdf')
          : `${doc.title || 'documento'}.pdf`;
        const target = await pickSavePath(suggested, 'pdf');
        if (!target) return;
        try {
          await printToPdf(html, target);
          if (configRef.current.pdfExport.toc && headings.length > 0) {
            await addPdfOutline(target, headings).catch(() => undefined);
          }
          return;
        } catch {
          // caiu o nativo → usa o diálogo de impressão do SO
        }
      }
      await printViaBrowser(html);
    } catch (err) {
      window.alert(t('app.pdfError', { error: String(err) }));
    } finally {
      setPdfBusy(false);
    }
  }, [state.content, state.path, workspace.notes, doc.title, t]);

  if (config.lock.enabled && !lockUnlocked) return <UnlockScreen onVerify={onUnlock} />;

  return (
    <>
      <AppShell
        info={info}
        ipcError={ipcError}
        doc={doc}
        workspace={workspace}
        onOpenHit={onOpenHit}
        onNavigate={navigate}
        onEditorApi={(api) => (editorApiRef.current = api)}
        gotoLine={pendingGoto}
        onGotoConsumed={() => setPendingGoto(null)}
        onOpenFolder={(path) => void workspace.actions.openRoot(path.replace(/\\/g, '/'))}
        onRequestCloseTab={requestCloseTab}
        cursor={cursor}
        onCursorChange={(line, col) => {
          setCursor({ line, col });
          doc.actions.setTabCursor(line, col);
        }}
        onPreviewMode={setPreviewMode}
        config={config}
        recovery={recovery}
        onRestoreRecovery={onRestoreRecovery}
        onDiscardRecovery={onDiscardRecovery}
        onOpenPalette={() => setPaletteOpen(true)}
        gitStatus={gitStatus}
        canSync={!!config.gitRemote.url && !!workspace.root}
        onGitSync={() => void onGitSync()}
        gitSyncBusy={gitSyncBusy}
        onAgeAction={handleAgeTreeAction}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        context={commandContext}
      />
      <QuickOpen
        open={quickOpen !== 'off'}
        notes={workspace.notes}
        onClose={() => setQuickOpen('off')}
        onOpen={openFileFromWorkspace}
        pickMode={quickOpen === 'link'}
        onPick={onPickNote}
      />
      {showBroken && (
        <div className="palette-backdrop" onMouseDown={() => setShowBroken(false)}>
          <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
            <div className="palette__input" style={{ cursor: 'default' }}>
              {t('editor.brokenTitle', { count: broken.length })}
            </div>
            <ul className="palette__list">
              {broken.length === 0 && <li className="palette__empty">{t('editor.noneBroken')}</li>}
              {broken.map((b, i) => (
                <li
                  key={i}
                  className="palette__item"
                  onClick={() => {
                    setShowBroken(false);
                    void onOpenHit(b.fromPath, b.line);
                  }}
                >
                  <span className="quickopen__title">
                    {b.fromTitle}:{b.line} — <em>{b.target}</em>
                  </span>
                  <span className="quickopen__path">{b.kind}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <ExportDialog
        open={exportOpen}
        options={config.htmlExport}
        onChange={(htmlExport) => persistConfig({ ...configRef.current, htmlExport })}
        onClose={() => setExportOpen(false)}
        onExport={() => void doExport()}
        busy={exportBusy}
      />
      <PdfExportDialog
        open={pdfOpen}
        options={config.pdfExport}
        onChange={(pdfExport) => persistConfig({ ...configRef.current, pdfExport })}
        onClose={() => setPdfOpen(false)}
        onExport={() => void doPdfExport()}
        busy={pdfBusy}
      />
      <ConfirmDialog
        open={!!closePrompt}
        title={t('dialogs.unsavedTitle')}
        message={
          doc.dirtyDocs.length > 1
            ? t('dialogs.unsavedTabs', { count: doc.dirtyDocs.length })
            : t('dialogs.unsavedOne', { title: doc.title })
        }
        buttons={[
          { label: t('dialogs.saveExit'), value: 'save', variant: 'primary' },
          { label: t('dialogs.exitWithoutSaving'), value: 'discard', variant: 'danger' },
          { label: t('common.cancel'), value: 'cancel', variant: 'ghost' },
        ]}
        onResolve={(v) => closePrompt?.resolve(v)}
      />
      <ConfirmDialog
        open={!!closeTabPrompt}
        title={t('dialogs.closeTabTitle')}
        message={t('dialogs.unsavedOne', { title: closeTabPrompt?.title ?? '' })}
        buttons={[
          { label: t('dialogs.saveClose'), value: 'save', variant: 'primary' },
          { label: t('dialogs.closeWithoutSaving'), value: 'discard', variant: 'danger' },
          { label: t('common.cancel'), value: 'cancel', variant: 'ghost' },
        ]}
        onResolve={(v) => void resolveCloseTab(v)}
      />
      <SettingsDialog
        open={settingsOpen}
        config={config}
        onChange={persistConfig}
        onClose={() => setSettingsOpen(false)}
        onTestGitRemote={() => void onTestGitRemote()}
        remoteTestState={remoteTestState}
        lockEnabled={config.lock.enabled}
        onSetLock={onSetLock}
        onClearLock={() => void onClearLock()}
        onLockNow={() => void onLockNow()}
      />
      <GitPreviewDialog
        preview={gitPreview}
        busy={gitSyncBusy}
        readOnly
        summary={gitSyncMessage ?? ''}
        onClose={() => {
          setGitPreview(null);
          setGitSyncMessage(null);
        }}
        onSync={() => undefined}
      />
      <PromptDialog
        open={!!agePrompt}
        title={t(agePrompt?.step === 'confirm' ? 'age.confirmTitle' : 'age.passwordTitle')}
        placeholder={t('age.passwordPlaceholder')}
        confirmLabel={t('common.ok')}
        inputType="password"
        onResolve={(value) => void resolveAgePrompt(value)}
      />
      <PromptDialog
        open={!!lockPrompt}
        title={t(lockPrompt?.step === 'confirm' ? 'lock.confirmTitle' : 'lock.passwordTitle')}
        placeholder={t('age.passwordPlaceholder')}
        confirmLabel={t('common.ok')}
        inputType="password"
        onResolve={(value) => void onResolveLockPrompt(value)}
      />
      <ConfirmDialog
        open={!!conflict}
        title={t('dialogs.externalTitle')}
        message={
          conflict === 'save'
            ? t('dialogs.externalOverwrite', { title: doc.title })
            : t('dialogs.externalChanged', { title: doc.title })
        }
        buttons={
          conflict === 'save'
            ? [
                { label: t('dialogs.overwrite'), value: 'overwrite', variant: 'danger' },
                { label: t('dialogs.reload'), value: 'reload', variant: 'primary' },
                { label: t('common.cancel'), value: 'cancel', variant: 'ghost' },
              ]
            : [
                { label: t('dialogs.reload'), value: 'reload', variant: 'danger' },
                { label: t('dialogs.keepMine'), value: 'keep', variant: 'primary' },
              ]
        }
        onResolve={resolveConflict}
      />
      <ConfirmDialog
        open={!!workspace.pendingRename}
        title={t('dialogs.renameTitle')}
        message={
          workspace.pendingRename
            ? t('dialogs.renameMessage', {
                count: workspace.pendingRename.files.length,
                oldName: workspace.pendingRename.oldStem,
                newName: workspace.pendingRename.newStem,
              })
            : ''
        }
        buttons={[
          { label: t('common.update'), value: 'apply', variant: 'primary' },
          { label: t('dialogs.dontChange'), value: 'skip', variant: 'ghost' },
        ]}
        onResolve={(v) =>
          v === 'apply'
            ? void workspace.actions.applyPendingRename()
            : workspace.actions.dismissPendingRename()
        }
      />
    </>
  );
}
