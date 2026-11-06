import { Events } from '../core/events';
import { createDiv } from '../core/dom';
import type { App } from '../core/app';
import type { TFile } from '../core/vault';
import type { View, ViewState } from '../views/view';

let leafCounter = 0;

/** A single tab: owns exactly one View at a time. */
export class WorkspaceLeaf extends Events {
  id = `leaf-${++leafCounter}`;
  app: App;
  view: View | null = null;
  element: HTMLElement;
  tabEl: HTMLElement;
  private state: ViewState | null = null;

  constructor(app: App) {
    super();
    this.app = app;
    this.element = createDiv({ cls: 'leaf' });
    this.tabEl = createDiv({ cls: 'tab', attr: { 'data-leaf-id': this.id } });
  }

  async setViewState(state: ViewState): Promise<void> {
    this.state = state;
    const view = this.app.viewRegistry.create(state.type, this);
    if (!view) {
      console.warn(`[workspace] unknown view type "${state.type}"`);
      return;
    }
    await this.detach();
    this.view = view;
    this.element.append(view.containerEl);
    view.setState(state.state ?? {});
    view.containerEl.dataset.viewType = state.type;
    if (state.active !== false) this.activate();
    this.renderTab();
    await view.onOpen();
    this.trigger('view-changed');
  }

  async openFile(file: TFile, state?: Record<string, unknown>): Promise<void> {
    await this.setViewState({ type: 'markdown', state: { file: file.path, ...state } });
  }

  activate(): void {
    if (this.state) this.state.active = true;
    this.tabEl.classList.add('is-active');
    this.element.classList.add('is-active');
    this.app.workspace.setActiveLeaf(this);
  }

  deactivate(): void {
    if (this.state) this.state.active = false;
    this.tabEl.classList.remove('is-active');
    this.element.classList.remove('is-active');
  }

  getDisplayText(): string {
    return this.view?.getDisplayText() || 'Untitled';
  }

  getViewState(): ViewState | null {
    return this.state;
  }

  async detach(): Promise<void> {
    if (this.view) {
      await this.view.onClose();
      this.view.containerEl.remove();
      this.view = null;
    }
  }

  async destroy(): Promise<void> {
    await this.detach();
    this.tabEl.remove();
    this.element.remove();
  }

  renderTab(): void {
    if (!this.view) return;
    this.tabEl.textContent = this.getDisplayText();
    this.tabEl.title = this.getDisplayText();
    this.tabEl.dataset.viewType = this.view.getViewType();
  }
}
