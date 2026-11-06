import { FileSystemAdapter } from './adapter';
import { Vault, TFile } from './vault';
import { ConfigManager } from './config';
import { CommandManager } from './commands';
import { Workspace } from '../workspace/workspace';
import { ViewRegistry } from '../views/view';
import { MetadataCache } from '../metadata/cache';
import { PluginManager } from '../plugins/manager';
import { CustomCss } from '../css/custom-css';
import { FileManager } from './file-manager';
import { Settings } from '../settings/settings';
import { Notice } from '../ui/notice';

export class App {
  adapter: FileSystemAdapter;
  vault: Vault;
  config: ConfigManager;
  commands: CommandManager;
  workspace: Workspace;
  viewRegistry = new ViewRegistry();
  metadataCache: MetadataCache;
  plugins: PluginManager;
  customCss: CustomCss;
  fileManager: FileManager;
  setting: Settings;

  constructor(adapter: FileSystemAdapter) {
    this.adapter = adapter;
    this.vault = new Vault(adapter);
    this.config = new ConfigManager(adapter);
    this.commands = new CommandManager(this);
    this.workspace = new Workspace(this);
    this.metadataCache = new MetadataCache(this);
    this.plugins = new PluginManager(this);
    this.customCss = new CustomCss(this);
    this.fileManager = new FileManager(this);
    this.setting = new Settings(this);
  }

  async initialize(): Promise<void> {
    await this.vault.load();
    await this.config.load();
    this.applyTheme();
    await this.customCss.load();

    this.vault.on('create', (file) => {
      if (file instanceof TFile && file.extension === 'md') this.metadataCache.enqueueFile(file);
    });
    this.vault.on('modify', (file) => {
      if (file instanceof TFile && file.extension === 'md') this.metadataCache.enqueueFile(file);
    });
    this.vault.on('delete', (file) => {
      if (file instanceof TFile) this.customCss.onVaultChange(file.path);
    });

    await this.metadataCache.initialize();
    await this.workspace.initialize();
    await this.plugins.initialize();
    this.vault.startWatcher();
    this.commands.initialize();
  }

  applyTheme(): void {
    const theme = this.config.getConfig().theme;
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : theme;
    document.body.dataset.theme = resolved;
  }

  notice(message: string): void {
    new Notice(message);
  }

  /** Absolute file: URL served through the app://_local/ protocol route. */
  resourceUrl(path: string): string {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    return `app://obsidian.md/_local/${this.vaultId}/${encoded}`;
  }

  get vaultId(): string {
    const query = new URLSearchParams(location.search);
    return query.get('id') ?? '';
  }

  get vaultPath(): string {
    return new URLSearchParams(location.search).get('vault') ?? '';
  }
}
