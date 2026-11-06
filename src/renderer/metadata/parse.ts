import type {
  CachedMetadata,
  HeadingCache,
  LinkCache,
  ListItemCache,
  Position,
  SectionCache,
  TagCache,
} from './types';
import { extractFrontmatter } from './frontmatter';

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;
const BLOCK_ID = /\s\^([A-Za-z0-9-]+)\s*$/;
const REF_DEF = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)/;
const WIKILINK = /(!?)\[\[([^[\]\n]+)\]\]/g;
const MD_LINK = /(!?)\[([^[\]\n]*)\]\(([^()\s]+)(?:\s+["'][^"']*["'])?\)/g;
const REF_LINK = /(!?)\[([^[\]\n]*)\]\[([^[\]\n]*)\]/g;
const TAG = /(^|[\s([{>~"'=])(#[\p{L}\p{N}_/-]+)/gu;
const CODE_SPAN = /`+[^`\n]*`+/g;

function pos(line: number, col: number, lineOffset: number, length: number): Position {
  return {
    start: { line, col, offset: lineOffset + col },
    end: { line, col: col + length, offset: lineOffset + col + length },
  };
}

/** Replace spans with spaces so later scans skip them while columns stay valid. */
function mask(text: string, spans: Array<[number, number]>): string {
  if (!spans.length) return text;
  const chars = text.split('');
  for (const [start, end] of spans) {
    for (let i = start; i < end && i < chars.length; i++) chars[i] = ' ';
  }
  return chars.join('');
}

/** Markdown destinations that point outside the vault are not internal links. */
function internalTarget(href: string): string | null {
  const raw = href.replace(/^<|>$/g, '');
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

interface ScanSinks {
  links: LinkCache[];
  embeds: LinkCache[];
  tags: TagCache[];
  refs: Map<string, string>;
}

function scanLine(line: string, lineIndex: number, lineOffset: number, sinks: ScanSinks, scanTags = true): void {
  const codeSpans: Array<[number, number]> = [];
  for (const match of line.matchAll(CODE_SPAN)) codeSpans.push([match.index!, match.index! + match[0].length]);
  const text = mask(line, codeSpans);
  const linkSpans: Array<[number, number]> = [];

  const addLink = (embed: boolean, target: string, col: number, raw: string, display?: string): void => {
    const link = target.trim();
    if (!link) return;
    const entry: LinkCache = {
      link,
      original: raw,
      displayText: display?.trim() || undefined,
      position: pos(lineIndex, col, lineOffset, raw.length),
    };
    (embed ? sinks.embeds : sinks.links).push(entry);
  };

  for (const match of text.matchAll(WIKILINK)) {
    const raw = match[0];
    const col = match.index!;
    linkSpans.push([col, col + raw.length]);
    const inner = match[2];
    const bar = inner.indexOf('|');
    addLink(match[1] === '!', bar >= 0 ? inner.slice(0, bar) : inner, col, raw, bar >= 0 ? inner.slice(bar + 1) : undefined);
  }

  for (const match of text.matchAll(MD_LINK)) {
    const target = internalTarget(match[3]);
    if (!target) continue;
    const col = match.index!;
    linkSpans.push([col, col + match[0].length]);
    addLink(match[1] === '!', target, col, match[0], match[2]);
  }

  for (const match of text.matchAll(REF_LINK)) {
    const id = (match[3] || match[2]).trim().toLowerCase();
    const target = sinks.refs.get(id);
    if (!target) continue;
    const col = match.index!;
    linkSpans.push([col, col + match[0].length]);
    addLink(match[1] === '!', target, col, match[0], match[3] ? match[2] : undefined);
  }

  if (!scanTags) return;
  for (const match of mask(text, linkSpans).matchAll(TAG)) {
    const tag = match[2];
    if (!/\p{L}/u.test(tag)) continue; // numeric-only tags are invalid in Obsidian
    const col = match.index! + match[1].length;
    sinks.tags.push({ tag, position: pos(lineIndex, col, lineOffset, tag.length) });
  }
}

/** Line-oriented metadata parser mirroring Obsidian's MetadataCache shape. */
export function parseMarkdown(text: string): CachedMetadata {
  const lines = text.split('\n');
  const metadata: CachedMetadata = {};
  const headings: HeadingCache[] = [];
  const sections: SectionCache[] = [];
  const listItems: ListItemCache[] = [];
  const sinks: ScanSinks = { links: [], embeds: [], tags: [], refs: new Map() };

  const frontmatter = extractFrontmatter(lines);
  if (frontmatter) {
    metadata.frontmatter = frontmatter.data;
    metadata.frontmatterPosition = frontmatter.position;
    sections.push({ type: 'yaml', position: frontmatter.position });
  }
  const bodyStart = frontmatter ? frontmatter.endLine + 1 : 0;

  // Reference definitions are document-scoped, so collect them before scanning uses.
  let fenceDepth = 0;
  for (let i = bodyStart; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      fenceDepth ^= 1;
      continue;
    }
    if (fenceDepth) continue;
    const def = REF_DEF.exec(lines[i]);
    if (def) sinks.refs.set(def[1].trim().toLowerCase(), def[2].replace(/^<|>$/g, ''));
  }

  let offset = 0;
  for (let i = 0; i < bodyStart; i++) offset += lines[i].length + 1;

  let inFence = false;
  let fenceMarker = '';
  let openParagraph: SectionCache | null = null;
  let listIndex = 0;
  const listStack: Array<{ indent: number; index: number }> = [];

  const closeParagraph = (endLine: number): void => {
    if (!openParagraph) return;
    openParagraph.position.end.line = Math.max(openParagraph.position.start.line, endLine);
    openParagraph = null;
  };

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    const lineOffset = offset;
    offset += line.length + 1;

    const fence = FENCE.exec(line);
    if (fence) {
      closeParagraph(i - 1);
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1][0];
        sections.push({ type: 'code', position: pos(i, 0, lineOffset, line.length) });
      } else if (fence[1][0] === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    const heading = HEADING.exec(line);
    if (heading) {
      closeParagraph(i - 1);
      headings.push({ heading: heading[2], level: heading[1].length, position: pos(i, 0, lineOffset, line.length) });
      sections.push({ type: 'heading', position: pos(i, 0, lineOffset, line.length) });
      continue;
    }

    if (line.trim() === '') {
      closeParagraph(i - 1);
      continue;
    }

    if (!openParagraph) {
      openParagraph = { type: 'paragraph', position: pos(i, 0, lineOffset, line.length) };
      sections.push(openParagraph);
    } else {
      openParagraph.position.end = pos(i, 0, lineOffset, line.length).end;
    }

    const list = LIST.exec(line);
    if (list) {
      const indent = list[1].length;
      while (listStack.length && listStack[listStack.length - 1].indent >= indent) listStack.pop();
      const parent = listStack.length ? listStack[listStack.length - 1].index : -1;
      const task = /^\[([ xX-])\]\s+/.exec(list[3]);
      listItems.push({ position: pos(i, indent, lineOffset, line.length - indent), parent, task: task ? task[1] : undefined });
      listStack.push({ indent, index: listIndex++ });
    }

    const blockId = BLOCK_ID.exec(line);
    if (blockId) {
      metadata.blocks ??= {};
      metadata.blocks[blockId[1]] = { id: blockId[1], position: pos(i, 0, lineOffset, line.length) };
    }

    scanLine(line, i, lineOffset, sinks);
  }

  closeParagraph(lines.length - 1);

  if (headings.length) metadata.headings = headings;
  if (sinks.links.length) metadata.links = sinks.links;
  if (sinks.embeds.length) metadata.embeds = sinks.embeds;
  if (sinks.tags.length) metadata.tags = sinks.tags;
  if (sections.length) metadata.sections = sections;
  if (listItems.length) metadata.listItems = listItems;
  return metadata;
}
