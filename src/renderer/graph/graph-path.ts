/** Path helpers shared by the graph modules — Obsidian's `ge`/`Ek`/`vs`. */

export function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Obsidian's `he`: the extension is read from the *whole* path, not from the
 * last segment, and a dot at either end yields no extension.
 */
export function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 || dot === path.length - 1 || dot === 0 ? '' : path.slice(dot + 1).toLowerCase();
}

/** Obsidian's `Dt`: the last segment with its extension removed. */
function withoutExtension(path: string): string {
  const base = lastSegment(path);
  const dot = base.lastIndexOf('.');
  return dot === -1 || dot === base.length - 1 || dot === 0 ? base : base.slice(0, dot);
}

export function isMarkdownPath(path: string): boolean {
  return extensionOf(path) === 'md';
}

/** Obsidian's `GMe`: extensions the graph treats as notes, never attachments. */
const NOTE_EXTENSIONS = new Set(['md', 'canvas', 'base']);

/**
 * Obsidian's `Ek`: everything that is not a note extension counts as an
 * attachment — PDFs, images, and text files such as `.txt` or `.json` alike.
 */
export function isAttachmentPath(path: string): boolean {
  return !NOTE_EXTENSIONS.has(extensionOf(path));
}

/**
 * Obsidian's `vs`: the last path segment, minus its extension for markdown
 * notes. The extension test runs on the segment, matching `he(ge(o))`.
 */
export function displayText(id: string): string {
  const base = lastSegment(id);
  return extensionOf(base) === 'md' ? withoutExtension(id) : base;
}
