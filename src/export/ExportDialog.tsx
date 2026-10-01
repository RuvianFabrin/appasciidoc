import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { HtmlExportOptions } from './html';

interface Props {
  open: boolean;
  options: HtmlExportOptions;
  onChange: (opts: HtmlExportOptions) => void;
  onClose: () => void;
  onExport: () => void;
  busy: boolean;
}

export function ExportDialog({ open, options, onChange, onClose, onExport, busy }: Props) {
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
  const set = (patch: Partial<HtmlExportOptions>) => onChange({ ...options, ...patch });

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-label={t('export.htmlAria')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog__title">{t('export.htmlTitle')}</h2>

        <div className="export-opts">
          <label>
            {t('export.theme')}
            <select
              value={options.theme}
              onChange={(e) => set({ theme: e.target.value as HtmlExportOptions['theme'] })}
            >
              <option value="light">{t('export.light')}</option>
              <option value="dark">{t('export.dark')}</option>
              <option value="auto">{t('export.system')}</option>
            </select>
          </label>

          <label className="export-opts__check">
            <input
              type="checkbox"
              checked={options.embedImages}
              onChange={(e) => set({ embedImages: e.target.checked })}
            />
            {t('export.embedImages')}
          </label>

          <label className="export-opts__check">
            <input
              type="checkbox"
              checked={options.toc}
              onChange={(e) => set({ toc: e.target.checked })}
            />
            {t('export.toc')}
          </label>

          <label>
            {t('export.tocLevels')}
            <input
              type="number"
              min={1}
              max={5}
              value={options.tocLevels}
              disabled={!options.toc}
              onChange={(e) => set({ tocLevels: Math.min(5, Math.max(1, Number(e.target.value))) })}
            />
          </label>

          <label className="export-opts__check">
            <input
              type="checkbox"
              checked={options.sectnums}
              onChange={(e) => set({ sectnums: e.target.checked })}
            />
            {t('export.sectionNumbers')}
          </label>
        </div>

        <div className="dialog__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {t('export.cancel')}
          </button>
          <button className="btn btn--primary" onClick={onExport} disabled={busy}>
            {busy ? t('export.exporting') : t('export.export')}
          </button>
        </div>
      </div>
    </div>
  );
}
