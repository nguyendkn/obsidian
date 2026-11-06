export interface Position {
  start: { line: number; col: number; offset: number };
  end: { line: number; col: number; offset: number };
}

export interface HeadingCache {
  heading: string;
  level: number;
  position: Position;
}

export interface LinkCache {
  link: string;
  original: string;
  displayText?: string;
  position: Position;
}

export interface TagCache {
  tag: string;
  position: Position;
}

export interface SectionCache {
  id?: string;
  type: string;
  position: Position;
}

export interface ListItemCache {
  position: Position;
  task?: string;
  parent: number;
}

export interface BlockCache {
  id: string;
  position: Position;
}

export interface CachedMetadata {
  frontmatter?: Record<string, unknown>;
  frontmatterPosition?: Position;
  headings?: HeadingCache[];
  links?: LinkCache[];
  embeds?: LinkCache[];
  tags?: TagCache[];
  sections?: SectionCache[];
  listItems?: ListItemCache[];
  blocks?: Record<string, BlockCache>;
}

export interface FileCacheEntry {
  file: string;
  mtime: number;
  hash: string;
  metadata: CachedMetadata;
}
