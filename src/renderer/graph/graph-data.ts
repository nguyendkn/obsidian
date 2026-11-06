import type { CachedMetadata } from '../metadata/types';
import { collectTags } from '../metadata/tags';
import { parseSearchQuery } from './graph-search';
import type { SearchFields } from './graph-search';
import { buildLocalGraph } from './graph-local';
import type { WorkingNode } from './graph-local';
import { displayText, isAttachmentPath, isMarkdownPath, lastSegment } from './graph-path';

export type GraphNodeType = 'file' | 'tag' | 'attachment' | 'unresolved';

export interface GraphFile {
  path: string;
  name: string;
  basename: string;
  extension: string;
}

export interface GraphInput {
  files: GraphFile[];
  getCache(path: string): CachedMetadata | null;
  resolvedLinks: Record<string, Record<string, number>>;
  unresolvedLinks?: Record<string, Record<string, number>>;
  /** Canonical tag spellings, `tag → count` — Obsidian's `getTags()`. */
  getTags?(): Record<string, number>;
  /** Markdown text, for graph content search. */
  getContent?(path: string): string | undefined;
}

export interface GraphLocalOptions {
  /** Path of the note the local graph is centred on. */
  root: string;
  /** Obsidian's local-jumps slider, 1–5. */
  jumps: number;
  /** Keep every link among the reached nodes, not only the traversed ones. */
  interlinks: boolean;
  forelinks: boolean;
  backlinks: boolean;
}

export interface GraphOptions {
  showAttachments: boolean;
  hideUnresolved: boolean;
  showOrphans: boolean;
  showTags: boolean;
  search: string;
  local?: GraphLocalOptions;
}

export interface GraphNode {
  /** File path, `#tag` for tags, or the raw link text for unresolved links. */
  id: string;
  type: GraphNodeType;
  label: string;
  /** Vault path; undefined for tag and unresolved nodes. */
  path?: string;
  /** Obsidian's link weight: forward + reverse neighbour counts, or the local level weight. */
  weight: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  /** Always 1 — Obsidian draws one edge per linked pair. */
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * The app's own defaults. Obsidian ships `showTags: false`; tags stay on here
 * because the graph view has no settings UI to switch them back on.
 */
export const DEFAULT_GRAPH_OPTIONS: GraphOptions = {
  showAttachments: false,
  hideUnresolved: false,
  showOrphans: true,
  showTags: true,
  search: '',
};

const EDGE_SEPARATOR = '\u0000';

/**
 * Obsidian's `ehe`: drop nodes that neither point at a surviving node nor are
 * referenced by one — an orphan is isolated in the rendered graph, not just in
 * the vault.
 */
function removeOrphans(nodes: Map<string, WorkingNode>): void {
  const referenced = new Set<string>();
  for (const [id, node] of nodes) {
    for (const target of node.links) if (target !== id) referenced.add(target);
  }
  for (const [id, node] of [...nodes]) {
    let linked = false;
    for (const target of node.links) {
      if (target !== id && nodes.has(target)) {
        linked = true;
        break;
      }
    }
    if (!linked && !referenced.has(id)) nodes.delete(id);
  }
}

/**
 * Builds the node/edge lists Obsidian's graph engine consumes, following the
 * same passes: collect nodes and directed links (`oDe`), drop orphans (`ehe`),
 * narrow to the local graph (`oV`), then weight nodes by neighbour count.
 */
export function buildGraphData(input: GraphInput, options: GraphOptions = DEFAULT_GRAPH_OPTIONS): GraphData {
  const { files, resolvedLinks, unresolvedLinks } = input;
  const query = parseSearchQuery(options.search);
  const canonicalTags = new Map<string, string>();
  if (options.showTags && input.getTags) {
    for (const tag of Object.keys(input.getTags())) canonicalTags.set(tag.toLowerCase(), tag);
  }

  const passes = (path: string): boolean => {
    if (!query) return true;
    const fields: SearchFields = { filename: lastSegment(path), path };
    if (isMarkdownPath(path)) {
      const content = input.getContent?.(path);
      if (content !== undefined) fields.content = content;
      if (query.hasTagTerm) fields.tags = collectTags(input.getCache(path));
    }
    return query.test(fields);
  };
  const passesTag = (tag: string): boolean => !query || query.test({ tag });

  const nodes = new Map<string, WorkingNode>();
  for (const file of files) {
    const path = file.path;
    const attachment = isAttachmentPath(path);
    if (attachment && !options.showAttachments) continue;
    if (!passes(path)) continue;

    const links = new Set<string>();
    nodes.set(path, { type: attachment ? 'attachment' : 'file', links });

    for (const target of Object.keys(resolvedLinks[path] ?? {})) {
      if (!options.showAttachments && isAttachmentPath(target)) continue;
      if (!passes(target)) continue;
      links.add(target);
    }

    if (!options.hideUnresolved) {
      for (const target of Object.keys(unresolvedLinks?.[path] ?? {})) {
        if (!nodes.has(target)) nodes.set(target, { type: 'unresolved', links: new Set() });
        links.add(target);
      }
    }

    if (options.showTags) {
      for (const tag of collectTags(input.getCache(path))) {
        const canonical = canonicalTags.get(tag.toLowerCase()) ?? tag;
        if (!passesTag(canonical)) continue;
        if (!nodes.has(canonical)) nodes.set(canonical, { type: 'tag', links: new Set() });
        links.add(canonical);
      }
    }
  }

  // Obsidian narrows to the local graph first, then drops orphans from that
  // narrowed set (`a.localFile && (c = oV(c, a)), a.showOrphans || ehe(c)`).
  const local = options.local ? buildLocalGraph(nodes, options.local) : null;
  const scope = local ? local.nodes : nodes;
  if (!options.showOrphans) removeOrphans(scope);

  const ids = new Set(scope.keys());
  const forward = new Map<string, number>();
  const reverse = new Map<string, number>();
  const edges = new Map<string, GraphEdge>();
  for (const [id, node] of scope) {
    for (const target of node.links) {
      // Self-links are kept: Obsidian draws a loop and counts it in `forward`
      // and `reverse`, so it adds 2 to the node's weight.
      if (!ids.has(target)) continue;
      forward.set(id, (forward.get(id) ?? 0) + 1);
      reverse.set(target, (reverse.get(target) ?? 0) + 1);
      const [source, dest] = id < target ? [id, target] : [target, id];
      const key = `${source}${EDGE_SEPARATOR}${dest}`;
      if (!edges.has(key)) edges.set(key, { source, target: dest, weight: 1 });
    }
  }

  const outputNodes: GraphNode[] = [];
  for (const [id, node] of scope) {
    const weight = local ? local.weights.get(id) ?? 0 : (forward.get(id) ?? 0) + (reverse.get(id) ?? 0);
    const fileNode = node.type === 'file' || node.type === 'attachment';
    outputNodes.push({
      id,
      type: node.type,
      // Tags keep their hierarchy (`area/family`); files show their name only.
      label: node.type === 'tag' ? id.replace(/^#/, '') : displayText(id),
      ...(fileNode ? { path: id } : {}),
      weight,
    });
  }

  return { nodes: outputNodes, edges: [...edges.values()] };
}
