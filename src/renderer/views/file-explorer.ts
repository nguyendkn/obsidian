import { ItemView } from './view';
import { createDiv, createEl, empty } from '../core/dom';
import { TFile, TFolder } from '../core/vault';
import type { TAbstractFile } from '../core/vault';

const FILE_ICONS: Record<string, string> = { md: '▤', png: '▣', jpg: '▣', jpeg: '▣', gif: '▣', pdf: '▤', canvas: '◈' };

/** Sidebar tree sorted folders-first, with per-folder collapse state. */
export class FileExplorerView extends ItemView {
  private treeEl: HTMLElement;
  private collapsed = new Set<string>();

  constructor(leaf: import('../workspace/leaf').WorkspaceLeaf) {
    super(leaf);
    this.containerEl.classList.add('file-explorer');
    const header = createDiv({ cls: 'view-header', parent: this.containerEl });
    createDiv({ cls: 'view-header-title', text: this.app.vault.getName() || 'Vault', parent: header });
    createEl('button', { cls: 'view-header-action', text: '+', attr: { title: 'New note' }, parent: header }, (el) =>
      el.addEventListener('click', () => void this.app.fileManager.createMarkdownFile(this.selectedFolder())),
    );
    this.treeEl = createDiv({ cls: 'nav-files', parent: this.containerEl });
    this.contentEl.append(this.treeEl);
    this.registerVaultEvents();
  }

  getViewType(): string {
    return 'file-explorer';
  }

  getDisplayText(): string {
    return 'Files';
  }

  getIcon(): string {
    return 'folder';
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  private registerVaultEvents(): void {
    for (const event of ['create', 'delete', 'rename'] as const) {
      this.app.vault.on(event, () => this.render());
    }
    this.app.workspace.on('active-leaf-change', () => this.highlightActive());
  }

  private render(): void {
    empty(this.treeEl);
    this.renderFolder(this.app.vault.root, this.treeEl);
    this.highlightActive();
  }

  private renderFolder(folder: TFolder, parent: HTMLElement): void {
    const children = [...folder.children].sort((a, b) => {
      const aFolder = a instanceof TFolder ? 0 : 1;
      const bFolder = b instanceof TFolder ? 0 : 1;
      return aFolder - bFolder || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    for (const child of children) {
      if (child instanceof TFolder) {
        const isCollapsed = this.collapsed.has(child.path);
        const row = createDiv({ cls: 'nav-folder-title', parent, attr: { 'data-path': child.path } });
        createEl('span', { cls: `nav-arrow${isCollapsed ? '' : ' is-open'}`, text: '▸', parent: row });
        createEl('span', { cls: 'nav-folder-name', text: child.name, parent: row });
        row.addEventListener('click', () => {
          if (isCollapsed) this.collapsed.delete(child.path);
          else this.collapsed.add(child.path);
          this.render();
        });
        this.attachMenu(row, child);
        if (!isCollapsed) {
          const sub = createDiv({ cls: 'nav-folder-children', parent });
          this.renderFolder(child, sub);
        }
      } else if (child instanceof TFile) {
        const row = createDiv({ cls: 'nav-file-title', parent, attr: { 'data-path': child.path } });
        createEl('span', { cls: 'nav-file-icon', text: FILE_ICONS[child.extension] ?? '▫', parent: row });
        createEl('span', { cls: 'nav-file-name', text: child.basename, parent: row });
        row.addEventListener('click', () => void this.app.workspace.openFile(child));
        this.attachMenu(row, child);
      }
    }
  }

  private attachMenu(row: HTMLElement, file: TAbstractFile): void {
    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      void window.obsidianIpc
        ?.contextMenu([
          { id: 'new-note', label: 'New note' },
          { id: 'new-folder', label: 'New folder' },
          { type: 'separator' },
          { id: 'rename', label: 'Rename…' },
          { id: 'delete', label: 'Delete' },
        ])
        .then((choice) => {
          if (choice === 'new-note') {
            const folder = file instanceof TFolder ? file : file.parent ?? undefined;
            void this.app.fileManager.createMarkdownFile(folder);
          }
          if (choice === 'new-folder') {
            void this.app.fileManager.createFolderInteractive(file instanceof TFolder ? file : file.parent ?? undefined);
          }
          if (choice === 'rename') void this.app.fileManager.renameFile(file);
          if (choice === 'delete') void this.app.fileManager.deleteFile(file);
        });
    });
  }

  private highlightActive(): void {
    const active = this.app.workspace.getActiveFile();
    for (const row of this.treeEl.querySelectorAll<HTMLElement>('.nav-file-title')) {
      row.classList.toggle('is-active', row.dataset.path === active?.path);
    }
  }

  private selectedFolder(): TFolder | undefined {
    const active = this.app.workspace.getActiveFile();
    return active?.parent ?? undefined;
  }
}
