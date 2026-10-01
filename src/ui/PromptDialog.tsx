import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  inputType?: 'text' | 'password';
  onResolve: (value: string | null) => void;
}

/** Modal simples de entrada de texto (renomear, nova nota, …). */
export function PromptDialog({
  open,
  title,
  initialValue = '',
  placeholder,
  confirmLabel,
  inputType = 'text',
  onResolve,
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open, initialValue]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={() => onResolve(null)}>
      <div
        className="dialog"
        role="dialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="dialog__title">{title}</h2>
        <input
          ref={inputRef}
          className="dialog__input"
          type={inputType}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) onResolve(value.trim());
            else if (e.key === 'Escape') onResolve(null);
          }}
        />
        <div className="dialog__actions">
          <button className="btn btn--ghost" onClick={() => onResolve(null)}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn--primary"
            disabled={!value.trim()}
            onClick={() => value.trim() && onResolve(value.trim())}
          >
            {confirmLabel ?? t('common.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}
