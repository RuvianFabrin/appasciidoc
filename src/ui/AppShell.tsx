import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { EditorArea } from './EditorArea';
import { StatusBar } from './StatusBar';
import type { AppInfo } from '../ipc';
import type { DocumentModel } from '../state/useDocumentModel';
import type { WorkspaceModel } from '../workspace/useWorkspace';
import type { EditorApi } from '../editor/Editor';
import type { AppConfig, PreviewMode, RecoveryEntry } from '../config/config';
import type { GitStatus } from '../workspace/api';
import type { DirEntry } from '../workspace/api';
import { Icon } from './Icon';

interface Props {
  info: AppInfo | null;
  ipcError: string | null;
  doc: DocumentModel;
  workspace: WorkspaceModel;
  onOpenHit: (path: string, line: number) => void;
  onNavigate: (path: string, anchor: string | null) => void;
  onEditorApi: (api: EditorApi) => void;
  gotoLine: number | null;
  onGotoConsumed: () => void;
  onOpenFolder: (path: string) => void;
  onRequestCloseTab: (id: string) => void;
  cursor: { line: number; col: number };
  onCursorChange: (line: number, col: number) => void;
  onPreviewMode: (mode: PreviewMode) => void;
  config: AppConfig;
  recovery: RecoveryEntry[];
  onRestoreRecovery: (entry: RecoveryEntry) => void;
  onDiscardRecovery: (entry: RecoveryEntry) => void;
  onOpenPalette: () => void;
  gitStatus: GitStatus | null;
  canSync: boolean;
  onGitSync: () => void;
  gitSyncBusy: boolean;
  onAgeAction: (entry: DirEntry) => void;
}

/** Esqueleto da janela: barra lateral + área central (editor) + barra de status. */
export function AppShell({
  info,
  ipcError,
  doc,
  workspace,
  onOpenHit,
  onNavigate,
  onEditorApi,
  gotoLine,
  onGotoConsumed,
  onOpenFolder,
  onRequestCloseTab,
  cursor,
  onCursorChange,
  onPreviewMode,
  config,
  recovery,
  onRestoreRecovery,
  onDiscardRecovery,
  onOpenPalette,
  gitStatus,
  canSync,
  onGitSync,
  gitSyncBusy,
  onAgeAction,
}: Props) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  return (
    <div className={`app-shell${mobileSidebarOpen ? ' app-shell--sidebar-open' : ''}`}>
      {mobileSidebarOpen && (
        <button
          className="mobile-sidebar-backdrop"
          aria-label="Fechar navegação"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <aside className="app-sidebar-host">
      <button
        className="mobile-sidebar-close"
        aria-label="Fechar navegação"
        onClick={() => setMobileSidebarOpen(false)}
      >
        <Icon name="close" />
      </button>
      <Sidebar
        workspace={workspace}
        activeFile={doc.state.path}
        onOpenFile={(path) => {
          setMobileSidebarOpen(false);
          void doc.actions.openPath(path);
        }}
        onOpenHit={onOpenHit}
        onAgeAction={onAgeAction}
      />
      </aside>
      <main className="app-main">
        <button
          className="mobile-sidebar-toggle"
          aria-label="Abrir navegação"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <EditorArea
          doc={doc}
          config={config}
          notes={workspace.notes}
          onNavigate={onNavigate}
          onEditorApi={onEditorApi}
          onCursorChange={onCursorChange}
          onPreviewMode={onPreviewMode}
          gotoLine={gotoLine}
          onGotoConsumed={onGotoConsumed}
          onOpenFile={(path) => void doc.actions.openPath(path)}
          onOpenFolder={onOpenFolder}
          onRequestCloseTab={onRequestCloseTab}
          recovery={recovery}
          onRestoreRecovery={onRestoreRecovery}
          onDiscardRecovery={onDiscardRecovery}
        />
      </main>
      <StatusBar
        info={info}
        ipcError={ipcError}
        doc={doc}
        cursor={cursor}
        onOpenPalette={onOpenPalette}
        noteCount={workspace.root ? workspace.notes.length : null}
        indexing={workspace.loading}
        gitStatus={gitStatus}
        canSync={canSync}
        onGitSync={onGitSync}
        gitSyncBusy={gitSyncBusy}
      />
    </div>
  );
}
