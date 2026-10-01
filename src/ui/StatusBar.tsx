import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import type { AppInfo } from '../ipc';
import type { DocumentModel } from '../state/useDocumentModel';
import type { GitStatus } from '../workspace/api';

interface Props {
  info: AppInfo | null;
  ipcError: string | null;
  doc: DocumentModel;
  cursor: { line: number; col: number };
  onOpenPalette: () => void;
  /** Workspace aberto: total de notas indexadas (null = sem workspace). */
  noteCount: number | null;
  /** Reindexação em andamento. */
  indexing: boolean;
  gitStatus: GitStatus | null;
  canSync: boolean;
  onGitSync: () => void;
  gitSyncBusy: boolean;
}

export function StatusBar({
  info,
  ipcError,
  doc,
  cursor,
  onOpenPalette,
  noteCount,
  indexing,
  gitStatus,
  canSync,
  onGitSync,
  gitSyncBusy,
}: Props) {
  const { t } = useTranslation();
  const { state, dirty, title } = doc;

  const words = useMemo(() => {
    const trimmed = state.content.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [state.content]);

  return (
    <footer className="app-statusbar">
      <button className="app-statusbar__btn" onClick={onOpenPalette} title="Ctrl+Shift+P">
        <Icon name="bolt" size={14} /> {t('status.commands')}
      </button>
      <span className="app-statusbar__item app-statusbar__item--path" title={state.path ?? ''}>
        {dirty ? '● ' : ''}
        {state.path ?? title}
      </span>

      <span className="app-statusbar__spacer" />

      <span className="app-statusbar__item">
        {t('status.line', { line: cursor.line, column: cursor.col })}
      </span>
      <span className="app-statusbar__item">{state.eol.toUpperCase()}</span>
      <span className="app-statusbar__item">{state.bom ? 'UTF-8 BOM' : 'UTF-8'}</span>
      <span className="app-statusbar__item">{t('status.words', { count: words })}</span>
      {noteCount !== null && (
        <span
          className="app-statusbar__item"
          title={indexing ? t('status.reindexing') : t('status.indexed')}
        >
          {indexing ? t('status.indexing') : t('status.notes', { count: noteCount })}
        </span>
      )}

      {gitStatus?.initialized && (
        <span className="app-statusbar__item">
          {t('git.localChanges', { count: gitStatus.changed })}
        </span>
      )}
      {canSync && (
        <button className="app-statusbar__btn" onClick={onGitSync} disabled={gitSyncBusy}>
          <Icon name="sync" size={14} /> {gitSyncBusy ? t('git.syncing') : t('git.syncButton')}
        </button>
      )}

      {ipcError ? (
        <span className="app-statusbar__item app-statusbar__item--error">IPC: {ipcError}</span>
      ) : (
        info && (
          <span className="app-statusbar__item">
            {info.name} v{info.version} · Tauri {info.tauriVersion}
          </span>
        )
      )}
    </footer>
  );
}
