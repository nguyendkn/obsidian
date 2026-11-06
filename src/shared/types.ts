export interface VaultRecord {
  path: string;
  ts: number;
  open?: boolean;
}

export interface VaultRegistry {
  vaults: Record<string, VaultRecord>;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion: string;
  description: string;
  author: string;
  authorUrl?: string;
  isDesktopOnly?: boolean;
}

export interface HeadingCache {
  level: number;
  heading: string;
  position: Pos;
}

export interface Pos {
  start: { line: number; col: number; offset: number };
  end: { line: number; col: number; offset: number };
}

export interface LinkCache {
  link: string;
  original: string;
  displayText?: string;
  embed: boolean;
  position: Pos;
}

export interface TagCache {
  tag: string;
  position: Pos;
}

export interface SectionCache {
  type: string;
  id?: string;
  level?: number;
  position: Pos;
}

export interface ListItemCache {
  id?: string;
  parent: number;
  position: Pos;
}

export interface BlockCache {
  id: string;
  position: Pos;
}

export interface CachedMetadata {
  hash: string;
  mtime: number;
  size: number;
  frontmatter: Record<string, unknown>;
  headings: HeadingCache[];
  links: LinkCache[];
  embeds: LinkCache[];
  tags: TagCache[];
  sections: SectionCache[];
  listItems: ListItemCache[];
  blocks: Record<string, BlockCache>;
}

export interface FileEntry {
  path: string;
  name: string;
  extension: string;
  basename: string;
  parent: string | null;
  stat: { mtime: number; ctime: number; size: number };
  children?: FileEntry[];
}

export type LayoutNode =
  | { type: 'split'; direction: 'vertical' | 'horizontal'; children: LayoutNode[] }
  | { type: 'tabs'; children: LayoutNode[] }
  | { type: 'leaf'; state: { type: string; state?: unknown; active?: boolean } };

export interface SavedLayout {
  main: LayoutNode;
  left?: LayoutNode;
  right?: LayoutNode;
  active?: string;
  lastOpenFiles?: string[];
}

export interface AppConfig {
  theme?: 'dark' | 'light' | 'system';
  cssTheme?: string;
  enabledCssSnippets?: string[];
  accentColor?: string;
  baseFontSize?: number;
  readableLineLength?: boolean;
  showLineNumber?: boolean;
  livePreview?: boolean;
  [key: string]: unknown;
}

export interface VaultInfo {
  id: string;
  path: string;
  name: string;
  configDir: string;
}

export interface SearchResult {
  path: string;
  line: number;
  text: string;
  score: number;
}
