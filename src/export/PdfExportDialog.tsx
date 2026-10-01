import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { PdfExportOptions } from '../config/config';

interface Props {
  open: boolean;
  options: PdfExportOptions;
  onChange: (opts: PdfExportOptions) => void;
  onClose: () => void;
  onExport: () => void;
  busy: boolean;
}

export function PdfExportDialog({ open, options, onChange, onClose, onExport, busy }: Props) {
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
  const set = (patch: Partial<PdfExportOptions>) => onChange({ ...options, ...patch });

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-label={t('export.pdfAria')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog__title">{t('export.pdfTitle')}</h2>
        <p className="dialog__message">{t('export.printMessage')}</p>

        <div className="export-opts">
          <label>
            {t('export.size')}
            <select
              value={options.pageSize}
              onChange={(e) => set({ pageSize: e.target.value as PdfExportOptions['pageSize'] })}
            >
              <option value="A4">A4</option>
              <option value="Letter">{t('export.letter')}</option>
              <option value="Legal">{t('export.legal')}</option>
            </select>
          </label>

          <label>
            {t('export.margins')}
            <select
              value={options.margin}
              onChange={(e) => set({ margin: e.target.value as PdfExportOptions['margin'] })}
            >
              <option value="narrow">{t('export.narrow')}</option>
              <option value="normal">{t('export.normal')}</option>
              <option value="wide">{t('export.wide')}</option>
            </select>
          </label>

          <label>
            {t('export.theme')}
            <select
              value={options.theme}
              onChange={(e) => set({ theme: e.target.value as PdfExportOptions['theme'] })}
            >
              <option value="light">{t('export.light')}</option>
              <option value="dark">{t('export.dark')}</option>
              <option value="auto">{t('export.system')}</option>
            </select>
          </label>

          <label className="export-opts__check">
            <input
              type="checkbox"
              checked={options.toc}
              onChange={(e) => set({ toc: e.target.checked })}
            />
            {t('export.tocPdf')}
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

          <label className="export-opts__check">
            <input
              type="checkbox"
              checked={options.pageBreakBeforeH1}
              onChange={(e) => set({ pageBreakBeforeH1: e.target.checked })}
            />
            {t('export.pageBreak')}
          </label>
        </div>

        <div className="dialog__actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            {t('export.cancel')}
          </button>
          <button className="btn btn--primary" onClick={onExport} disabled={busy}>
            {busy ? t('export.preparing') : t('export.printPdf')}
          </button>
        </div>
      </div>
    </div>
  );
}
