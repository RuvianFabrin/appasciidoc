import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppConfig, Language } from '../config/config';
import { SUPPORTED_LOCALES } from '../i18n';

interface Props {
  open: boolean;
  config: AppConfig;
  onChange: (next: AppConfig) => void;
  onClose: () => void;
  onTestGitRemote: () => void;
  remoteTestState: 'idle' | 'testing' | 'success' | 'error';
  lockEnabled: boolean;
  onSetLock: () => void;
  onClearLock: () => void;
  onLockNow: () => void;
}

const AUTOSAVE_OPTIONS = [0, 1000, 2000, 5000, 10000];

/** Tela de configurações (tarefa 71). Cada mudança aplica e salva na hora. */
export function SettingsDialog({
  open,
  config,
  onChange,
  onClose,
  onTestGitRemote,
  remoteTestState,
  lockEnabled,
  onSetLock,
  onClearLock,
  onLockNow,
}: Props) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, onClose]);

  if (!open) return null;
  const set = (patch: Partial<AppConfig>) => onChange({ ...config, ...patch });

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-label={t('settings.title')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog__title">{t('settings.title')}</h2>

        <div className="export-opts">
          <label>
            {t('settings.language')}
            <select
              value={config.language}
              onChange={(e) => set({ language: e.target.value as Language })}
            >
              {SUPPORTED_LOCALES.map((locale) => (
                <option key={locale.code} value={locale.code}>
                  {locale.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('settings.theme')}
            <select
              value={config.theme}
              onChange={(e) => set({ theme: e.target.value as AppConfig['theme'] })}
            >
              <option value="system">{t('settings.system')}</option>
              <option value="light">{t('settings.light')}</option>
              <option value="dark">{t('settings.dark')}</option>
            </select>
          </label>

          <label>
            {t('settings.editorFontSize')}
            <input
              type="number"
              min={10}
              max={24}
              value={config.editorFontSize}
              onChange={(e) =>
                set({ editorFontSize: Math.min(24, Math.max(10, Number(e.target.value) || 14)) })
              }
            />
          </label>

          <label>
            {t('settings.docFont')}
            <select
              value={config.docFont}
              onChange={(e) => set({ docFont: e.target.value as AppConfig['docFont'] })}
            >
              <option value="inter">{t('settings.fontInter')}</option>
              <option value="literata">{t('settings.fontLiterata')}</option>
              <option value="source-serif">{t('settings.fontSourceSerif')}</option>
              <option value="system">{t('settings.fontSystem')}</option>
            </select>
          </label>

          <label>
            {t('settings.autosave')}
            <select
              value={config.autosaveMs}
              onChange={(e) => set({ autosaveMs: Number(e.target.value) })}
            >
              {AUTOSAVE_OPTIONS.map((ms) => (
                <option key={ms} value={ms}>
                  {ms === 0
                    ? t('settings.autosaveOff')
                    : t('settings.seconds', { count: ms / 1000 })}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('settings.linkFormat')}
            <select
              value={config.wikilinkMode}
              onChange={(e) => set({ wikilinkMode: e.target.value as AppConfig['wikilinkMode'] })}
            >
              <option value="wikilink">{t('settings.wikilink')}</option>
              <option value="xref">{t('settings.xref')}</option>
            </select>
          </label>

          <label className="export-opts__check">
            <input
              type="checkbox"
              checked={config.wordWrap}
              onChange={(e) => set({ wordWrap: e.target.checked })}
            />
            {t('settings.wordWrap')}
          </label>

          <label className="export-opts__check">
            <input
              type="checkbox"
              checked={config.lineNumbers}
              onChange={(e) => set({ lineNumbers: e.target.checked })}
            />
            {t('settings.lineNumbers')}
          </label>

          <label className="export-opts__check">
            <input
              type="checkbox"
              checked={config.inlineMode}
              onChange={(e) => set({ inlineMode: e.target.checked })}
            />
            {t('settings.inlineMode')}
          </label>

          <label className="export-opts__check">
            <input
              type="checkbox"
              checked={config.reopenWindowsOnStart}
              onChange={(e) => set({ reopenWindowsOnStart: e.target.checked })}
            />
            {t('settings.reopenWindows')}
          </label>

          <hr className="settings__sep" />

          <label>
            {t('settings.pdfPageSize')}
            <select
              value={config.pdfExport.pageSize}
              onChange={(e) =>
                set({
                  pdfExport: {
                    ...config.pdfExport,
                    pageSize: e.target.value as AppConfig['pdfExport']['pageSize'],
                  },
                })
              }
            >
              <option value="A4">A4</option>
              <option value="Letter">{t('settings.letter')}</option>
              <option value="Legal">{t('settings.legal')}</option>
            </select>
          </label>

          <label>
            {t('settings.pdfMargins')}
            <select
              value={config.pdfExport.margin}
              onChange={(e) =>
                set({
                  pdfExport: {
                    ...config.pdfExport,
                    margin: e.target.value as AppConfig['pdfExport']['margin'],
                  },
                })
              }
            >
              <option value="narrow">{t('settings.narrow')}</option>
              <option value="normal">{t('settings.normal')}</option>
              <option value="wide">{t('settings.wide')}</option>
            </select>
          </label>

          <hr className="settings__sep" />
          <h3>{t('git.settingsTitle')}</h3>
          <label>
            {t('git.remoteName')}
            <input
              value={config.gitRemote.name}
              onChange={(e) => set({ gitRemote: { ...config.gitRemote, name: e.target.value } })}
            />
          </label>
          <label>
            {t('git.remoteUrl')}
            <input
              type="url"
              value={config.gitRemote.url}
              placeholder="https://github.com/usuario/repositorio.git"
              onChange={(e) => set({ gitRemote: { ...config.gitRemote, url: e.target.value } })}
            />
          </label>
          <label>
            {t('git.username')}
            <input
              autoComplete="username"
              value={config.gitRemote.username}
              onChange={(e) =>
                set({ gitRemote: { ...config.gitRemote, username: e.target.value } })
              }
            />
          </label>
          <label>
            {t('git.token')}
            <input
              type="password"
              autoComplete="new-password"
              value={config.gitRemote.token}
              onChange={(e) => set({ gitRemote: { ...config.gitRemote, token: e.target.value } })}
            />
          </label>
          <p className="settings__hint">{t('git.tokenWarning')}</p>
          <button
            className="btn btn--ghost"
            onClick={onTestGitRemote}
            disabled={remoteTestState === 'testing'}
          >
            {remoteTestState === 'testing' ? t('git.testing') : t('git.testRemote')}
          </button>
          {remoteTestState === 'success' && <p role="status">{t('git.testSuccess')}</p>}
          {remoteTestState === 'error' && <p role="alert">{t('git.testFailed')}</p>}

          <hr className="settings__sep" />
          <h3>{t('lock.settingsTitle')}</h3>
          <p className="settings__hint">{t('lock.warning')}</p>
          {lockEnabled ? (
            <>
              <button className="btn btn--ghost" onClick={onLockNow}>
                {t('lock.lockNow')}
              </button>
              <button className="btn btn--ghost" onClick={onClearLock}>
                {t('lock.remove')}
              </button>
            </>
          ) : (
            <button className="btn btn--ghost" onClick={onSetLock}>
              {t('lock.enable')}
            </button>
          )}
        </div>

        <div className="dialog__actions">
          <button className="btn btn--primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
