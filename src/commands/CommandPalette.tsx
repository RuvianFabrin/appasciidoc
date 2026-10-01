import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildCommands, filterCommands, type CommandContext } from './registry';

interface Props {
  open: boolean;
  onClose: () => void;
  context: CommandContext;
}

export function CommandPalette({ open, onClose, context }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const commands = useMemo(() => buildCommands(context, (key) => t(key)), [context, t]);
  const results = useMemo(
    () => filterCommands(commands, query).filter((c) => c.enabled !== false),
    [commands, query],
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  if (!open) return null;

  const runAt = (i: number) => {
    const cmd = results[i];
    if (!cmd) return;
    onClose();
    void cmd.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label={t('commands.aria')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette__input"
          placeholder={t('commands.placeholder')}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              runAt(active);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <ul className="palette__list">
          {results.length === 0 && <li className="palette__empty">{t('commands.empty')}</li>}
          {results.map((cmd, i) => (
            <li
              key={cmd.id}
              className={'palette__item' + (i === active ? ' palette__item--active' : '')}
              onMouseEnter={() => setActive(i)}
              onClick={() => runAt(i)}
            >
              <span>{cmd.title}</span>
              {cmd.hint && <kbd className="palette__hint">{cmd.hint}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
