import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { baseName, type NoteInfo } from './api';

interface Props {
  open: boolean;
  notes: NoteInfo[];
  onClose: () => void;
  onOpen: (path: string) => void;
  /** modo "inserir link": seleciona uma nota e chama `onPick` em vez de abrir. */
  pickMode?: boolean;
  onPick?: (note: NoteInfo) => void;
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function score(note: NoteInfo, q: string): number | null {
  const name = fold(baseName(note.path));
  const title = fold(note.title);
  const path = fold(note.path);
  if (name.startsWith(q)) return 0;
  if (title.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (title.includes(q)) return 3;
  if (path.includes(q)) return 4;
  // subsequência no nome
  let i = 0;
  for (const ch of q) {
    i = name.indexOf(ch, i);
    if (i === -1) return null;
    i += 1;
  }
  return 20;
}

/** Ctrl+P — abrir nota por nome (tarefa 37); Ctrl+K — inserir link (tarefa 45). */
export function QuickOpen({ open, notes, onClose, onOpen, pickMode, onPick }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return notes.slice(0, 50);
    return notes
      .map((n) => ({ n, s: score(n, q) }))
      .filter((x): x is { n: NoteInfo; s: number } => x.s !== null)
      .sort((a, b) => a.s - b.s)
      .slice(0, 50)
      .map((x) => x.n);
  }, [notes, query]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  if (!open) return null;

  const run = (i: number) => {
    const note = results[i];
    if (!note) return;
    onClose();
    if (pickMode) onPick?.(note);
    else onOpen(note.path);
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label={t('quickOpen.aria')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette__input"
          placeholder={pickMode ? t('quickOpen.insertLink') : t('quickOpen.search')}
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
              run(active);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <ul className="palette__list">
          {results.length === 0 && <li className="palette__empty">{t('quickOpen.empty')}</li>}
          {results.map((n, i) => (
            <li
              key={n.path}
              className={'palette__item' + (i === active ? ' palette__item--active' : '')}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(i)}
            >
              <span className="quickopen__title">{n.title || baseName(n.path)}</span>
              <span className="quickopen__path">{n.path}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
