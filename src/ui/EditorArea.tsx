import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Editor, type EditorApi } from '../editor/Editor';
import { Preview, type PreviewApi } from '../render/Preview';
import { ProblemsPanel } from './ProblemsPanel';
import { TabBar } from './TabBar';
import { DocHeaderPanel } from './DocHeaderPanel';
import type { DocumentModel } from '../state/useDocumentModel';
import type { AppConfig, PreviewMode, RecoveryEntry } from '../config/config';
import type { RenderMessage } from '../render/asciidoctor';
import type { NoteInfo } from '../workspace/api';
import { baseName } from '../fs/files';

interface Props {
  doc: DocumentModel;
  config: AppConfig;
  notes: NoteInfo[];
  onNavigate: (path: string, anchor: string | null) => void;
  onEditorApi: (api: EditorApi) => void;
  onCursorChange: (line: number, col: number) => void;
  onPreviewMode: (mode: PreviewMode) => void;
  gotoLine: number | null;
  onGotoConsumed: () => void;
  onOpenFile: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onRequestCloseTab: (id: string) => void;
  recovery: RecoveryEntry[];
  onRestoreRecovery: (entry: RecoveryEntry) => void;
  onDiscardRecovery: (entry: RecoveryEntry) => void;
}

export function EditorArea({
  doc,
  config,
  notes,
  onNavigate,
  onEditorApi,
  onCursorChange,
  onPreviewMode,
  gotoLine,
  onGotoConsumed,
  onOpenFile,
  onOpenFolder,
  onRequestCloseTab,
  recovery,
  onRestoreRecovery,
  onDiscardRecovery,
}: Props) {
  const { t, i18n } = useTranslation();
  const { state, actions } = doc;
  const mode = config.previewMode;

  const [messages, setMessages] = useState<RenderMessage[]>([]);
  const [rendering, setRendering] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500);
  };

  const editorApi = useRef<EditorApi | null>(null);
  const previewApi = useRef<PreviewApi | null>(null);
  const syncUntil = useRef(0);

  const baseDir = useMemo(() => {
    if (!state.path) return null;
    const cut = state.path.replace(/[\\/][^\\/]*$/, '');
    return cut === state.path ? null : cut;
  }, [state.path]);

  const showEditor = mode !== 'preview';
  const showPreview = mode !== 'editor';

  // Ir para a linha de um resultado de busca, após o arquivo carregar.
  useEffect(() => {
    if (gotoLine == null) return;
    const id = window.setTimeout(() => {
      editorApi.current?.scrollToLine(gotoLine);
      onGotoConsumed();
    }, 60);
    return () => window.clearTimeout(id);
  }, [gotoLine, doc.editorKey, onGotoConsumed]);

  const syncFromEditor = (line: number) => {
    if (Date.now() < syncUntil.current || !showPreview) return;
    syncUntil.current = Date.now() + 150;
    previewApi.current?.scrollToLine(line);
  };
  const syncFromPreview = (line: number) => {
    if (Date.now() < syncUntil.current || !showEditor) return;
    syncUntil.current = Date.now() + 150;
    editorApi.current?.scrollToLine(line);
  };

  const errorCount = messages.filter(
    (m) => m.severity === 'ERROR' || m.severity === 'FATAL',
  ).length;

  return (
    <div className="editor-area">
      {toast && <div className="editor-toast">{toast}</div>}
      <TabBar
        tabs={doc.tabs}
        onActivate={actions.activateTab}
        onClose={onRequestCloseTab}
        onMove={actions.moveTab}
        onTogglePin={actions.togglePin}
        onNewTab={actions.newFile}
      />
      {config.inlineMode && (
        <DocHeaderPanel
          content={doc.state.content}
          onApply={(endLine, text) => editorApi.current?.replaceLineRange(1, endLine, text)}
        />
      )}
      <div className="editor-toolbar">
        <div className="seg">
          {(
            [
              { id: 'editor', label: t('editor.editorMode') },
              { id: 'split', label: t('editor.splitMode') },
              { id: 'preview', label: t('editor.previewMode') },
            ] as Array<{ id: PreviewMode; label: string }>
          ).map((m) => (
            <button
              key={m.id}
              className={'seg__btn' + (mode === m.id ? ' seg__btn--on' : '')}
              onClick={() => onPreviewMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        {showPreview && rendering && (
          <span className="editor-toolbar__status">{t('editor.rendering')}</span>
        )}
        <span className="app-statusbar__spacer" />
        {messages.length > 0 && (
          <button
            className={'app-statusbar__btn' + (errorCount ? ' app-statusbar__item--error' : '')}
            onClick={() => setShowProblems((v) => !v)}
          >
            {t('editor.problems', { count: messages.length })}
          </button>
        )}
      </div>

      {recovery.length > 0 && (
        <div className="recovery-bar">
          {recovery.slice(0, 1).map((entry) => (
            <div key={entry.key} className="recovery-bar__row">
              <span>
                {t('editor.unsavedFrom', {
                  name: entry.originalPath ? baseName(entry.originalPath) : t('editor.untitled'),
                  date: new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(entry.savedAtMs),
                })}
              </span>
              <span className="recovery-bar__actions">
                <button className="btn btn--primary" onClick={() => onRestoreRecovery(entry)}>
                  {t('editor.restore')}
                </button>
                <button className="btn btn--ghost" onClick={() => onDiscardRecovery(entry)}>
                  {t('editor.discard')}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {state.loadError && <div className="editor-area__error">{state.loadError}</div>}

      <div className={'split split--' + mode}>
        {showEditor && (
          <div className="split__pane">
            <Editor
              fileKey={doc.editorKey}
              initialDoc={state.content}
              wordWrap={config.wordWrap}
              lineNumbers={config.lineNumbers}
              inlineMode={config.inlineMode}
              notePath={state.path}
              attachmentPattern={config.attachmentPattern}
              onNotify={notify}
              onOpenExternalFile={onOpenFile}
              onOpenFolder={onOpenFolder}
              notes={notes}
              onNavigate={onNavigate}
              onDocChange={actions.setContent}
              onCursorChange={onCursorChange}
              onScrollLine={syncFromEditor}
              onReady={(api) => {
                editorApi.current = api;
                onEditorApi(api);
              }}
            />
          </div>
        )}
        {showEditor && showPreview && <div className="split__divider" />}
        {showPreview && (
          <div className="split__pane">
            <Preview
              source={state.content}
              baseDir={baseDir}
              notePath={state.path}
              notes={notes}
              onMessages={setMessages}
              onRendering={setRendering}
              onScrollLine={syncFromPreview}
              onReady={(api) => (previewApi.current = api)}
            />
          </div>
        )}
      </div>

      {showProblems && messages.length > 0 && (
        <ProblemsPanel
          messages={messages}
          onClose={() => setShowProblems(false)}
          onGoToLine={(line) => {
            editorApi.current?.scrollToLine(line);
            if (mode === 'preview') onPreviewMode('split');
          }}
        />
      )}
    </div>
  );
}
