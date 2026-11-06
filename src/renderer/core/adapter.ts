/**
 * Desktop file adapter. Runs in the renderer with nodeIntegration, so Node's
 * fs is available directly — this is the same tradeoff Obsidian's desktop
 * build makes (no preload bridge; full Node in the renderer).
 */
const fs = require('node:fs') as typeof import('node:fs');
const fsp = fs.promises;
const path = require('node:path') as typeof import('node:path');

export interface FileStat {
  type: 'file' | 'folder';
  ctime: number;
  mtime: number;
  size: number;
}

export interface ListedChild {
  name: string;
  path: string;
  type: 'file' | 'folder';
}

export class FileSystemAdapter {
  constructor(readonly basePath: string) {}

  private abs(p: string): string {
    return path.resolve(this.basePath, p);
  }

  /** Normalized vault-relative path with forward slashes; '' for the root. */
  toVaultPath(absPath: string): string {
    const rel = path.relative(this.basePath, absPath);
    return rel.split(path.sep).join('/');
  }

  toAbsolute(vaultPath: string): string {
    return this.abs(vaultPath);
  }

  async exists(vaultPath: string): Promise<boolean> {
    try {
      await fsp.access(this.abs(vaultPath));
      return true;
    } catch {
      return false;
    }
  }

  async stat(vaultPath: string): Promise<FileStat | null> {
    try {
      const s = await fsp.stat(this.abs(vaultPath));
      return {
        type: s.isDirectory() ? 'folder' : 'file',
        ctime: s.ctimeMs,
        mtime: s.mtimeMs,
        size: s.size,
      };
    } catch {
      return null;
    }
  }

  async list(vaultPath: string): Promise<ListedChild[]> {
    const entries = await fsp.readdir(this.abs(vaultPath), { withFileTypes: true });
    return entries.map((entry) => ({
      name: entry.name,
      path: `${vaultPath ? vaultPath + '/' : ''}${entry.name}`,
      type: entry.isDirectory() ? 'folder' : 'file',
    }));
  }

  async read(vaultPath: string): Promise<string> {
    return fsp.readFile(this.abs(vaultPath), 'utf8');
  }

  async readBinary(vaultPath: string): Promise<Uint8Array> {
    return new Uint8Array(await fsp.readFile(this.abs(vaultPath)));
  }

  async write(vaultPath: string, data: string): Promise<void> {
    const target = this.abs(vaultPath);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, data, 'utf8');
  }

  async mkdir(vaultPath: string): Promise<void> {
    await fsp.mkdir(this.abs(vaultPath), { recursive: true });
  }

  async remove(vaultPath: string): Promise<void> {
    await fsp.rm(this.abs(vaultPath), { recursive: true, force: true });
  }

  async rename(from: string, to: string): Promise<void> {
    const target = this.abs(to);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.rename(this.abs(from), target);
  }

  /**
   * Watch the vault recursively. chokidar is used when installed; otherwise the
   * renderer falls back to fs.watch, which is enough on macOS/Windows.
   */
  watch(onChange: (relPath: string) => void): () => void {
    try {
      const chokidar = require('chokidar');
      const watcher = chokidar.watch(this.basePath, {
        ignoreInitial: true,
        ignored: /(^|[/\\])(\.git|node_modules)([/\\]|$)/,
      });
      const handler = (abs: string) => onChange(this.toVaultPath(abs));
      watcher.on('add', handler).on('change', handler).on('unlink', handler);
      watcher.on('addDir', handler).on('unlinkDir', handler);
      return () => void watcher.close();
    } catch {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const watcher = fs.watch(this.basePath, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          onChange(String(filename).split(path.sep).join('/'));
        }, 120);
      });
      return () => watcher.close();
    }
  }
}
