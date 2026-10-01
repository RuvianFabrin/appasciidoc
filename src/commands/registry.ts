/** Registro de comandos usado pela paleta (Ctrl+Shift+P) e pelos atalhos. */

export interface Command {
  id: string;
  title: string;
  /** Rotulo do atalho, ex. "Ctrl+S". */
  hint?: string;
  enabled?: boolean;
  run: () => void | Promise<void>;
}

export interface CommandContext {
  newFile: () => void;
  newWindow: () => void;
  closeTab: () => void;
  openViaDialog: () => Promise<void>;
  save: () => Promise<boolean>;
  saveAs: () => Promise<boolean>;
  reloadFromDisk: () => Promise<void>;
  hasPath: boolean;
  openFolder: () => Promise<void>;
  toggleWordWrap: () => void;
  toggleLineNumbers: () => void;
  togglePreview: () => void;
  toggleInlineMode: () => void;
  inlineMode: boolean;
  previewAvailable: boolean;
  navBack: () => void;
  navForward: () => void;
  insertLink: () => void;
  unresolvedLinks: () => void;
  hasWorkspace: boolean;
  exportHtml: () => void;
  exportPdf: () => void;
  exportSite: () => void;
  canExport: boolean;
  toggleReopenWindows: () => void;
  reopenWindows: boolean;
  openSettings: () => void;
  cycleTheme: () => void;
  encryptCurrent: () => void | Promise<void>;
  decryptAgeFile: () => void | Promise<void>;
  syncGit: () => void | Promise<void>;
  hasGitRemote: boolean;
}

export function buildCommands(
  ctx: CommandContext,
  t: (key: string) => string = (key) => key,
): Command[] {
  return [
    { id: 'file.new', title: t('commands.newFile'), hint: 'Ctrl+N', run: ctx.newFile },
    {
      id: 'file.newWindow',
      title: t('commands.newWindow'),
      hint: 'Ctrl+Shift+N',
      run: ctx.newWindow,
    },
    { id: 'tab.close', title: t('commands.closeTab'), hint: 'Ctrl+W', run: ctx.closeTab },
    { id: 'file.open', title: t('commands.openFile'), hint: 'Ctrl+O', run: ctx.openViaDialog },
    { id: 'workspace.open', title: t('commands.openFolder'), run: ctx.openFolder },
    { id: 'file.save', title: t('commands.save'), hint: 'Ctrl+S', run: ctx.save },
    { id: 'file.saveAs', title: t('commands.saveAs'), hint: 'Ctrl+Shift+S', run: ctx.saveAs },
    {
      id: 'file.encryptAge',
      title: t('commands.encryptAge'),
      enabled: ctx.hasPath,
      run: ctx.encryptCurrent,
    },
    { id: 'file.decryptAge', title: t('commands.decryptAge'), run: ctx.decryptAgeFile },
    {
      id: 'git.sync',
      title: t('git.syncButton'),
      enabled: ctx.hasWorkspace && ctx.hasGitRemote,
      run: ctx.syncGit,
    },
    {
      id: 'file.reload',
      title: t('commands.reload'),
      enabled: ctx.hasPath,
      run: ctx.reloadFromDisk,
    },
    {
      id: 'view.preview',
      title: t('commands.preview'),
      hint: 'Ctrl+Shift+V',
      enabled: ctx.previewAvailable,
      run: ctx.togglePreview,
    },
    {
      id: 'view.inlineMode',
      title: ctx.inlineMode ? t('commands.sourceMode') : t('commands.inlineMode'),
      hint: 'Ctrl+Shift+M',
      run: ctx.toggleInlineMode,
    },
    { id: 'view.wrap', title: t('commands.wordWrap'), run: ctx.toggleWordWrap },
    { id: 'view.lineNumbers', title: t('commands.lineNumbers'), run: ctx.toggleLineNumbers },
    { id: 'app.settings', title: t('commands.settings'), hint: 'Ctrl+,', run: ctx.openSettings },
    { id: 'view.theme', title: t('commands.theme'), run: ctx.cycleTheme },
    {
      id: 'app.reopenWindows',
      title: ctx.reopenWindows ? t('commands.reopenOn') : t('commands.reopenOff'),
      run: ctx.toggleReopenWindows,
    },
    { id: 'nav.back', title: t('commands.back'), hint: 'Alt+←', run: ctx.navBack },
    { id: 'nav.forward', title: t('commands.forward'), hint: 'Alt+→', run: ctx.navForward },
    {
      id: 'link.insert',
      title: t('commands.insertLink'),
      hint: 'Ctrl+K',
      enabled: ctx.hasWorkspace,
      run: ctx.insertLink,
    },
    {
      id: 'link.unresolved',
      title: t('commands.brokenLinks'),
      enabled: ctx.hasWorkspace,
      run: ctx.unresolvedLinks,
    },
    {
      id: 'export.html',
      title: t('commands.exportHtml'),
      enabled: ctx.canExport,
      run: ctx.exportHtml,
    },
    {
      id: 'export.pdf',
      title: t('commands.exportPdf'),
      enabled: ctx.canExport,
      run: ctx.exportPdf,
    },
    {
      id: 'export.site',
      title: t('commands.exportSite'),
      enabled: ctx.hasWorkspace,
      run: ctx.exportSite,
    },
  ];
}

/** Minúsculas + sem acentos, para busca tolerante. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Filtro simples por subsequência, com ranqueamento básico. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = fold(query.trim());
  if (!q) return commands;
  const scored: Array<{ cmd: Command; score: number }> = [];
  for (const cmd of commands) {
    const title = fold(cmd.title);
    const idx = title.indexOf(q);
    if (idx >= 0) {
      scored.push({ cmd, score: idx === 0 ? 0 : 1 + idx });
      continue;
    }
    // subsequência (todas as letras na ordem)
    let pos = 0;
    for (const ch of q) {
      pos = title.indexOf(ch, pos);
      if (pos === -1) break;
      pos += 1;
    }
    if (pos !== -1) scored.push({ cmd, score: 100 });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.cmd);
}
