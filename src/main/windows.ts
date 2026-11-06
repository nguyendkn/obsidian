import { BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { vaultIdFor } from './paths';
import { registerVaultRoot } from './protocol';
import type { VaultRegistry } from './vault-registry';

const PRELOADLESS_WEB_PREFERENCES = {
  contextIsolation: false,
  nodeIntegration: true,
  nodeIntegrationInWorker: true,
  sandbox: false,
  spellcheck: true,
  webviewTag: false,
  devTools: true,
} as const;

export class WindowManager {
  private vaultWindows = new Map<string, BrowserWindow>();
  private starter: BrowserWindow | null = null;

  constructor(private readonly registry: VaultRegistry) {}

  focusedOrLast(): BrowserWindow | null {
    return BrowserWindow.getFocusedWindow() ?? [...this.vaultWindows.values()].at(-1) ?? this.starter;
  }

  async openStartup(vaultPath?: string): Promise<void> {
    if (vaultPath) {
      const ok = await this.isDirectory(vaultPath);
      if (ok) {
        await this.openVault(vaultPath);
        return;
      }
    }
    const vaults = await this.registry.list();
    if (vaults.length === 1) {
      await this.openVault(vaults[0].path);
      return;
    }
    this.openStarter();
  }

  openStarter(): void {
    if (this.starter && !this.starter.isDestroyed()) {
      this.starter.focus();
      return;
    }
    this.starter = new BrowserWindow({
      width: 900,
      height: 620,
      show: false,
      titleBarStyle: 'hiddenInset',
      webPreferences: PRELOADLESS_WEB_PREFERENCES,
    });
    this.starter.loadURL('app://obsidian.md/starter.html');
    this.starter.once('ready-to-show', () => this.starter?.show());
    this.starter.on('closed', () => (this.starter = null));
    this.harden(this.starter);
  }

  async openVault(vaultPath: string): Promise<BrowserWindow> {
    const resolved = path.resolve(vaultPath);
    const id = vaultIdFor(resolved);
    const existing = this.vaultWindows.get(id);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return existing;
    }

    await this.registry.add(resolved);
    registerVaultRoot(id, resolved);
    const win = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 720,
      minHeight: 480,
      show: false,
      title: `Obsidian Arch — ${path.basename(resolved)}`,
      backgroundColor: '#1e1e1e',
      webPreferences: PRELOADLESS_WEB_PREFERENCES,
    });

    const query = new URLSearchParams({ vault: resolved, id });
    win.loadURL(`app://obsidian.md/index.html?${query.toString()}`);
    win.once('ready-to-show', () => win.show());
    win.on('closed', () => this.vaultWindows.delete(id));
    this.harden(win);

    this.vaultWindows.set(id, win);
    this.starter?.close();
    return win;
  }

  private harden(win: BrowserWindow): void {
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (!url.startsWith('app://obsidian.md/')) event.preventDefault();
    });
  }

  private async isDirectory(p: string): Promise<boolean> {
    try {
      return (await fs.stat(p)).isDirectory();
    } catch {
      return false;
    }
  }
}
