import type { App } from './app';

/** Resolve a link/embed target to a vault-relative path. */
export function resolveResourcePath(app: App, link: string, sourcePath: string): string | null {
  if (/^(https?:|data:)/i.test(link)) return null;
  const clean = decodeURIComponent(link.split('#')[0].split('|')[0].trim());
  if (!clean) return null;

  const sourceDir = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '';
  const candidates = [
    clean.startsWith('/') ? clean.slice(1) : clean,
    sourceDir ? `${sourceDir}/${clean}` : clean,
  ];
  for (const candidate of candidates) {
    if (app.vault.getAbstractFileByPath(candidate)) return candidate;
  }

  const basename = clean.split('/').pop()?.toLowerCase();
  const match = app.vault.getFiles().find((file) => file.name.toLowerCase() === basename);
  return match?.path ?? null;
}

/** Image URL usable in <img src>. */
export function resourceUrl(app: App, link: string, sourcePath: string): string | null {
  if (/^(https?:|data:)/i.test(link)) return link;
  const path = resolveResourcePath(app, link, sourcePath);
  return path ? app.resourceUrl(path) : null;
}
