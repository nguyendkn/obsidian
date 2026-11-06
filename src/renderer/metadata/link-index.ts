import type { CachedMetadata } from './types';
import type { LinkResolver } from './link-resolver';

export interface LinkMaps {
  resolvedLinks: Record<string, Record<string, number>>;
  unresolvedLinks: Record<string, Record<string, number>>;
}

export interface LinkSource {
  path: string;
  cache: CachedMetadata | null;
}

/**
 * Builds `resolvedLinks`/`unresolvedLinks` exactly like Obsidian: every wikilink
 * and embed of every markdown note is resolved, duplicates increase the weight,
 * and links that do not match a file are recorded per source.
 */
export function buildLinkMaps(sources: LinkSource[], resolver: LinkResolver): LinkMaps {
  const resolvedLinks: Record<string, Record<string, number>> = {};
  const unresolvedLinks: Record<string, Record<string, number>> = {};

  for (const { path, cache } of sources) {
    if (!cache) continue;
    for (const link of [...(cache.links ?? []), ...(cache.embeds ?? [])]) {
      const target = resolver.resolve(link.link, path);
      const bucket = target
        ? (resolvedLinks[path] ??= {})
        : (unresolvedLinks[path] ??= {});
      const key = target ?? link.link;
      bucket[key] = (bucket[key] ?? 0) + 1;
    }
  }

  return { resolvedLinks, unresolvedLinks };
}
