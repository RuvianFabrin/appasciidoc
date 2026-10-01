import { useTranslation } from 'react-i18next';
import type { GitPreview } from '../workspace/api';

interface Props {
  preview: GitPreview | null;
  busy: boolean;
  onClose: () => void;
  onSync: () => void;
  readOnly?: boolean;
  summary?: string;
}

export function GitPreviewDialog({ preview, busy, onClose, onSync, readOnly = false, summary }: Props) {
  const { t } = useTranslation();
  if (!preview) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
        className="dialog git-preview"
        role="dialog"
        aria-modal="true"
        aria-label={t('git.previewTitle')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="dialog__title">{t('git.previewTitle')}</h2>
        {summary && <p role="status">{summary}</p>}
        <p>
          {t('git.branchCompare', {
            local: preview.localBranch,
            remote: preview.remoteBranch,
          })}
        </p>
        <p>{t('git.aheadBehind', { ahead: preview.ahead, behind: preview.behind })}</p>
        {preview.localChanges > 0 && (
          <p role="note">{t('git.localChangesPreview', { count: preview.localChanges })}</p>
        )}
        <h3>{t('git.filesChanged', { count: preview.files.length })}</h3>
        {preview.files.length ? (
          <ul className="git-preview__files">
            {preview.files.map((file, index) => (
              <li key={`${file.source}-${file.path}-${index}`}>
                <code>{t(file.source === 'remote' ? 'git.remoteChange' : 'git.localChange')}: {file.change}</code> {file.path}
              </li>
            ))}
          </ul>
        ) : (
          <p>{t('git.noDifference')}</p>
        )}
        {preview.remotePatch && (
          <details className="git-preview__details">
            <summary>{t('git.remoteDiff')}</summary>
            <pre className="git-preview__patch">{preview.remotePatch}</pre>
          </details>
        )}
        {preview.localPatch && (
          <details className="git-preview__details">
            <summary>{t('git.localDiff')}</summary>
            <pre className="git-preview__patch">{preview.localPatch}</pre>
          </details>
        )}
        <div className="dialog__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {t(readOnly ? 'common.close' : 'common.cancel')}
          </button>
          {!readOnly && (
            <button className="btn btn--primary" onClick={onSync} disabled={busy}>
              {busy ? t('git.syncing') : t('git.syncNow')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
