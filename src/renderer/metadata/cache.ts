import { Events } from '../core/events';
import type { Vault, TFile } from '../core/vault';
import { LinkResolver } from './link-resolver';
import { buildLinkMaps } from './link-index';
import { collectTags, isValidTag } from './tags';
import type { CachedMetadata, FileCacheEntry } from './types';
import type { App } from '../core/app';

const DB_NAME = 'obsidian-arch-cache';
const DB_VERSION = 1;

function hashText(text: string): string {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Metadata index: hashes on the main thread, parses in a worker, persists both
 * by-file and by-hash so renames and edits don't reparse unchanged text.
 */
export class MetadataCache extends Events {
  private fileCache = new Map<string, FileCacheEntry>();
  private byHash = new Map<string, CachedMetadata>();
  private db: IDBDatabase | null = null;
  private worker: Worker | null = null;
  private pending = new Map<number, (metadata: CachedMetadata) => void>();
  private nextId = 1;
  private queue: Array<() => Promise<void>> = [];
  private running = false;
  private resolver: LinkResolver;
  resolvedLinks: Record<string, Record<string, number>> = {};
  unresolvedLinks: Record<string, Record<string, number>> = {};

  constructor(private readonly app: App) {
    super();
    this.resolver = new LinkResolver(app.vault);
  }

  getCache(path: string): CachedMetadata | null {
    return this.fileCache.get(path)?.metadata ?? null;
  }

  /** Paths that have a parsed cache — Obsidian's `getCachedFiles()`. */
  getCachedFiles(): string[] {
    return [...this.fileCache.keys()];
  }

  /**
   * Canonical tag spellings, like Obsidian's `getTags()`: `tag → count`, where
   * each tag is reported in its most frequent casing. Parent tags of nested
   * tags (`a/b` also counts `a`) are included.
   */
  getTags(): Record<string, number> {
    const counts = new Map<string, number>();
    const add = (raw: string): void => {
      const tag = raw.endsWith('/') ? raw.slice(0, -1) : raw;
      if (!isValidTag(tag)) return;
      const last = tag.slice(tag.lastIndexOf('/') + 1);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
      if (last !== tag) add(tag.slice(0, tag.length - last.length - 1));
    };
    for (const entry of this.fileCache.values()) {
      for (const tag of collectTags(entry.metadata)) add(tag);
    }

    const canonical = new Map<string, { tag: string; count: number; max: number }>();
    for (const [tag, count] of counts) {
      const key = tag.toLowerCase();
      const existing = canonical.get(key);
      if (!existing) canonical.set(key, { tag, count, max: count });
      else {
        existing.count += count;
        if (count > existing.max) {
          existing.max = count;
          existing.tag = tag;
        }
      }
    }

    const tags: Record<string, number> = {};
    for (const { tag, count } of canonical.values()) tags[tag] = count;
    return tags;
  }

  resolveLink(linkpath: string, sourcePath: string): string | null {
    return this.resolver.resolve(linkpath, sourcePath);
  }

  async initialize(): Promise<void> {
    await this.openDb();
    await this.preload();
    this.spawnWorker();
    for (const file of this.app.vault.getMarkdownFiles()) {
      this.queue.push(() => this.indexFile(file, false));
    }
    void this.drain();
  }

  /** Paths whose content resolves to the given link target. */
  getBacklinks(target: string): Array<{ source: string; count: number }> {
    const result: Array<{ source: string; count: number }> = [];
    for (const [source, links] of Object.entries(this.resolvedLinks)) {
      if (links[target]) result.push({ source, count: links[target] });
    }
    return result;
  }

  enqueueFile(file: TFile): void {
    this.queue.push(() => this.indexFile(file, true));
    void this.drain();
  }

  async rebuildLinks(): Promise<void> {
    this.resolver.rebuild();
    const sources = this.app.vault
      .getMarkdownFiles()
      .map((file) => ({ path: file.path, cache: this.getCache(file.path) }));
    const { resolvedLinks, unresolvedLinks } = buildLinkMaps(sources, this.resolver);
    this.resolvedLinks = resolvedLinks;
    this.unresolvedLinks = unresolvedLinks;
    this.trigger('resolved');
  }

  private async indexFile(file: TFile, notify: boolean): Promise<void> {
    let text: string;
    try {
      text = await this.app.vault.cachedRead(file);
    } catch {
      return;
    }
    const hash = hashText(text);
    const cached = this.byHash.get(hash) ?? (await this.dbGet<CachedMetadata>('metadata', hash));
    let metadata: CachedMetadata;
    if (cached) {
      metadata = cached;
    } else {
      metadata = await this.parseInWorker(file.path, text);
      this.byHash.set(hash, metadata);
      void this.dbPut('metadata', { hash, metadata });
    }

    const entry: FileCacheEntry = { file: file.path, mtime: file.stat.mtime, hash, metadata };
    this.fileCache.set(file.path, entry);
    void this.dbPut('files', entry);
    this.trigger('changed', file.path, notify);
  }

  private parseInWorker(path: string, text: string): Promise<CachedMetadata> {
    return new Promise((resolve) => {
      if (!this.worker) {
        void import('./parse').then(({ parseMarkdown }) => resolve(parseMarkdown(text)));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, path, text });
    });
  }

  private spawnWorker(): void {
    try {
      this.worker = new Worker('workers/metadata.worker.js');
      this.worker.onmessage = (event: MessageEvent<{ id: number; metadata?: CachedMetadata }>) => {
        const resolve = this.pending.get(event.data.id);
        this.pending.delete(event.data.id);
        if (resolve && event.data.metadata) resolve(event.data.metadata);
      };
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const task = this.queue.shift();
      if (!task) break;
      try {
        await task();
      } catch (err) {
        console.error('[metadata] index failed', err);
      }
    }
    this.running = false;
    await this.rebuildLinks();
  }

  private async openDb(): Promise<void> {
    this.db = await new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'file' });
          if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata', { keyPath: 'hash' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async preload(): Promise<void> {
    if (!this.db) return;
    const files = await this.dbAll<FileCacheEntry>('files');
    for (const entry of files) {
      this.fileCache.set(entry.file, entry);
      this.byHash.set(entry.hash, entry.metadata);
    }
  }

  private dbPut(store: string, value: unknown): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const tx = this.db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  private dbGet<T>(store: string, key: string): Promise<T | null> {
    return new Promise((resolve) => {
      if (!this.db) return resolve(null);
      const request = this.db.transaction(store, 'readonly').objectStore(store).get(key);
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => resolve(null);
    });
  }

  private dbAll<T>(store: string): Promise<T[]> {
    return new Promise((resolve) => {
      if (!this.db) return resolve([]);
      const request = this.db.transaction(store, 'readonly').objectStore(store).getAll();
      request.onsuccess = () => resolve((request.result as T[]) ?? []);
      request.onerror = () => resolve([]);
    });
  }
}
