import type { RenderMessage, Severity } from '../render/asciidoctor';
import { useTranslation } from 'react-i18next';

interface Props {
  messages: RenderMessage[];
  onGoToLine: (line: number) => void;
  onClose: () => void;
}

const ORDER: Record<Severity, number> = { FATAL: 0, ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };
export function ProblemsPanel({ messages, onGoToLine, onClose }: Props) {
  const { t } = useTranslation();
  const sorted = [...messages].sort(
    (a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9) || (a.line ?? 0) - (b.line ?? 0),
  );
  const errors = messages.filter((m) => m.severity === 'ERROR' || m.severity === 'FATAL').length;
  const warns = messages.filter((m) => m.severity === 'WARN').length;

  return (
    <div className="problems">
      <div className="problems__head">
        <strong>{t('problems.title')}</strong>
        <span className="problems__counts">
          {errors > 0 && (
            <span className="sev sev--error">{t('problems.errors', { count: errors })}</span>
          )}
          {warns > 0 && (
            <span className="sev sev--warn">{t('problems.warnings', { count: warns })}</span>
          )}
          {errors === 0 && warns === 0 && (
            <span className="problems__ok">{t('problems.none')}</span>
          )}
        </span>
        <span className="app-statusbar__spacer" />
        <button className="app-statusbar__btn" onClick={onClose}>
          {t('problems.close')}
        </button>
      </div>
      <ul className="problems__list">
        {sorted.map((m, i) => (
          <li
            key={i}
            className={'problems__row' + (m.line ? ' problems__row--clickable' : '')}
            onClick={() => m.line && onGoToLine(m.line)}
          >
            <span className={'sev sev--' + m.severity.toLowerCase()}>
              {t(`problems.${m.severity.toLowerCase()}`, { defaultValue: m.severity })}
            </span>
            <span className="problems__loc">
              {m.line ? t('problems.line', { line: m.line }) : '—'}
            </span>
            <span className="problems__text">{m.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
