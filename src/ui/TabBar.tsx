import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import type { TabView } from '../state/useDocumentModel';

interface Props {
  tabs: TabView[];
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
  onTogglePin: (id: string) => void;
  onNewTab: () => void;
}

interface Menu {
  id: string;
  x: number;
  y: number;
}

export function TabBar({ tabs, onActivate, onClose, onMove, onTogglePin, onNewTab }: Props) {
  const { t: tr } = useTranslation();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  const menuTab = menu ? tabs.find((t) => t.id === menu.id) : null;

  return (
    <div className="tabbar" ref={barRef} role="tablist">
      <div className="tabbar__list">
        {tabs.map((t, index) => (
          <div
            key={t.id}
            role="tab"
            tabIndex={0}
            aria-selected={t.active}
            title={t.path ?? t.title}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onActivate(t.id);
              } else if (e.key === 'Delete') {
                e.preventDefault();
                onClose(t.id);
              }
            }}
            className={
              'tab' +
              (t.active ? ' tab--active' : '') +
              (t.pinned ? ' tab--pinned' : '') +
              (t.dirty ? ' tab--dirty' : '') +
              (overId === t.id && dragId && dragId !== t.id ? ' tab--dropbefore' : '')
            }
            draggable
            onDragStart={(e) => {
              setDragId(t.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setOverId(t.id);
            }}
            onDragLeave={() => setOverId((cur) => (cur === t.id ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dragId !== t.id) onMove(dragId, index);
              setDragId(null);
              setOverId(null);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onClick={() => onActivate(t.id)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose(t.id);
              }
            }}
            onDoubleClick={() => onTogglePin(t.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ id: t.id, x: e.clientX, y: e.clientY });
            }}
          >
            {t.pinned && <Icon className="tab__pin" name="keep" size={14} fill />}
            <span className="tab__label">{t.title}</span>
            <span
              className="tab__close"
              role="button"
              tabIndex={0}
              aria-label={tr('tab.closeNamed', { title: t.title })}
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose(t.id);
                }
              }}
            >
              {t.dirty ? (
                <span className="tab__dot" aria-hidden="true" />
              ) : (
                <Icon name="close" size={14} />
              )}
            </span>
          </div>
        ))}
      </div>
      <button
        className="tabbar__new"
        onClick={onNewTab}
        title={`${tr('tab.new')} (Ctrl+N)`}
        aria-label={tr('tab.new')}
      >
        <Icon name="add" size={18} />
      </button>

      {menu && menuTab && (
        <ul
          className="tab-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <li
            onClick={() => {
              onTogglePin(menuTab.id);
              setMenu(null);
            }}
          >
            {menuTab.pinned ? tr('tab.unpin') : tr('tab.pin')}
          </li>
          <li
            onClick={() => {
              onClose(menuTab.id);
              setMenu(null);
            }}
          >
            {tr('common.close')}
          </li>
          <li
            onClick={() => {
              tabs.filter((x) => x.id !== menuTab.id && !x.pinned).forEach((x) => onClose(x.id));
              setMenu(null);
            }}
          >
            {tr('tab.closeOthers')}
          </li>
        </ul>
      )}
    </div>
  );
}
