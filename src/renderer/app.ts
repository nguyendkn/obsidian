import { installGlobals } from './core/dom';
import './core/ipc-bridge';
import { App } from './core/app';
import { FileSystemAdapter } from './core/adapter';
import { MarkdownView } from './views/markdown-view';
import { FileExplorerView } from './views/file-explorer';
import { BacklinksView } from './views/backlinks';
import { GraphView } from './views/graph';
import { CommandPalette } from './ui/command-palette';
import { QuickSwitcher } from './ui/quick-switcher';
import { TFile } from './core/vault';

installGlobals();

const isMac = navigator.platform.toLowerCase().includes('mac');
const MOD = isMac ? 'Mod' : 'Ctrl';

function registerViews(app: App): void {
  app.viewRegistry.register('markdown', (leaf) => new MarkdownView(leaf));
  app.viewRegistry.register('file-explorer', (leaf) => new FileExplorerView(leaf));
  app.viewRegistry.register('backlinks', (leaf) => new BacklinksView(leaf));
  app.viewRegistry.register('graph', (leaf) => new GraphView(leaf));
}

function registerCommands(app: App): void {
  app.commands.addCommand({
    id: 'app:open-command-palette',
    name: 'Open command palette',
    hotkeys: [{ modifiers: [MOD], key: 'p' }],
    callback: () => new CommandPalette(app).open(),
  });

  app.commands.addCommand({
    id: 'app:quick-switch',
    name: 'Quick switch: open or create a note',
    hotkeys: [{ modifiers: [MOD], key: 'o' }],
    callback: () => new QuickSwitcher(app).open(),
  });

  app.commands.addCommand({
    id: 'app:open-settings',
    name: 'Open settings',
    hotkeys: [{ modifiers: [MOD], key: ',' }],
    callback: () => app.setting.open(),
  });

  app.commands.addCommand({
    id: 'app:new-note',
    name: 'New note',
    hotkeys: [{ modifiers: [MOD], key: 'n' }],
    callback: () => void app.fileManager.createMarkdownFile(),
  });

  app.commands.addCommand({
    id: 'app:open-graph',
    name: 'Open graph view',
    hotkeys: [{ modifiers: [MOD], key: 'g' }],
    callback: () => void app.workspace.openViewState({ type: 'graph' }),
  });

  app.commands.addCommand({
    id: 'app:toggle-theme',
    name: 'Toggle light/dark theme',
    callback: () => {
      const current = document.body.dataset.theme === 'light' ? 'dark' : 'light';
      app.config.setConfig('theme', current);
      app.applyTheme();
    },
  });

  app.commands.addCommand({
    id: 'editor:toggle-mode',
    name: 'Toggle reading / editing',
    callback: () => {
      const view = app.workspace.activeLeaf?.view as MarkdownView | null;
      if (!(view instanceof MarkdownView)) return;
      const mode = view.getState().mode === 'source' ? 'preview' : 'source';
      view.setState({ file: view.file?.path, mode });
    },
  });
}

function applyAppearance(app: App): void {
  const appearance = app.config.getAppearance();
  if (appearance.accentColor) document.body.style.setProperty('--accent', appearance.accentColor);
  if (appearance.baseFontSize) document.documentElement.style.fontSize = `${appearance.baseFontSize}px`;
}

function openInitialFile(app: App): void {
  if (app.workspace.leaves.length) return;
  const files = app.vault.getMarkdownFiles();
  if (!files.length) return;
  const recent = [...files].sort((a, b) => b.stat.mtime - a.stat.mtime)[0];
  if (recent instanceof TFile) void app.workspace.openFile(recent);
}

async function bootstrap(): Promise<void> {
  const vaultPath = new URLSearchParams(location.search).get('vault');
  if (!vaultPath) {
    document.body.textContent = 'Missing ?vault= parameter. Open a vault from the starter window.';
    document.getElementById('boot-splash')?.remove();
    return;
  }

  const app = new App(new FileSystemAdapter(vaultPath));
  registerViews(app);
  registerCommands(app);
  document.body.append(app.workspace.containerEl);

  try {
    await app.initialize();
    applyAppearance(app);
    applyFontDefaults(app);
    openInitialFile(app);
    document.title = `Obsidian Arch — ${app.vault.getName()}`;
    (window as unknown as { app: App }).app = app;
  } catch (err) {
    console.error('[boot] failed to initialize', err);
    app.notice(`Failed to load vault: ${(err as Error).message}`);
  } finally {
    document.getElementById('boot-splash')?.remove();
  }

  window.addEventListener('beforeunload', () => {
    void app.config.saveNow();
    void app.workspace.saveLayout();
  });
}

function applyFontDefaults(app: App): void {
  const editor = app.config.getConfig().editor;
  document.documentElement.style.setProperty('--line-width', `${editor.lineWidth}px`);
  document.documentElement.style.fontSize = `${app.config.getAppearance().baseFontSize}px`;
}

void bootstrap();
