import { ItemView } from './view';
import { createDiv, createEl, empty } from '../core/dom';
import type { TFile } from '../core/vault';
import type { WorkspaceLeaf } from '../workspace/leaf';

/** Right sidebar: outline, linked mentions and unresolved mentions. */
export class BacklinksView extends ItemView {
  private bodyEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.containerEl.classList.add('backlinks-view');
    const header = createDiv({ cls: 'view-header', parent: this.containerEl });
    createDiv({ cls: 'view-header-title', text: 'Backlinks', parent: header });
    this.bodyEl = createDiv({ cls: 'backlinks-body', parent: this.containerEl });

    this.app.workspace.on('active-leaf-change', () => this.render());
    this.app.metadataCache.on('resolved', () => this.render());
    this.app.metadataCache.on('changed', () => this.render());
  }

  getViewType(): string {
    return 'backlinks';
  }

  getDisplayText(): string {
    return 'Backlinks';
  }

  getIcon(): string {
    return 'links';
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  private render(): void {
    empty(this.bodyEl);
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      createDiv({ cls: 'backlinks-empty', text: 'No active note', parent: this.bodyEl });
      return;
    }
    this.renderOutline(file);
    this.renderLinked(file);
    this.renderUnlinked(file);
  }

  private renderOutline(file: TFile): void {
    const headings = this.app.metadataCache.getCache(file.path)?.headings ?? [];
    const section = this.section('Outline');
    if (!headings.length) {
      createDiv({ cls: 'backlinks-empty', text: 'No headings', parent: section });
      return;
    }
    for (const heading of headings) {
      createDiv({
        cls: 'outline-item',
        text: heading.heading,
        parent: section,
        attr: { 'data-line': heading.position.start.line + 1 },
      }, (el) => {
        el.style.paddingLeft = `${(heading.level - 1) * 12}px`;
        el.addEventListener('click', () => {
          const view = this.app.workspace.activeLeaf?.view as unknown as
            | { revealLine?: (line: number) => void }
            | null;
          view?.revealLine?.(heading.position.start.line + 1);
        });
      });
    }
  }

  private renderLinked(file: TFile): void {
    const section = this.section('Linked mentions');
    const backlinks = this.app.metadataCache.getBacklinks(file.path);
    if (!backlinks.length) {
      createDiv({ cls: 'backlinks-empty', text: 'No linked mentions', parent: section });
      return;
    }
    for (const { source, count } of backlinks) {
      createDiv({ cls: 'backlink-item', text: `${source} (${count})`, parent: section }, (el) =>
        el.addEventListener('click', () => {
          const target = this.app.vault.getFileByPath(source);
          if (target) void this.app.workspace.openFile(target);
        }),
      );
    }
  }

  private renderUnlinked(file: TFile): void {
    const section = this.section('Unlinked mentions');
    const unresolved = Object.entries(this.app.metadataCache.unresolvedLinks)
      .filter(([, links]) => Object.keys(links).some((link) => link.toLowerCase() === file.basename.toLowerCase()))
      .map(([source]) => source);
    if (!unresolved.length) {
      createDiv({ cls: 'backlinks-empty', text: 'No unlinked mentions', parent: section });
      return;
    }
    for (const source of unresolved) {
      createDiv({ cls: 'backlink-item is-unlinked', text: source, parent: section }, (el) =>
        el.addEventListener('click', () => {
          const target = this.app.vault.getFileByPath(source);
          if (target) void this.app.workspace.openFile(target);
        }),
      );
    }
  }

  private section(title: string): HTMLElement {
    const wrapper = createDiv({ cls: 'backlinks-section', parent: this.bodyEl });
    const header = createDiv({ cls: 'backlinks-section-title', text: title, parent: wrapper });
    const content = createDiv({ cls: 'backlinks-section-content', parent: wrapper });
    header.addEventListener('click', () => content.classList.toggle('is-collapsed'));
    return content;
  }
}
