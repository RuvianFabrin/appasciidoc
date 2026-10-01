import { useEffect } from 'react';

export interface DialogButton {
  label: string;
  value: string;
  variant?: 'primary' | 'danger' | 'ghost';
}

interface Props {
  open: boolean;
  title: string;
  message: string;
  buttons: DialogButton[];
  onResolve: (value: string) => void;
}

/** Modal de confirmação de 2–3 opções (o plugin de diálogo só faz sim/não). */
export function ConfirmDialog({ open, title, message, buttons, onResolve }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const cancel = buttons.find((b) => b.variant === 'ghost') ?? buttons[buttons.length - 1];
        if (cancel) onResolve(cancel.value);
      }
    }
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [open, buttons, onResolve]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="alertdialog" aria-label={title}>
        <h2 className="dialog__title">{title}</h2>
        <p className="dialog__message">{message}</p>
        <div className="dialog__actions">
          {buttons.map((b) => (
            <button
              key={b.value}
              className={'btn btn--' + (b.variant ?? 'primary')}
              onClick={() => onResolve(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
