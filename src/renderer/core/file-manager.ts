import type { App } from './app';
import { TFile, TFolder } from './vault';
import type { TAbstractFile } from './vault';
import { promptText, confirmText } from '../ui/modal';

/** Filesystem operations that also keep references consistent. */
export class FileManager {
  constructor(private readonly app: App) {}

  async createMarkdownFile(folder?: TFolder, name = 'Untitled'): Promise<TFile | null> {
    const dir = folder?.path ?? this.defaultFolder();
    const path = await this.uniquePath(dir ? `${dir}/${name}.md` : `${name}.md`);
    const file = await this.app.vault.create(path, '');
    await this.app.workspace.openFile(file);
    return file;
  }

  async createFolderInteractive(parent?: TFolder): Promise<TFolder | null> {
    const name = await promptText(this.app, 'New folder', 'Untitled folder');
    if (!name) return null;
    const dir = parent?.path ?? '';
    return this.app.vault.createFolder(dir ? `${dir}/${name}` : name);
  }

  async renameFile(file: TAbstractFile): Promise<void> {
    const next = await promptText(this.app, `Rename ${file instanceof TFile ? 'note' : 'folder'}`, file.name);
    if (!next || next === file.name) return;
    const parentDir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
    const nextPath = parentDir ? `${parentDir}/${next}` : next;
    if (this.app.vault.getAbstractFileByPath(nextPath)) {
      this.app.notice(`"${nextPath}" already exists`);
      return;
    }
    const oldPath = file.path;
    const oldBasename = file instanceof TFile ? file.basename : file.name;
    await this.app.vault.rename(file, nextPath);
    if (file instanceof TFile) {
      await this.updateReferences(oldPath, oldBasename, file.basename);
      this.app.metadataCache.enqueueFile(file);
    }
  }

  async deleteFile(file: TAbstractFile): Promise<void> {
    const ok = await confirmText(this.app, 'Delete', `Delete "${file.path}"? This cannot be undone.`);
    if (!ok) return;
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf?.view instanceof Object && 'file' in activeLeaf.view) {
      const openFile = (activeLeaf.view as { file: TFile | null }).file;
      if (openFile && (openFile.path === file.path || openFile.path.startsWith(file.path + '/'))) {
        await this.app.workspace.closeLeaf(activeLeaf);
      }
    }
    await this.app.vault.delete(file);
  }

  async createFromTemplate(): Promise<void> {
    await this.createMarkdownFile();
  }

  /** Rewrites `[[old]]` references to the new basename after a rename. */
  private async updateReferences(oldPath: string, oldBasename: string, newBasename: string): Promise<void> {
    const targets = this.app.metadataCache.getBacklinks(oldPath);
    for (const { source } of targets) {
      const file = this.app.vault.getFileByPath(source);
      if (!file) continue;
      const text = await this.app.vault.read(file);
      const pattern = new RegExp(`\\[\\[${escapeRegExp(oldBasename)}(\\|[^\\]]*)?\\]\\]`, 'g');
      const updated = text.replace(pattern, (match, alias: string | undefined) => `[[${newBasename}${alias ?? ''}]]`);
      if (updated !== text) await this.app.vault.modify(file, updated);
    }
  }

  private defaultFolder(): string {
    return this.app.config.getConfig().attachFolder;
  }

  private async uniquePath(path: string): Promise<string> {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const dot = path.lastIndexOf('.');
    const base = path.slice(0, dot);
    const ext = path.slice(dot);
    let i = 1;
    while (this.app.vault.getAbstractFileByPath(`${base} ${i}${ext}`)) i++;
    return `${base} ${i}${ext}`;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
