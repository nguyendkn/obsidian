import type { Vault } from '../core/vault';

interface LinkableFile {
  path: string;
  basename: string;
  name: string;
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

function dirOf(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

function depthOf(path: string): number {
  return path.split('/').length;
}

/**
 * Resolves `<linkpath>` the way Obsidian's `getFirstLinkpathDest` does:
 * subpath/alias stripped, relative to the source note first, then vault-absolute,
 * then a basename lookup that prefers the shortest path (ties broken by same folder).
 */
export class LinkResolver {
  private byPath = new Map<string, string>();
  private byRef = new Map<string, string[]>();

  constructor(private readonly vault: Vault) {}

  rebuild(): void {
    this.byPath.clear();
    this.byRef.clear();
    const files = this.vault.getFiles() as unknown as LinkableFile[];
    for (const file of files) this.index(file);
  }

  /** Used by tests to index a plain file list without a real vault. */
  index(file: LinkableFile): void {
    this.byPath.set(file.path.toLowerCase(), file.path);
    for (const key of new Set([file.basename.toLowerCase(), file.name.toLowerCase()])) {
      const list = this.byRef.get(key) ?? [];
      if (!list.includes(file.path)) list.push(file.path);
      this.byRef.set(key, list);
    }
  }

  resolve(linkpath: string, sourcePath: string): string | null {
    const withoutAlias = linkpath.split('|')[0];
    const hash = withoutAlias.indexOf('#');
    let target = (hash >= 0 ? withoutAlias.slice(0, hash) : withoutAlias).trim();
    try {
      target = decodeURIComponent(target);
    } catch {
      /* keep raw */
    }
    if (!target) return sourcePath ? (this.byPath.get(sourcePath.toLowerCase()) ?? null) : null;

    const absolute = target.startsWith('/');
    target = target.replace(/^\/+/, '');
    const sourceDir = dirOf(sourcePath);

    const probe = (candidate: string): string | null => {
      const lower = candidate.toLowerCase();
      const hits = lower.endsWith('.md') ? [lower] : [lower, `${lower}.md`];
      for (const hit of hits) {
        const found = this.byPath.get(hit);
        if (found) return found;
      }
      return null;
    };

    if (!absolute) {
      const relative = probe(normalizePath(sourceDir ? `${sourceDir}/${target}` : target));
      if (relative) return relative;
    }
    const direct = probe(normalizePath(target));
    if (direct) return direct;

    const name = target.split('/').pop() ?? target;
    return this.pick(this.byRef.get(name.toLowerCase()) ?? [], sourcePath);
  }

  private pick(candidates: string[], sourcePath: string): string | null {
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    const sourceDir = dirOf(sourcePath);
    return [...candidates].sort((a, b) => {
      const sameDir = Number(dirOf(b) === sourceDir) - Number(dirOf(a) === sourceDir);
      if (sameDir) return sameDir;
      const byDepth = depthOf(a) - depthOf(b);
      if (byDepth) return byDepth;
      const byLength = a.length - b.length;
      if (byLength) return byLength;
      return a.localeCompare(b);
    })[0];
  }
}
