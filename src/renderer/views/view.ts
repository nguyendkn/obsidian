import { Events } from '../core/events';
import { createDiv, createEl, empty } from '../core/dom';
import type { App } from '../core/app';
import type { WorkspaceLeaf } from '../workspace/leaf';
import type { TFile } from '../core/vault';

export interface ViewState {
  type: string;
  state?: Record<string, unknown>;
  active?: boolean;
}

export type ViewCreator = (leaf: WorkspaceLeaf) => View;

export class View extends Events {
  app: App;
  leaf: WorkspaceLeaf;
  containerEl: HTMLElement;
  private actionEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super();
    this.leaf = leaf;
    this.app = leaf.app;
    this.containerEl = createDiv({ cls: 'view' });
  }

  getViewType(): string {
    return 'empty';
  }

  getDisplayText(): string {
    return '';
  }

  getIcon(): string {
    return 'document';
  }

  async onOpen(): Promise<void> {}

  async onClose(): Promise<void> {}

  getState(): Record<string, unknown> {
    return {};
  }

  setState(_state: Record<string, unknown>): void {}

  addAction(icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement {
    this.actionEl ??= createDiv({ cls: 'view-actions', parent: this.containerEl });
    return createEl('button', { cls: 'view-action', attr: { 'aria-label': title }, parent: this.actionEl }, (el) => {
      el.setAttribute('data-icon', icon);
      el.textContent = icon;
      el.addEventListener('click', callback);
    });
  }
}

export class ItemView extends View {
  contentEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.contentEl = createDiv({ cls: 'view-content', parent: this.containerEl });
  }

  get contentContainer(): HTMLElement {
    return this.contentEl;
  }
}

export class FileView extends ItemView {
  file: TFile | null = null;

  setFile(file: TFile | null): void {
    this.file = file;
    if (file) this.contentEl.setAttribute('data-path', file.path);
  }

  getDisplayText(): string {
    return this.file?.basename ?? '';
  }
}

export class ViewRegistry {
  private creators = new Map<string, ViewCreator>();

  register(type: string, creator: ViewCreator): void {
    this.creators.set(type, creator);
  }

  unregister(type: string): void {
    this.creators.delete(type);
  }

  get(type: string): ViewCreator | undefined {
    return this.creators.get(type);
  }

  create(type: string, leaf: WorkspaceLeaf): View | null {
    const creator = this.creators.get(type);
    return creator ? creator(leaf) : null;
  }
}

/** Utility used by views that rebuild their DOM from data. */
export function rerender(el: HTMLElement, build: () => void): void {
  empty(el);
  build();
}
