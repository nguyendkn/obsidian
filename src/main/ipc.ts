import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { IPC } from '../shared/ipc';
import { pluginScriptRoot, vaultIdFor } from './paths';
import type { VaultRegistry } from './vault-registry';
import type { WindowManager } from './windows';

interface IpcDeps {
  registry: VaultRegistry;
  windows: WindowManager;
}

const currentVaultByWebContents = new Map<number, string>();

export function registerIpc({ registry, windows }: IpcDeps): void {
  ipcMain.on(IPC.version, (event) => {
    event.returnValue = {
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      platform: process.platform,
    };
  });

  ipcMain.handle(IPC.vaultList, async (_event, payload?: { markId?: string }) => {
    if (payload?.markId) await registry.touch(payload.markId);
    return registry.list();
  });

  ipcMain.handle(IPC.vaultOpen, async (event, vaultPath: string) => {
    const win = await windows.openVault(vaultPath);
    currentVaultByWebContents.set(win.webContents.id, path.resolve(vaultPath));
    return { ok: true };
  });

  ipcMain.handle(IPC.vaultCreate, async (event, parent: string, name: string) => {
    const target = path.join(parent, name);
    await fs.mkdir(path.join(target, '.obsidian'), { recursive: true });
    await fs.writeFile(
      path.join(target, '.obsidian', 'app.json'),
      JSON.stringify({ theme: 'dark' }, null, 2),
      'utf8',
    );
    await windows.openVault(target);
    return target;
  });

  ipcMain.handle(IPC.vaultRemove, async (event, id: string) => {
    await registry.remove(id);
    return true;
  });

  ipcMain.handle(IPC.pickFolder, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.on(IPC.requestUrl, (event) => {
    event.returnValue = null;
  });

  ipcMain.handle(IPC.openUrl, async (event, url: string) => {
    if (/^https?:/i.test(url)) await shell.openExternal(url);
  });

  ipcMain.handle(IPC.openFile, async (event, filePath: string) => {
    await shell.openPath(filePath);
  });

  ipcMain.on(IPC.fileUrl, (event, vaultPath: string, filePath: string) => {
    const rel = path.relative(path.resolve(vaultPath), path.resolve(vaultPath, filePath));
    const encoded = rel.split(path.sep).map(encodeURIComponent).join('/');
    event.returnValue = `app://obsidian.md/_local/${vaultIdFor(vaultPath)}/${encoded}`;
  });

  ipcMain.on(IPC.pluginScriptRoot, (event, vaultPath: string) => {
    event.returnValue = `app://obsidian.md/_plugin/${vaultIdFor(vaultPath)}/`;
  });

  ipcMain.handle(IPC.getDocumentsPath, async () => app.getPath('documents'));
  ipcMain.handle(IPC.getDefaultVaultPath, async () => path.join(app.getPath('documents'), 'Obsidian Vault'));

  ipcMain.on(IPC.isQuitting, (event) => {
    event.returnValue = false;
  });
  ipcMain.on(IPC.isClosing, (event) => {
    event.returnValue = false;
  });

  ipcMain.handle(IPC.contextMenu, async (event, template: Electron.MenuItemConstructorOptions[]) => {
    return new Promise<string | null>((resolve) => {
      const menu = Menu.buildFromTemplate(
        template.map((item) => ({
          ...item,
          click: () => resolve(item.id ?? null),
        })),
      );
      menu.popup({ window: windowOf(event.sender) ?? undefined });
      menu.once('menu-will-close', () => setTimeout(() => resolve(null), 50));
    });
  });

  ipcMain.on(IPC.setMenu, (event, template?: Electron.MenuItemConstructorOptions[]) => {
    if (template) Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  });

  ipcMain.on(IPC.appInfo, (event) => {
    event.returnValue = {
      appId: vaultIdFor(app.getPath('userData')),
      userData: app.getPath('userData'),
      pluginScriptRoot: pluginScriptRoot(vaultIdFor(app.getPath('userData'))),
    };
  });
}

function windowOf(contents: Electron.WebContents | undefined): BrowserWindow | null {
  return contents ? BrowserWindow.fromWebContents(contents) : null;
}
