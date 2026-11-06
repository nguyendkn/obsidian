import yaml from 'js-yaml';
import type { Position } from './types';

export interface FrontmatterResult {
  data: Record<string, unknown>;
  position: Position;
  /** Line index of the closing `---`/`...` marker. */
  endLine: number;
}

function offsetAt(lines: string[], line: number): number {
  let offset = 0;
  for (let i = 0; i < line; i++) offset += lines[i].length + 1;
  return offset;
}

/** Obsidian-style YAML frontmatter: only at line 0, closed by `---` or `...`. */
export function extractFrontmatter(lines: string[]): FrontmatterResult | null {
  const first = lines[0]?.replace(/^﻿/, '') ?? '';
  if (first.trimEnd() !== '---') return null;
  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    const marker = lines[i].trimEnd();
    if (marker === '---' || marker === '...') {
      endLine = i;
      break;
    }
  }
  if (endLine < 0) return null;

  let data: Record<string, unknown> = {};
  try {
    const parsed = yaml.load(lines.slice(1, endLine).join('\n'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    data = {};
  }

  const endOffset = offsetAt(lines, endLine);
  return {
    data,
    endLine,
    position: {
      start: { line: 0, col: 0, offset: 0 },
      end: { line: endLine, col: lines[endLine].length, offset: endOffset + lines[endLine].length },
    },
  };
}

/**
 * Obsidian's frontmatter tag rule (`Qu` over `z2`): the `tags` property
 * (case-insensitive key), string or list of strings, each trimmed. Values that
 * are empty or contain a space are dropped and the `#` prefix is added when
 * missing. Values are *not* split on commas — `tags: a, b` is one tag, `#a, b`,
 * which then contains a space and is dropped.
 */
export function frontmatterTags(data: Record<string, unknown>): string[] {
  const key = Object.keys(data).find((name) => /^tags$/i.test(name));
  if (!key) return [];
  const raw = data[key];
  const values = Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === 'string').map((value) => value.trim())
    : typeof raw === 'string'
      ? [raw.trim()]
      : [];
  const tags: string[] = [];
  for (const value of values) {
    if (!value || value.includes(' ')) continue;
    tags.push(value.startsWith('#') ? value : `#${value}`);
  }
  return tags;
}
