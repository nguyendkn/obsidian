import { ItemView } from './view';
import { GraphRenderer } from '../graph/graph-renderer';
import { buildGraphData, DEFAULT_GRAPH_OPTIONS } from '../graph/graph-data';
import type { GraphData, GraphNode, GraphOptions } from '../graph/graph-data';
import type { WorkspaceLeaf } from '../workspace/leaf';

interface WorkerNode {
  id: string;
  weight: number;
  x?: number;
  y?: number;
}

interface WorkerMessage {
  type: 'started' | 'tick';
  nodes: Array<{ id: string; x: number; y: number }>;
}

/**
 * Graph view. Data is built by `graph-data` (Obsidian's node/edge semantics) and
 * laid out by d3-force in a worker; the renderer only paints positions.
 */
export class GraphView extends ItemView {
  private renderer: GraphRenderer;
  private worker: Worker | null = null;
  private options: GraphOptions = { ...DEFAULT_GRAPH_OPTIONS };
  private data: GraphData = { nodes: [], edges: [] };
  /** Note text for graph content search; filled the first time search is used. */
  private contents = new Map<string, string>();
  private generation = 0;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.containerEl.classList.add('graph-view');
    this.renderer = new GraphRenderer(this.contentEl, (node) => this.activateNode(node));
    this.app.metadataCache.on('resolved', this.onMetadataChanged);
    this.app.metadataCache.on('changed', this.onMetadataChanged);
    this.app.workspace.on('active-leaf-change', this.onActiveLeafChange);
  }

  getViewType(): string {
    return 'graph';
  }

  getDisplayText(): string {
    return this.options.local ? 'Local graph' : 'Graph';
  }

  getIcon(): string {
    return 'git-fork';
  }

  getState(): Record<string, unknown> {
    return { local: Boolean(this.options.local), jumps: this.options.local?.jumps ?? 2 };
  }

  setState(state: Record<string, unknown>): void {
    const local = state.local === true;
    const depth = typeof state.jumps === 'number' ? state.jumps : typeof state.depth === 'number' ? state.depth : 2;
    const jumps = Math.max(1, Math.min(5, Math.round(depth)));
    this.options.local = local
      ? { root: this.app.workspace.getActiveFile()?.path ?? '', jumps, interlinks: false, forelinks: true, backlinks: true }
      : undefined;
    if (local && !this.options.local?.root) this.options.local = undefined;
  }

  async onOpen(): Promise<void> {
    this.renderer.resize();
    await this.rebuild();
  }

  async onClose(): Promise<void> {
    this.worker?.terminate();
    this.worker = null;
    this.renderer.destroy();
    this.app.metadataCache.off('resolved', this.onMetadataChanged);
    this.app.metadataCache.off('changed', this.onMetadataChanged);
    this.app.workspace.off('active-leaf-change', this.onActiveLeafChange);
  }

  private onMetadataChanged = (): void => {
    this.contents.clear();
    void this.rebuild();
  };

  private onActiveLeafChange = (): void => {
    this.syncActive();
    if (!this.options.local) return;
    const root = this.app.workspace.getActiveFile()?.path ?? '';
    if (root && root !== this.options.local.root) {
      this.options.local = { ...this.options.local, root };
      void this.rebuild();
    }
  };

  private async rebuild(): Promise<void> {
    const generation = ++this.generation;
    const files = this.app.vault.getFiles().map((file) => ({
      path: file.path,
      name: file.name,
      basename: file.basename,
      extension: file.extension,
    }));
    if (this.options.search.trim() && !this.contents.size) await this.loadContents();
    if (generation !== this.generation) return;
    this.data = buildGraphData(
      {
        files,
        getCache: (path) => this.app.metadataCache.getCache(path),
        resolvedLinks: this.app.metadataCache.resolvedLinks,
        unresolvedLinks: this.app.metadataCache.unresolvedLinks,
        getTags: () => this.app.metadataCache.getTags(),
        getContent: (path) => this.contents.get(path),
      },
      this.options,
    );
    this.renderer.setData(this.data);
    this.syncActive();
    this.layout();
  }

  private async loadContents(): Promise<void> {
    const entries = await Promise.all(
      this.app.vault.getMarkdownFiles().map(async (file) => [file.path, await this.app.vault.cachedRead(file)] as const),
    );
    this.contents = new Map(entries);
  }

  private layout(): void {
    const previous = this.collectPositions();
    this.worker?.terminate();
    this.worker = null;
    try {
      this.worker = new Worker('workers/sim.worker.js');
      this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.renderer.setPoints(event.data.nodes);
      this.worker.postMessage({
        type: 'init',
        nodes: this.data.nodes.map<WorkerNode>((node) => ({ id: node.id, weight: node.weight, ...previous.get(node.id) })),
        links: this.data.edges,
      });
    } catch (err) {
      console.error('[graph] worker unavailable, using static layout', err);
      this.renderer.setPoints(this.circleLayout());
    }
  }

  private collectPositions(): Map<string, { x: number; y: number }> {
    const points = new Map<string, { x: number; y: number }>();
    for (const [id, point] of this.renderer.getPositions()) {
      points.set(id, { x: point.x, y: point.y });
    }
    return points;
  }

  private circleLayout(): Array<{ id: string; x: number; y: number }> {
    const count = Math.max(1, this.data.nodes.length);
    const radius = Math.max(140, count * 9);
    return this.data.nodes.map((node, index) => {
      const angle = (index / count) * Math.PI * 2;
      return { id: node.id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
  }

  private syncActive(): void {
    const path = this.app.workspace.getActiveFile()?.path ?? null;
    this.renderer.setActive(path);
  }

  private activateNode(node: GraphNode): void {
    if (node.path) {
      const file = this.app.vault.getFileByPath(node.path);
      if (file) void this.app.workspace.openFile(file);
      return;
    }
    if (node.type === 'tag') this.app.notice(`Tag ${node.label}`);
    if (node.type === 'unresolved') this.app.notice(`Unresolved link: ${node.label}`);
  }
}
