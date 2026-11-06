import type { GraphLocalOptions, GraphNodeType } from './graph-data';

export interface WorkingNode {
  type: GraphNodeType;
  /** Outgoing links, by node id. Directed — edge weights are derived later. */
  links: Set<string>;
}

export interface LocalGraph {
  nodes: Map<string, WorkingNode>;
  /** Obsidian's local weights: 30 for the root, `30 - 30/jumps * level` below. */
  weights: Map<string, number>;
}

const ROOT_WEIGHT = 30;
const MAX_JUMPS = 5;

function clone(node: WorkingNode | undefined): WorkingNode {
  return { type: node?.type ?? 'file', links: new Set<string>() };
}

/**
 * Obsidian's `oV`: a BFS around the local-graph root that keeps only the links
 * traversed to reach each node, unless `interlinks` is on — then nodes keep
 * every link the full graph gave them. Tags are never a BFS step.
 */
export function buildLocalGraph(all: Map<string, WorkingNode>, options: GraphLocalOptions): LocalGraph {
  const weights = new Map<string, number>([[options.root, ROOT_WEIGHT]]);
  const scope = new Map<string, WorkingNode>();
  const root = all.get(options.root);
  if (!root) {
    // Obsidian returns a lone placeholder node when the root isn't in the graph.
    scope.set(options.root, clone(undefined));
    return { nodes: scope, weights };
  }

  scope.set(options.root, clone(root));
  const jumps = Math.max(1, Math.min(MAX_JUMPS, Math.round(options.jumps)));
  const step = ROOT_WEIGHT / jumps;

  for (let level = 0; level < jumps; level++) {
    const levelWeight = ROOT_WEIGHT - step * (level + 1);
    const added = new Map<string, WorkingNode>();
    for (const [id, node] of all) {
      if (node.type === 'tag') continue;
      const sourceIn = scope.has(id);
      for (const target of node.links) {
        const targetIn = scope.has(target);
        if (options.forelinks && sourceIn && !targetIn) {
          added.set(target, added.get(target) ?? clone(all.get(target)));
          scope.get(id)?.links.add(target);
        } else if (options.backlinks && targetIn && !sourceIn && all.get(target)?.type !== 'tag') {
          const previous = added.get(id) ?? clone(all.get(id));
          previous.links.add(target);
          added.set(id, previous);
        }
      }
    }
    for (const [id, node] of added) {
      scope.set(id, node);
      weights.set(id, levelWeight);
    }
  }

  if (options.interlinks) {
    for (const [id, node] of scope) {
      const original = all.get(id);
      if (original) scope.set(id, { type: original.type, links: new Set(original.links) });
    }
  }

  return { nodes: scope, weights };
}
