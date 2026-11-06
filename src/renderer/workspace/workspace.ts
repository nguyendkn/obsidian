import { Events } from '../core/events';
import { createDiv, createEl, empty } from '../core/dom';
import { WorkspaceLeaf } from './leaf';
import type { App } from '../core/app';
import type { TFile } from '../core/vault';
import { FileView } from '../views/view';
import type { ViewState } from '../views/view';

interface WorkspaceState {
  open: string[];
  active: string | null;
  leftWidth: number;
  rightWidth: number;
}

/** Tabbed main area plus two sidebars — a reduced version of Obsidian's split tree. */
export class Workspace extends Events {
  app: App;
  containerEl: HTMLElement;
  leftEl: HTMLElement;
  mainEl: HTMLElement;
  rightEl: HTMLElement;
  tabBarEl: HTMLElement;
  mainContentEl: HTMLElement;
  leftLeaf!: WorkspaceLeaf;
  rightLeaf!: WorkspaceLeaf;
  activeLeaf: WorkspaceLeaf | null = null;
  leaves: WorkspaceLeaf[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App) {
    super();
    this.app = app;
    this.containerEl = createDiv({ cls: 'workspace' });
    this.leftEl = createDiv({ cls: 'workspace-sidebar workspace-sidebar-left', parent: this.containerEl });
    const center = createDiv({ cls: 'workspace-center', parent: this.containerEl });
    this.tabBarEl = createDiv({ cls: 'tab-bar', parent: center });
    this.mainContentEl = createDiv({ cls: 'workspace-main', parent: center });
    this.rightEl = createDiv({ cls: 'workspace-sidebar workspace-sidebar-right', parent: this.containerEl });
    this.mainEl = center;
  }

  async initialize(): Promise<void> {
    this.leftLeaf = new WorkspaceLeaf(this.app);
    this.rightLeaf = new WorkspaceLeaf(this.app);
    this.leftEl.append(this.leftLeaf.element);
    this.rightEl.append(this.rightLeaf.element);
    await this.leftLeaf.setViewState({ type: 'file-explorer', active: false });
    await this.rightLeaf.setViewState({ type: 'backlinks', active: false });
    await this.loadLayout();
    this.renderTabs();
  }

  async loadLayout(): Promise<void> {
    const layout = (await this.app.config.readJson('workspace.json')) as Partial<WorkspaceState>;
    if (typeof layout.leftWidth === 'number') this.leftEl.style.width = `${layout.leftWidth}px`;
    if (typeof layout.rightWidth === 'number') this.rightEl.style.width = `${layout.rightWidth}px`;
    for (const path of layout.open ?? []) {
      const file = this.app.vault.getFileByPath(path);
      if (file) await this.openFile(file, { newLeaf: true, activate: false });
    }
    const active = layout.active ? this.app.vault.getFileByPath(layout.active) : null;
    if (active) await this.openFile(active);
    else this.activeLeaf?.activate();
  }

  async openFile(file: TFile, opts: { newLeaf?: boolean; activate?: boolean; mode?: string } = {}): Promise<WorkspaceLeaf> {
    const existing = opts.newLeaf ? undefined : this.findLeaf(file);
    if (existing) {
      if (opts.mode && existing.view instanceof FileView) existing.view.setState({ mode: opts.mode });
      existing.activate();
      return existing;
    }
    const leaf = this.attachLeaf();
    await leaf.openFile(file, opts.mode ? { mode: opts.mode } : undefined);
    if (opts.activate === false) leaf.deactivate();
    else leaf.activate();
    this.scheduleSave();
    return leaf;
  }

  /** Open a non-file view (graph, search, …) in a new tab. */
  async openViewState(state: ViewState, opts: { activate?: boolean } = {}): Promise<WorkspaceLeaf> {
    const existing = this.leaves.find((leaf) => leaf.getViewState()?.type === state.type);
    if (existing) {
      existing.activate();
      return existing;
    }
    const leaf = this.attachLeaf();
    await leaf.setViewState(state);
    if (opts.activate === false) leaf.deactivate();
    else leaf.activate();
    this.scheduleSave();
    return leaf;
  }

  private attachLeaf(): WorkspaceLeaf {
    const leaf = new WorkspaceLeaf(this.app);
    this.leaves.push(leaf);
    this.mainContentEl.append(leaf.element);
    this.tabBarEl.append(leaf.tabEl);
    this.wireTab(leaf);
    this.renderTabs();
    return leaf;
  }

  async openLinkText(linktext: string, sourcePath: string): Promise<void> {
    const target = this.app.metadataCache.resolveLink(linktext, sourcePath);
    const file = target ? this.app.vault.getFileByPath(target) : this.app.vault.getFileByPath(linktext);
    if (file) await this.openFile(file);
    else this.app.notice(`No note found for "${linktext}"`);
  }

  setActiveLeaf(leaf: WorkspaceLeaf): void {
    if (this.activeLeaf === leaf) return;
    this.activeLeaf?.deactivate();
    this.activeLeaf = leaf;
    for (const other of this.leaves) other.element.classList.toggle('is-active', other === leaf);
    this.trigger('active-leaf-change', leaf);
    this.scheduleSave();
  }

  getActiveFile(): TFile | null {
    const view = this.activeLeaf?.view;
    return view instanceof FileView ? view.file : null;
  }

  getLeavesOfType(type: string): WorkspaceLeaf[] {
    return this.leaves.filter((leaf) => leaf.getViewState()?.type === type);
  }

  async closeLeaf(leaf: WorkspaceLeaf): Promise<void> {
    const idx = this.leaves.indexOf(leaf);
    if (idx < 0) return;
    this.leaves.splice(idx, 1);
    await leaf.destroy();
    if (this.activeLeaf === leaf) {
      this.activeLeaf = null;
      this.leaves.at(-1)?.activate();
      if (!this.activeLeaf) this.trigger('active-leaf-change', null);
    }
    this.renderTabs();
    this.scheduleSave();
  }

  async saveLayout(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const open = this.leaves
      .map((leaf) => (leaf.view instanceof FileView ? leaf.view.file?.path : null))
      .filter((path): path is string => Boolean(path));
    const state: WorkspaceState = {
      open,
      active: this.getActiveFile()?.path ?? null,
      leftWidth: this.leftEl.getBoundingClientRect().width || 260,
      rightWidth: this.rightEl.getBoundingClientRect().width || 260,
    };
    await this.app.config.writeJson('workspace.json', state);
  }

  private findLeaf(file: TFile): WorkspaceLeaf | undefined {
    return this.leaves.find((leaf) => leaf.view instanceof FileView && leaf.view.file?.path === file.path);
  }

  private wireTab(leaf: WorkspaceLeaf): void {
    leaf.tabEl.addEventListener('mousedown', (event) => {
      if ((event.target as HTMLElement).classList.contains('tab-close')) return;
      leaf.activate();
    });
    const closeEl = createEl('span', { cls: 'tab-close', text: '×', parent: leaf.tabEl });
    closeEl.addEventListener('click', (event) => {
      event.stopPropagation();
      void this.closeLeaf(leaf);
    });
    leaf.on('view-changed', () => {
      leaf.renderTab();
      this.scheduleSave();
    });
  }

  private renderTabs(): void {
    this.tabBarEl.classList.toggle('is-empty', this.leaves.length === 0);
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveLayout(), 500);
  }
}
