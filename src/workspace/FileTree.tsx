import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';
import type { DirEntry } from './api';

export interface TreeActions {
  onOpenFile: (path: string) => void;
  onToggle: (dir: string) => void;
  onNewNote: (parentDir: string) => void;
  onNewFolder: (parentDir: string) => void;
  onRename: (entry: DirEntry) => void;
  onDelete: (entry: DirEntry) => void;
  onAgeAction: (entry: DirEntry) => void;
}

interface Props extends TreeActions {
  root: string;
  childrenOf: Record<string, DirEntry[]>;
  expanded: Set<string>;
  activeFile: string | null;
}

interface MenuState {
  x: number;
  y: number;
  entry: DirEntry;
}

export function FileTree(props: Props) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const rootEntry: DirEntry = {
    name: props.root.split('/').pop() || props.root,
    path: props.root,
    isDir: true,
    isAdoc: false,
    isAge: false,
  };

  return (
    <div className="filetree" onClick={() => setMenu(null)}>
      <Node
        entry={rootEntry}
        depth={0}
        {...props}
        onContext={(e, entry) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, entry });
        }}
      />
      {menu && (
        <ul
          className="tree-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.entry.isDir && (
            <>
              <li
                onClick={() => {
                  props.onNewNote(menu.entry.path);
                  setMenu(null);
                }}
              >
                {t('tree.newNote')}
              </li>
              <li
                onClick={() => {
                  props.onNewFolder(menu.entry.path);
                  setMenu(null);
                }}
              >
                {t('tree.newFolder')}
              </li>
            </>
          )}
          {!menu.entry.isDir && (
            <li
              onClick={() => {
                props.onAgeAction(menu.entry);
                setMenu(null);
              }}
            >
              {menu.entry.isAge ? t('tree.decryptAge') : t('tree.encryptAge')}
            </li>
          )}
          <li
            onClick={() => {
              props.onRename(menu.entry);
              setMenu(null);
            }}
          >
            {t('tree.rename')}
          </li>
          <li
            className="tree-menu__danger"
            onClick={() => {
              props.onDelete(menu.entry);
              setMenu(null);
            }}
          >
            {t('tree.delete')}
          </li>
        </ul>
      )}
    </div>
  );
}

interface NodeProps extends Props {
  entry: DirEntry;
  depth: number;
  onContext: (e: React.MouseEvent, entry: DirEntry) => void;
}

function Node({ entry, depth, onContext, ...p }: NodeProps) {
  const { t } = useTranslation();
  const isOpen = p.expanded.has(entry.path);
  const kids = p.childrenOf[entry.path];

  return (
    <>
      <div
        className={
          'tree-row' +
          (entry.path === p.activeFile ? ' tree-row--active' : '') +
          (entry.isDir ? ' tree-row--dir' : '')
        }
        role="treeitem"
        tabIndex={0}
        aria-expanded={entry.isDir ? isOpen : undefined}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => (entry.isDir ? p.onToggle(entry.path) : p.onOpenFile(entry.path))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (entry.isDir) p.onToggle(entry.path);
            else p.onOpenFile(entry.path);
          }
        }}
        onContextMenu={(e) => onContext(e, entry)}
        title={entry.path}
      >
        <span className="tree-row__caret">
          {entry.isDir && <Icon name={isOpen ? 'arrow_drop_down' : 'arrow_right'} size={18} />}
        </span>
        {entry.isDir && (
          <Icon
            className="tree-row__ficon"
            name={isOpen ? 'folder_open' : 'folder'}
            size={16}
            fill
          />
        )}
        {!entry.isDir && (
          <Icon
            className="tree-row__ficon"
            name={entry.isAdoc || entry.isAge ? 'description' : 'draft'}
            size={16}
          />
        )}
        <span className="tree-row__name">{entry.name}</span>
      </div>
      {entry.isDir && isOpen && (
        <>
          {kids === undefined && (
            <div className="tree-loading" style={{ paddingLeft: 18 + depth * 12 }}>
              …
            </div>
          )}
          {kids?.map((child) => (
            <Node key={child.path} entry={child} depth={depth + 1} onContext={onContext} {...p} />
          ))}
          {kids && kids.length === 0 && (
            <div className="tree-empty" style={{ paddingLeft: 18 + depth * 12 }}>
              {t('common.treeEmpty')}
            </div>
          )}
        </>
      )}
    </>
  );
}
