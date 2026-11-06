import { createEl } from '../core/dom';
import type { GraphData, GraphNode } from './graph-data';

export interface GraphPoint {
  id: string;
  x: number;
  y: number;
}

type ActivateNode = (node: GraphNode) => void;

const MIN_SCALE = 0.12;
const MAX_SCALE = 5;

interface Palette {
  line: string;
  file: string;
  tag: string;
  attachment: string;
  unresolved: string;
  accent: string;
  label: string;
  labelHover: string;
}

/**
 * Canvas renderer for graph data. Keeps the Obsidian feel: node radius grows
 * with link count, tags and attachments have their own colors, labels appear
 * when zoomed in, wheel zoom targets the cursor and dragging pans.
 */
export class GraphRenderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private data: GraphData = { nodes: [], edges: [] };
  private nodesById = new Map<string, GraphNode>();
  private neighbours = new Map<string, Set<string>>();
  private points = new Map<string, GraphPoint>();
  private scale = 1;
  private offset = { x: 0, y: 0 };
  private pointer: { x: number; y: number; moved: boolean } | null = null;
  private hovered: string | null = null;
  private activeId: string | null = null;
  private palette: Palette;
  private frame = 0;
  private observer: ResizeObserver;

  constructor(parent: HTMLElement, private readonly activate: ActivateNode) {
    this.canvas = createEl('canvas', { cls: 'graph-canvas', parent });
    this.ctx = this.canvas.getContext('2d')!;
    this.palette = this.readPalette();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(parent);
    this.bindInteraction();
    this.resize();
  }

  destroy(): void {
    this.observer.disconnect();
    cancelAnimationFrame(this.frame);
    this.canvas.remove();
  }

  setData(data: GraphData): void {
    this.data = data;
    this.nodesById = new Map(data.nodes.map((node) => [node.id, node]));
    this.neighbours.clear();
    for (const edge of data.edges) {
      const link = (a: string, b: string): void => {
        const set = this.neighbours.get(a) ?? new Set<string>();
        set.add(b);
        this.neighbours.set(a, set);
      };
      link(edge.source, edge.target);
      link(edge.target, edge.source);
    }
    for (const id of [...this.points.keys()]) if (!this.nodesById.has(id)) this.points.delete(id);
    this.palette = this.readPalette();
    this.requestDraw();
  }

  setPoints(points: GraphPoint[]): void {
    for (const point of points) this.points.set(point.id, point);
    this.requestDraw();
  }

  /** Current positions, so a re-layout can start from where nodes already are. */
  getPositions(): Map<string, GraphPoint> {
    return new Map(this.points);
  }

  setActive(id: string | null): void {
    if (this.activeId === id) return;
    this.activeId = id;
    this.requestDraw();
  }

  resize(): void {
    const ratio = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth || 1;
    const height = this.canvas.clientHeight || 1;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.requestDraw();
  }

  private radiusOf(node: GraphNode): number {
    const base = node.type === 'file' ? 2.5 : 2;
    return Math.min(16, base + Math.sqrt(node.weight) * 2);
  }

  private requestDraw(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private draw(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const ctx = this.ctx;
    const palette = this.palette;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2 + this.offset.x, height / 2 + this.offset.y);
    ctx.scale(this.scale, this.scale);

    const related = this.hovered ? this.neighbours.get(this.hovered) : null;
    for (const edge of this.data.edges) {
      const a = this.points.get(edge.source);
      const b = this.points.get(edge.target);
      if (!a || !b) continue;
      const highlighted = this.hovered && (edge.source === this.hovered || edge.target === this.hovered);
      ctx.strokeStyle = highlighted && related ? palette.accent : palette.line;
      ctx.globalAlpha = highlighted ? 0.9 : Math.min(0.75, 0.25 + edge.weight * 0.1);
      ctx.lineWidth = Math.min(3, 1 + Math.log2(edge.weight)) / this.scale;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    const showLabels = this.scale >= 0.55;
    for (const node of this.data.nodes) {
      const point = this.points.get(node.id);
      if (!point) continue;
      const dimmed = this.hovered != null && node.id !== this.hovered && !related?.has(node.id);
      const radius = this.radiusOf(node);
      ctx.globalAlpha = dimmed ? 0.25 : 1;
      ctx.fillStyle = this.colorOf(node, palette);
      ctx.beginPath();
      ctx.arc(point.x, point.y, node.id === this.activeId ? radius + 2 : radius, 0, Math.PI * 2);
      ctx.fill();
      if (node.id === this.activeId) {
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2 / this.scale;
        ctx.stroke();
      }
      if (showLabels || node.id === this.hovered || node.id === this.activeId) {
        ctx.fillStyle = node.id === this.hovered ? palette.labelHover : palette.label;
        ctx.font = `${11 / this.scale}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(node.label, point.x, point.y + radius + 3 / this.scale);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private colorOf(node: GraphNode, palette: Palette): string {
    if (node.id === this.activeId) return palette.accent;
    if (node.type === 'tag') return palette.tag;
    if (node.type === 'attachment') return palette.attachment;
    if (node.type === 'unresolved') return palette.unresolved;
    return palette.file;
  }

  private readPalette(): Palette {
    const styles = getComputedStyle(document.body);
    const read = (name: string, fallback: string): string => styles.getPropertyValue(name).trim() || fallback;
    return {
      line: read('--graph-line', 'rgba(150,150,150,0.22)'),
      file: read('--graph-node', '#8a8a8a'),
      tag: read('--graph-node-tag', '#d99a4e'),
      attachment: read('--graph-node-attachment', '#6f9bd1'),
      unresolved: read('--graph-node-unresolved', '#c25a5a'),
      accent: read('--accent', '#7c6cf0'),
      label: read('--text-muted', '#9a9a9a'),
      labelHover: read('--text-normal', '#dddddd'),
    };
  }

  private hitTest(clientX: number, clientY: number): GraphNode | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left - rect.width / 2 - this.offset.x) / this.scale;
    const y = (clientY - rect.top - rect.height / 2 - this.offset.y) / this.scale;
    let best: GraphNode | null = null;
    let bestDistance = Infinity;
    for (const node of this.data.nodes) {
      const point = this.points.get(node.id);
      if (!point) continue;
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < this.radiusOf(node) + 5 / this.scale && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }

  private bindInteraction(): void {
    this.canvas.addEventListener('pointerdown', (event) => {
      this.pointer = { x: event.clientX, y: event.clientY, moved: false };
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (this.pointer) {
        const dx = event.clientX - this.pointer.x;
        const dy = event.clientY - this.pointer.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) this.pointer.moved = true;
        this.offset.x += dx;
        this.offset.y += dy;
        this.pointer.x = event.clientX;
        this.pointer.y = event.clientY;
        this.requestDraw();
        return;
      }
      const hovered = this.hitTest(event.clientX, event.clientY)?.id ?? null;
      if (hovered !== this.hovered) {
        this.hovered = hovered;
        this.requestDraw();
      }
    });
    this.canvas.addEventListener('pointerup', (event) => {
      const wasDrag = this.pointer?.moved ?? false;
      this.pointer = null;
      if (wasDrag) return;
      const node = this.hitTest(event.clientX, event.clientY);
      if (node) this.activate(node);
    });
    this.canvas.addEventListener('pointerleave', () => {
      if (this.hovered) {
        this.hovered = null;
        this.requestDraw();
      }
    });
    this.canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * (event.deltaY > 0 ? 0.9 : 1.1)));
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const worldX = (px - cx - this.offset.x) / this.scale;
        const worldY = (py - cy - this.offset.y) / this.scale;
        this.offset.x = px - cx - worldX * next;
        this.offset.y = py - cy - worldY * next;
        this.scale = next;
        this.requestDraw();
      },
      { passive: false },
    );
  }
}
