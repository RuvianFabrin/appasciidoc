import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { buildDocHeader, parseDocHeader, type DocAttr, type DocHeader } from '../editor/docHeader';

interface Props {
  content: string;
  /** Substitui as linhas [1..endLine] do documento pelo novo cabeçalho. */
  onApply: (endLine: number, text: string) => void;
}

type Draft = Pick<DocHeader, 'title' | 'author' | 'revision' | 'attrs'>;

/** Área de metadados do documento, recolhível, no topo do editor (tarefa 112). */
export function DocHeaderPanel({ content, onApply }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseDocHeader(content), [content]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const editing = useRef(false);

  // Sincroniza o rascunho com o documento quando a mudança veio de fora daqui.
  useEffect(() => {
    if (!parsed) {
      setDraft(null);
      return;
    }
    if (editing.current) {
      editing.current = false;
      return;
    }
    setDraft({
      title: parsed.title,
      author: parsed.author,
      revision: parsed.revision,
      attrs: parsed.attrs,
    });
  }, [parsed]);

  if (!parsed || !draft) return null;

  const commit = (next: Draft) => {
    editing.current = true;
    setDraft(next);
    onApply(parsed.endLine, buildDocHeader({ ...next, endLine: parsed.endLine }));
  };
  const setAttr = (i: number, patch: Partial<DocAttr>) => {
    const attrs = draft.attrs.slice();
    attrs[i] = { ...attrs[i], ...patch };
    commit({ ...draft, attrs });
  };

  return (
    <div className={'docheader' + (open ? ' docheader--open' : '')}>
      <button className="docheader__bar" onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? 'expand_more' : 'chevron_right'} size={18} />
        <span className="docheader__title">{draft.title || t('common.untitled')}</span>
        {!open && draft.author && <span className="docheader__hint">· {draft.author}</span>}
        {!open && draft.attrs.length > 0 && (
          <span className="docheader__hint">
            · {t('header.attributeCount', { count: draft.attrs.length })}
          </span>
        )}
      </button>

      {open && (
        <div className="docheader__body">
          <label>
            {t('header.title')}
            <input
              value={draft.title}
              onChange={(e) => commit({ ...draft, title: e.target.value })}
            />
          </label>
          <label>
            {t('header.author')}
            <input
              value={draft.author}
              placeholder={t('header.authorPlaceholder')}
              onChange={(e) => commit({ ...draft, author: e.target.value })}
            />
          </label>
          <label>
            {t('header.revision')}
            <input
              value={draft.revision}
              placeholder={t('header.revisionPlaceholder')}
              disabled={!draft.author.trim()}
              onChange={(e) => commit({ ...draft, revision: e.target.value })}
            />
          </label>

          <div className="docheader__attrs">
            <div className="docheader__attrs-head">
              {t('header.attributes')}
              <button
                className="docheader__add"
                onClick={() =>
                  commit({
                    ...draft,
                    attrs: [...draft.attrs, { name: 'novo-atributo', value: '' }],
                  })
                }
              >
                <Icon name="add" size={16} /> {t('header.addAttribute')}
              </button>
            </div>
            {draft.attrs.length === 0 && <div className="docheader__empty">{t('common.none')}</div>}
            {draft.attrs.map((a, i) => (
              <div className="docheader__attr" key={i}>
                <input
                  className="docheader__attr-name"
                  value={a.name}
                  onChange={(e) => setAttr(i, { name: e.target.value.replace(/[^\w-]/g, '') })}
                />
                <input
                  className="docheader__attr-value"
                  value={a.value}
                  onChange={(e) => setAttr(i, { value: e.target.value })}
                />
                <button
                  className="docheader__attr-del"
                  aria-label={t('header.removeAttribute')}
                  onClick={() => commit({ ...draft, attrs: draft.attrs.filter((_, j) => j !== i) })}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
