/** IPC do workspace (Fase 4). Nada de `invoke` fora desta camada. */
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
  isAdoc: boolean;
  isAge: boolean;
}

export interface OutLink {
  target: string;
  anchor: string | null;
  line: number;
  kind: 'xref' | 'link' | 'wikilink' | 'ref';
}

export interface NoteInfo {
  path: string;
  title: string;
  anchors: string[];
  outLinks: OutLink[];
}

export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

export interface GitStatus {
  initialized: boolean;
  branch: string | null;
  changed: number;
  staged: number;
  unstaged: number;
  untracked: number;
  ahead: number;
  behind: number;
}

export interface GitRemoteConfig {
  name: string;
  url: string;
  username: string;
  token: string;
}

export interface GitPreview {
  localBranch: string;
  remoteBranch: string;
  ahead: number;
  behind: number;
  localChanges: number;
  files: Array<{ path: string; change: string; source: string }>;
  remotePatch: string;
  localPatch: string;
}

export interface GitSyncResult {
  localBranch: string;
  remoteBranch: string;
  commit: string | null;
  conflicts: string[];
  preview: GitPreview | null;
}

export function readGitStatus(root: string): Promise<GitStatus> {
  return invoke<GitStatus>('git_status', { root });
}

export function testGitRemote(root: string, remote: GitRemoteConfig): Promise<void> {
  return invoke('git_remote_test', { root, ...remote });
}

export function setGitRemote(root: string, remote: GitRemoteConfig): Promise<void> {
  return invoke('git_remote_set', { root, name: remote.name, url: remote.url });
}

export function previewGitSync(root: string, remote: GitRemoteConfig): Promise<GitPreview> {
  return invoke<GitPreview>('git_preview', { root, ...remote });
}

export function syncGit(root: string, remote: GitRemoteConfig): Promise<GitSyncResult> {
  return invoke<GitSyncResult>('git_sync', { root, ...remote });
}

export interface WorkspaceSession {
  openFiles: string[];
  activeFile: string | null;
  /** Caminhos das abas fixadas (tarefa 61). */
  pinnedFiles: string[];
  sidebarWidth: number;
  expandedDirs: string[];
  showAllFiles: boolean;
}

export async function pickFolder(): Promise<string | null> {
  const picked = await openDialog({ directory: true, multiple: false });
  return typeof picked === 'string' ? picked : null;
}

export function readDir(path: string, showAll: boolean): Promise<DirEntry[]> {
  return invoke<DirEntry[]>('read_dir', { path, showAll });
}

export function createFile(path: string): Promise<string> {
  return invoke<string>('create_file', { path });
}
export function createDir(path: string): Promise<string> {
  return invoke<string>('create_dir', { path });
}
export function renamePath(from: string, to: string): Promise<string> {
  return invoke<string>('rename_path', { from, to });
}
export function deletePath(path: string): Promise<void> {
  return invoke('delete_path', { path });
}

export function scanWorkspace(root: string): Promise<NoteInfo[]> {
  return invoke<NoteInfo[]>('scan_workspace', { root });
}
export function searchWorkspace(root: string, query: string, limit = 200): Promise<SearchHit[]> {
  return invoke<SearchHit[]>('search_workspace', { root, query, limit });
}

export function watchWorkspace(root: string): Promise<void> {
  return invoke('watch_workspace', { root });
}
export function unwatchWorkspace(): Promise<void> {
  return invoke('unwatch_workspace');
}

export function readSession(root: string): Promise<WorkspaceSession> {
  return invoke<WorkspaceSession>('read_session', { root });
}
export function writeSession(root: string, session: WorkspaceSession): Promise<void> {
  return invoke('write_session', { root, session });
}

/** Nome do arquivo a partir de um caminho normalizado (barras `/`). */
export function baseName(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}
export function dirName(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i) : '';
}
