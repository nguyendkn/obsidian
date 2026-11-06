import { FileView } from './view';
import { MarkdownEditor } from '../editor/editor';
import { renderMarkdown } from '../markdown/renderer';
import { createDiv, createEl, debounce, empty } from '../core/dom';
import { resolveResourcePath } from '../core/resource';
import type { WorkspaceLeaf } from '../workspace/leaf';
import type { TFile } from '../core/vault';

/**
 * The note view: a CodeMirror source editor and a rendered preview sharing one
 * scroll position target, switched from the header.
 */
export class MarkdownView extends FileView {
  private editor: MarkdownEditor | null = null;
  private editorEl: HTMLElement;
  private previewEl: HTMLElement;
  private headerEl: HTMLElement;
  private titleEl: HTMLElement;
  private toggleEl: HTMLElement;
  private mode: 'preview' | 'source' = 'preview';
  private saveSoon = debounce(() => void this.save(), 600);
  private loading = false;
  private lastSource = '';

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.headerEl = createDiv({ cls: 'view-header' });
    this.titleEl = createDiv({ cls: 'inline-title', parent: this.headerEl });
    this.toggleEl = createDiv({ cls: 'mode-toggle', parent: this.headerEl });
    this.editorEl = createDiv({ cls: 'markdown-source' });
    this.previewEl = createDiv({ cls: 'markdown-preview' });
    this.containerEl.prepend(this.headerEl);
    this.contentEl.append(this.editorEl, this.previewEl);
    this.headerEl.addEventListener('dblclick', () => void this.renameFile());
    this.previewEl.addEventListener('click', (event) => this.handleClick(event));
    this.previewEl.addEventListener('change', (event) => this.handleCheckbox(event));
    this.app.vault.on('rename', (file: TFile) => {
      if (file === this.file) this.renderHeader();
    });
    this.app.vault.on('editor-config-changed', () => this.recreateEditor());
  }

  getViewType(): string {
    return 'markdown';
  }

  setState(state: Record<string, unknown>): void {
    const path = typeof state.file === 'string' ? state.file : null;
    if (!path) return;
    this.file = this.app.vault.getFileByPath(path);
    if (!this.file) {
      this.contentEl.textContent = `File not found: ${path}`;
      return;
    }
    this.mode = state.mode === 'source' ? 'source' : (this.app.config.getConfig().defaultMode ?? 'preview');
    this.renderHeader();
    void this.load();
  }

  async load(): Promise<void> {
    if (!this.file) return;
    this.loading = true;
    const text = await this.app.vault.read(this.file);
    this.lastSource = text;
    this.loading = false;
    if (this.mode === 'source') {
      this.ensureEditor();
      this.editor?.setValue(text);
      this.editorEl.classList.remove('is-hidden');
      this.previewEl.classList.add('is-hidden');
    } else {
      this.renderPreview(text);
      this.editorEl.classList.add('is-hidden');
      this.previewEl.classList.remove('is-hidden');
    }
  }

  getState(): Record<string, unknown> {
    return { file: this.file?.path, mode: this.mode };
  }

  /** Used by the outline to jump to a heading. */
  async revealLine(line: number): Promise<void> {
    this.mode = 'source';
    this.renderHeader();
    await this.load();
    this.editor?.setCursor(line);
  }

  private renderHeader(): void {
    this.titleEl.textContent = this.file?.basename ?? '';
    this.titleEl.classList.toggle('is-hidden', !this.app.config.getConfig().showInlineTitle);
    empty(this.toggleEl);
    for (const [mode, label] of [
      ['preview', 'Reading'],
      ['source', 'Editing'],
    ] as const) {
      createDiv({ cls: `mode-toggle-item${this.mode === mode ? ' is-active' : ''}`, text: label, parent: this.toggleEl }, (el) =>
        el.addEventListener('click', () => {
          this.mode = mode;
          void this.load();
          this.renderHeader();
        }),
      );
    }
    this.leaf.renderTab();
  }

  private ensureEditor(): MarkdownEditor {
    if (this.editor) return this.editor;
    const editorConfig = this.app.config.getConfig().editor;
    this.editor = new MarkdownEditor(this.editorEl, {
      app: this.app,
      sourcePath: () => this.file?.path ?? '',
      livePreviewEnabled: editorConfig.livePreview,
      showLineNumbers: editorConfig.showLineNumbers,
      lineWidth: editorConfig.lineWidth,
      onChange: () => {
        if (!this.loading) this.saveSoon();
      },
      onSave: () => void this.save(),
      onLinkClick: (href) => void this.openLink(href),
      onCheckboxToggle: (line, checked) => this.toggleCheckbox(line, checked),
    });
    return this.editor;
  }

  private recreateEditor(): void {
    if (!this.editor) return;
    const text = this.editor.getValue();
    const cursor = this.editor.view.state.selection.main.head;
    this.editor.destroy();
    this.editor = null;
    empty(this.editorEl);
    const editor = this.ensureEditor();
    editor.setValue(text);
    const doc = editor.view.state.doc;
    editor.view.dispatch({ selection: { anchor: Math.min(cursor, doc.length) } });
  }

  private async save(): Promise<void> {
    if (!this.file || !this.editor) return;
    const text = this.editor.getValue();
    if (text === this.lastSource) return;
    this.lastSource = text;
    await this.app.vault.modify(this.file, text);
  }

  private renderPreview(text: string): void {
    this.lastSource = text;
    empty(this.previewEl);
    const inner = createDiv({ cls: 'markdown-preview-inner' });
    inner.style.maxWidth = `${this.app.config.getConfig().editor.lineWidth}px`;
    this.previewEl.append(inner);
    renderMarkdown(this.app, text, inner, this.file?.path ?? '');
  }

  private handleClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest<HTMLElement>('a.internal-link, a.external-link');
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('data-href') ?? anchor.getAttribute('href') ?? '';
    void this.openLink(href);
  }

  private handleCheckbox(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.type !== 'checkbox') return;
    const listItem = input.closest('li.task-list-item');
    if (!listItem) return;
    const text = listItem.textContent ?? '';
    const line = this.findLineIndex(text);
    if (line >= 0) {
      const source = this.editor?.getValue() ?? this.lastSource;
      void this.toggleCheckboxInSource(line, input.checked, source);
    }
  }

  /** 1-based line number, matching CodeMirror's `doc.line().number`. */
  private findLineIndex(snippet: string): number {
    const needle = snippet.replace(/^\s*\[[ xX]\]\s*/, '').slice(0, 40).trim();
    return this.lastSource.split('\n').findIndex((line) => line.includes(needle)) + 1;
  }

  private async openLink(href: string): Promise<void> {
    if (/^https?:/i.test(href)) {
      void window.obsidianIpc?.openExternal(href);
      return;
    }
    if (!href) return;
    const resource = resolveResourcePath(this.app, href, this.file?.path ?? '');
    if (resource && !resource.endsWith('.md')) {
      void window.obsidianIpc?.openPath(`${this.app.vaultPath}/${resource}`);
      return;
    }
    await this.app.workspace.openLinkText(href, this.file?.path ?? '');
  }

  private toggleCheckbox(line: number, checked: boolean): void {
    const text = this.editor?.getValue();
    if (text == null) return;
    void this.toggleCheckboxInSource(line, checked, text);
  }

  private async toggleCheckboxInSource(line: number, checked: boolean, source: string): Promise<void> {
    if (!this.file) return;
    const lines = source.split('\n');
    const target = lines[line - 1];
    if (target == null) return;
    lines[line - 1] = target.replace(/\[[ xX-]\]/, checked ? '[x]' : '[ ]');
    await this.app.vault.modify(this.file, lines.join('\n'));
    if (this.mode === 'preview') this.renderPreview(lines.join('\n'));
  }

  private async renameFile(): Promise<void> {
    if (this.file) await this.app.fileManager.renameFile(this.file);
  }

  async onClose(): Promise<void> {
    this.saveSoon.cancel();
    await this.save();
    this.editor?.destroy();
    this.editor = null;
  }
}
