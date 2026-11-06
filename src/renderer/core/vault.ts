import { Events } from './events';
import type { FileSystemAdapter } from './adapter';

export class TAbstractFile {
  path: string;
  name: string;
  parent: TFolder | null;
  vault: Vault;

  constructor(vault: Vault, path: string, parent: TFolder | null) {
    this.vault = vault;
    this.path = path;
    this.parent = parent;
    this.name = path.split('/').pop() ?? path;
  }
}

export class TFile extends TAbstractFile {
  extension: string;
  basename: string;
  stat: { ctime: number; mtime: number; size: number };

  constructor(vault: Vault, path: string, parent: TFolder | null, stat = { ctime: 0, mtime: 0, size: 0 }) {
    super(vault, path, parent);
    const dot = this.name.lastIndexOf('.');
    this.extension = dot > 0 ? this.name.slice(dot + 1) : '';
    this.basename = dot > 0 ? this.name.slice(0, dot) : this.name;
    this.stat = stat;
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  isRoot(): boolean {
    return this.path === '';
  }
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.trash']);
const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt', 'json', 'css', 'js', 'ts', 'canvas']);
const MAX_CACHE_BYTES = 24 * 1024 * 1024;

export class Vault extends Events {
  adapter: FileSystemAdapter;
  root: TFolder;
  configDir = '.obsidian';
  fileMap = new Map<string, TAbstractFile>();
  private textCache = new Map<string, { mtime: number; text: string }>();
  private cacheBytes = 0;
  private unwatch: (() => void) | null = null;

  constructor(adapter: FileSystemAdapter) {
    super();
    this.adapter = adapter;
    this.root = new TFolder(this, '', null);
  }

  getName(): string {
    return this.adapter.basePath.split(/[/\\]/).filter(Boolean).pop() ?? '';
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    return path === '' ? this.root : (this.fileMap.get(path) ?? null);
  }

  getFileByPath(path: string): TFile | null {
    const file = this.fileMap.get(path);
    return file instanceof TFile ? file : null;
  }

  getFolderByPath(path: string): TFolder | null {
    const file = this.getAbstractFileByPath(path);
    return file instanceof TFolder ? file : null;
  }

  getMarkdownFiles(): TFile[] {
    return [...this.fileMap.values()].filter(
      (f): f is TFile => f instanceof TFile && (f.extension === 'md' || f.extension === 'markdown'),
    );
  }

  getFiles(): TFile[] {
    return [...this.fileMap.values()].filter((f): f is TFile => f instanceof TFile);
  }

  async load(): Promise<void> {
    this.fileMap.clear();
    this.root.children = [];
    await this.scan();
    this.trigger('load');
  }

  async scan(folder: TFolder = this.root): Promise<void> {
    let children;
    try {
      children = await this.adapter.list(folder.path);
    } catch {
      return;
    }
    for (const child of children) {
      if (child.type === 'folder' && (SKIP_DIRS.has(child.name) || child.name.startsWith('.'))) continue;
      if (child.type === 'folder') {
        const sub = new TFolder(this, child.path, folder);
        folder.children.push(sub);
        this.fileMap.set(sub.path, sub);
        await this.scan(sub);
      } else {
        const stat = await this.adapter.stat(child.path);
        const file = new TFile(this, child.path, folder, {
          ctime: stat?.ctime ?? 0,
          mtime: stat?.mtime ?? Date.now(),
          size: stat?.size ?? 0,
        });
        folder.children.push(file);
        this.fileMap.set(file.path, file);
      }
    }
  }

  async create(path: string, data = ''): Promise<TFile> {
    const existing = this.getFileByPath(path);
    if (existing) return existing;
    await this.adapter.write(path, data);
    return this.attachFile(path);
  }

  async createFolder(path: string): Promise<TFolder> {
    const existing = this.getFolderByPath(path);
    if (existing) return existing;
    await this.adapter.mkdir(path);
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const parent = this.getFolderByPath(parentPath) ?? this.root;
    const folder = new TFolder(this, path, parent);
    parent.children.push(folder);
    this.fileMap.set(path, folder);
    this.trigger('create', folder);
    return folder;
  }

  async read(file: TFile): Promise<string> {
    return this.adapter.read(file.path);
  }

  async cachedRead(file: TFile): Promise<string> {
    const cached = this.textCache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime) return cached.text;
    const text = await this.adapter.read(file.path);
    this.cacheText(file.path, text, file.stat.mtime);
    return text;
  }

  async modify(file: TFile, data: string): Promise<void> {
    await this.adapter.write(file.path, data);
    const stat = await this.adapter.stat(file.path);
    file.stat = { ...file.stat, mtime: stat?.mtime ?? Date.now(), size: data.length };
    this.cacheText(file.path, data, file.stat.mtime);
    this.trigger('modify', file);
  }

  async append(file: TFile, data: string): Promise<void> {
    const current = await this.cachedRead(file);
    await this.modify(file, current + data);
  }

  async delete(file: TAbstractFile): Promise<void> {
    await this.adapter.remove(file.path);
    if (file instanceof TFolder) {
      for (const child of [...this.fileMap.keys()]) {
        if (child === file.path || child.startsWith(file.path + '/')) this.fileMap.delete(child);
      }
    }
    this.fileMap.delete(file.path);
    if (file.parent) {
      const idx = file.parent.children.indexOf(file);
      if (idx >= 0) file.parent.children.splice(idx, 1);
    }
    this.textCache.delete(file.path);
    this.trigger('delete', file);
  }

  async rename(file: TAbstractFile, nextPath: string): Promise<void> {
    const oldPath = file.path;
    await this.adapter.rename(oldPath, nextPath);
    const prefix = oldPath + '/';
    const updates: Array<[string, TAbstractFile]> = [];
    for (const [key, value] of this.fileMap) {
      if (key === oldPath || key.startsWith(prefix)) {
        updates.push([key, value]);
        this.fileMap.delete(key);
      }
    }
    for (const [key, value] of updates) {
      value.path = nextPath + key.slice(oldPath.length);
      value.name = value.path.split('/').pop() ?? value.path;
      if (value instanceof TFile) {
        const dot = value.name.lastIndexOf('.');
        value.extension = dot > 0 ? value.name.slice(dot + 1) : '';
        value.basename = dot > 0 ? value.name.slice(0, dot) : value.name;
      }
      this.fileMap.set(value.path, value);
    }
    this.trigger('rename', file, oldPath);
  }

  startWatcher(): void {
    this.unwatch?.();
    this.unwatch = this.adapter.watch((relPath) => void this.onExternalChange(relPath));
  }

  private async onExternalChange(relPath: string): Promise<void> {
    if (relPath.split('/').some((segment) => segment.startsWith('.'))) {
      this.trigger('config-changed', relPath);
      return;
    }
    const existing = this.getAbstractFileByPath(relPath);
    const stat = await this.adapter.stat(relPath);
    if (!stat) {
      if (existing) {
        this.fileMap.delete(relPath);
        if (existing.parent) {
          const idx = existing.parent.children.indexOf(existing);
          if (idx >= 0) existing.parent.children.splice(idx, 1);
        }
        this.textCache.delete(relPath);
        this.trigger('delete', existing);
      }
      return;
    }
    if (stat.type === 'folder') {
      if (!(existing instanceof TFolder)) {
        await this.createFolder(relPath);
        await this.scan(this.getFolderByPath(relPath) ?? this.root);
      }
      return;
    }
    const file = existing instanceof TFile ? existing : this.attachFile(relPath);
    const changed = file.stat.mtime !== stat.mtime;
    file.stat = { ctime: stat.ctime, mtime: stat.mtime, size: stat.size };
    if (changed) {
      this.textCache.delete(relPath);
      this.trigger('modify', file);
    }
  }

  private attachFile(path: string): TFile {
    const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const parent = this.getFolderByPath(parentPath) ?? this.root;
    const file = new TFile(this, path, parent);
    parent.children.push(file);
    this.fileMap.set(path, file);
    this.trigger('create', file);
    return file;
  }

  private cacheText(path: string, text: string, mtime: number): void {
    if (!TEXT_EXTENSIONS.has(path.split('.').pop() ?? '')) return;
    this.cacheBytes += text.length;
    this.textCache.set(path, { mtime, text });
    while (this.cacheBytes > MAX_CACHE_BYTES && this.textCache.size > 1) {
      const oldest = this.textCache.keys().next().value;
      if (oldest == null) break;
      const entry = this.textCache.get(oldest);
      this.textCache.delete(oldest);
      this.cacheBytes -= entry?.text.length ?? 0;
    }
  }
}
