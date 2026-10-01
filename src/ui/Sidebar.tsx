import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileTree } from '../workspace/FileTree';
import { PromptDialog } from './PromptDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { LocalGraph } from './LocalGraph';
import {
  baseName,
  dirName,
  searchWorkspace,
  type DirEntry,
  type SearchHit,
} from '../workspace/api';
import { backlinksFor } from '../workspace/links';
import type { WorkspaceModel } from '../workspace/useWorkspace';

interface Props {
  workspace: WorkspaceModel;
  activeFile: string | null;
  onOpenFile: (path: string) => void;
  onOpenHit: (path: string, line: number) => void;
  onAgeAction: (entry: DirEntry) => void;
}

type Prompt = { kind: 'newNote' | 'newFolder' | 'rename'; entry: DirEntry } | null;

export function Sidebar({ workspace, activeFile, onOpenFile, onOpenHit, onAgeAction }: Props) {
  const { t } = useTranslation();
  const { root, childrenOf, expanded, showAll, actions } = workspace;
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [toDelete, setToDelete] = useState<DirEntry | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [backlinksOpen, setBacklinksOpen] = useState(true);
  const [graphOpen, setGraphOpen] = useState(false);
  const searchTimer = useRef<number | undefined>(undefined);

  const backlinks = useMemo(
    () => backlinksFor(workspace.notes, activeFile),
    [workspace.notes, activeFile],
  );

  const runSearch = useCallback(
    (q: string) => {
      setQuery(q);
      window.clearTimeout(searchTimer.current);
      if (!root || q.trim().length < 2) {
        setHits(null);
        return;
      }
      searchTimer.current = window.setTimeout(() => {
        void searchWorkspace(root, q.trim())
          .then(setHits)
          .catch(() => setHits([]));
      }, 200);
    },
    [root],
  );

  const resolvePrompt = async (value: string | null) => {
    const p = prompt;
    setPrompt(null);
    if (!p || !value) return;
    if (p.kind === 'newNote') await actions.newNote(p.entry.path, value);
    else if (p.kind === 'newFolder') await actions.newFolder(p.entry.path, value);
    else if (p.kind === 'rename')
      await actions.rename(p.entry.path, `${dirName(p.entry.path)}/${value}`);
  };

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__header">
        <span>{t('sidebar.notes')}</span>
        <span className="app-sidebar__tools">
          <button title={t('sidebar.openFolder')} onClick={() => void actions.openFolder()}>
            <Icon name="folder_open" />
          </button>
          {root && (
            <>
              <button
                title={t('sidebar.newRootNote')}
                onClick={() =>
                  setPrompt({
                    kind: 'newNote',
                    entry: { name: '', path: root, isDir: true, isAdoc: false, isAge: false },
                  })
                }
              >
                <Icon name="note_add" />
              </button>
              <button title={t('sidebar.collapseAll')} onClick={actions.collapseAll}>
                <Icon name="unfold_less" />
              </button>
              <button
                title={showAll ? t('sidebar.onlyAdoc') : t('sidebar.allFiles')}
                className={showAll ? 'is-on' : ''}
                onClick={actions.toggleShowAll}
              >
                <Icon name="filter_alt" fill={showAll} />
              </button>
              <button title={t('sidebar.reload')} onClick={() => void actions.refresh()}>
                <Icon name="refresh" />
              </button>
            </>
          )}
        </span>
      </div>

      {!root ? (
        <div className="app-sidebar__placeholder">
          {t('sidebar.empty')}
          <br />
          <button className="btn btn--primary" onClick={() => void actions.openFolder()}>
            {t('sidebar.openFolder')}
          </button>
        </div>
      ) : (
        <>
          <div className="sidebar-search">
            <input
              placeholder={t('sidebar.search')}
              value={query}
              onChange={(e) => runSearch(e.target.value)}
            />
          </div>

          {hits ? (
            <div className="search-results">
              <div className="search-results__head">
                {t('sidebar.results', { count: hits.length })}
                <button onClick={() => runSearch('')}>{t('sidebar.clear')}</button>
              </div>
              <ul>
                {hits.map((h, i) => (
                  <li key={i} onClick={() => onOpenHit(h.path, h.line)}>
                    <span className="search-results__file">
                      {baseName(h.path)}:{h.line}
                    </span>
                    <span className="search-results__snippet">{h.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <FileTree
              root={root}
              childrenOf={childrenOf}
              expanded={expanded}
              activeFile={activeFile}
              onOpenFile={onOpenFile}
              onToggle={actions.toggleDir}
              onNewNote={(dir) =>
                setPrompt({
                  kind: 'newNote',
                  entry: { name: '', path: dir, isDir: true, isAdoc: false, isAge: false },
                })
              }
              onNewFolder={(dir) =>
                setPrompt({
                  kind: 'newFolder',
                  entry: { name: '', path: dir, isDir: true, isAdoc: false, isAge: false },
                })
              }
              onRename={(entry) => setPrompt({ kind: 'rename', entry })}
              onDelete={(entry) => setToDelete(entry)}
              onAgeAction={onAgeAction}
            />
          )}

          {activeFile && (
            <div className="backlinks">
              <button className="backlinks__head" onClick={() => setBacklinksOpen((v) => !v)}>
                <Icon name={backlinksOpen ? 'arrow_drop_down' : 'arrow_right'} size={18} />
                {t('sidebar.backlinks', { count: backlinks.length })}
              </button>
              {backlinksOpen && (
                <ul>
                  {backlinks.length === 0 && (
                    <li className="backlinks__empty">{t('common.none')}</li>
                  )}
                  {backlinks.map((b, i) => (
                    <li key={i} onClick={() => onOpenHit(b.fromPath, b.line)} title={b.fromPath}>
                      {b.fromTitle}
                      <span className="backlinks__line">:{b.line}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeFile && (
            <div className="backlinks">
              <button className="backlinks__head" onClick={() => setGraphOpen((v) => !v)}>
                <Icon name={graphOpen ? 'arrow_drop_down' : 'arrow_right'} size={18} />
                {t('sidebar.graph')}
              </button>
              {graphOpen && (
                <LocalGraph notes={workspace.notes} activeFile={activeFile} onOpen={onOpenFile} />
              )}
            </div>
          )}
        </>
      )}

      <PromptDialog
        open={!!prompt}
        title={
          prompt?.kind === 'rename'
            ? t('tree.rename')
            : prompt?.kind === 'newFolder'
              ? t('tree.newFolder')
              : t('tree.newNote')
        }
        initialValue={prompt?.kind === 'rename' ? baseName(prompt.entry.path) : ''}
        placeholder={prompt?.kind === 'newNote' ? t('tree.nameNote') : t('tree.name')}
        confirmLabel={prompt?.kind === 'rename' ? t('tree.rename') : t('common.create')}
        onResolve={(v) => void resolvePrompt(v)}
      />

      <ConfirmDialog
        open={!!toDelete}
        title={t('tree.delete')}
        message={t('tree.deleteMessage', {
          name: toDelete?.name ?? '',
          contents: toDelete?.isDir ? t('tree.deleteContents') : '',
        })}
        buttons={[
          { label: t('tree.delete'), value: 'yes', variant: 'danger' },
          { label: t('common.cancel'), value: 'no', variant: 'ghost' },
        ]}
        onResolve={(v) => {
          const t = toDelete;
          setToDelete(null);
          if (v === 'yes' && t) void actions.remove(t.path);
        }}
      />
    </aside>
  );
}
