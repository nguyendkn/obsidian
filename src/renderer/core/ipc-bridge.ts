import { IPC } from '../../shared/ipc';

const { ipcRenderer } = require('electron') as typeof import('electron');

export interface VaultInfo {
  id: string;
  path: string;
  name: string;
  ts: number;
}

/**
 * Thin wrapper over Electron IPC. The renderer runs with nodeIntegration, so
 * this is a direct ipcRenderer call rather than a contextBridge preload API.
 */
export const ipc = {
  version(): { version: string; electron: string; chrome: string; node: string; platform: string } {
    return ipcRenderer.sendSync(IPC.version);
  },
  listVaults(markId?: string): Promise<VaultInfo[]> {
    return ipcRenderer.invoke(IPC.vaultList, { markId });
  },
  openVault(path: string): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke(IPC.vaultOpen, path);
  },
  createVault(parent: string, name: string): Promise<string> {
    return ipcRenderer.invoke(IPC.vaultCreate, parent, name);
  },
  removeVault(id: string): Promise<boolean> {
    return ipcRenderer.invoke(IPC.vaultRemove, id);
  },
  pickFolder(): Promise<string | null> {
    return ipcRenderer.invoke(IPC.pickFolder);
  },
  getDocumentsPath(): Promise<string> {
    return ipcRenderer.invoke(IPC.getDocumentsPath);
  },
  openExternal(url: string): Promise<void> {
    return ipcRenderer.invoke(IPC.openUrl, url);
  },
  openPath(path: string): Promise<void> {
    return ipcRenderer.invoke(IPC.openFile, path);
  },
  fileUrl(vaultPath: string, relativePath: string): string {
    return ipcRenderer.sendSync(IPC.fileUrl, vaultPath, relativePath);
  },
  pluginScriptRoot(vaultPath: string): string {
    return ipcRenderer.sendSync(IPC.pluginScriptRoot, vaultPath);
  },
  contextMenu(items: Electron.MenuItemConstructorOptions[]): Promise<string | null> {
    return ipcRenderer.invoke(IPC.contextMenu, items);
  },
};

declare global {
  interface Window {
    obsidianIpc: typeof ipc;
  }
}

window.obsidianIpc = ipc;
