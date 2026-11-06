import type { CachedMetadata } from './types';
import { frontmatterTags } from './frontmatter';

// Obsidian's `dx` over `M4e`/`T4e`: a `#` followed by at least one character
// that is neither whitespace nor one of the excluded punctuation characters,
// and not a purely numeric tag like `#1`. `M4e` is `E9` with a trailing `$`.
const TAG_RE = /^#[^ -⁯⸀-⹿'!"#$%&()*+,.:;<=>?@^`{|}~\[\]\\\s]+$/;
const NUMERIC_RE = /^#\d+$/;

export function isValidTag(tag: string): boolean {
  return TAG_RE.test(tag) && !NUMERIC_RE.test(tag);
}

/**
 * Tags Obsidian associates with a file (`Jl`): frontmatter `tags` first, then
 * inline `#tags` from `cache.tags`. Both in `#tag` form; duplicates are kept,
 * matching Obsidian's counting.
 */
export function collectTags(cache: CachedMetadata | null): string[] {
  if (!cache) return [];
  const tags: string[] = [];
  for (const tag of frontmatterTags(cache.frontmatter ?? {})) tags.push(tag);
  for (const entry of cache.tags ?? []) tags.push(entry.tag);
  return tags;
}
