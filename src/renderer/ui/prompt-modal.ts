import { Modal } from './modal';
import { createDiv, createEl, empty } from '../core/dom';
import { rankByFuzzy } from './fuzzy';

export interface PromptItem {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
}

export interface PromptOptions {
  placeholder?: string;
  /** Full candidate list for a query; ranking/filtering happens in the modal. */
  getItems: (query: string) => PromptItem[];
  /** Called on Enter when nothing matches (e.g. "create this note"). */
  onEmpty?: (query: string) => void;
}

/** Input + fuzzy-filtered result list shared by the palette and quick switcher. */
export class PromptModal extends Modal {
  protected inputEl: HTMLInputElement;
  protected resultsEl: HTMLElement;
  private getItems: (query: string) => PromptItem[];
  private onEmpty?: (query: string) => void;
  private filtered: PromptItem[] = [];
  private selected = 0;

  constructor(app: unknown, options: PromptOptions) {
    super(app);
    this.getItems = options.getItems;
    this.onEmpty = options.onEmpty;
    this.modalEl.classList.add('prompt-modal');
    this.titleEl.remove();
    this.inputEl = createEl('input', {
      cls: 'prompt-input',
      type: 'text',
      placeholder: options.placeholder ?? '',
      parent: this.contentEl,
    });
    this.resultsEl = createDiv({ cls: 'prompt-results', parent: this.contentEl });
    this.inputEl.addEventListener('input', () => this.refresh());
    this.inputEl.addEventListener('keydown', (event) => this.onKey(event));
  }

  open(): void {
    this.refresh();
    super.open();
    setTimeout(() => this.inputEl.focus(), 20);
  }

  protected refresh(): void {
    const query = this.inputEl.value;
    const items = this.getItems(query);
    this.filtered = query.trim()
      ? rankByFuzzy(query, items, (item) => item.label).map((entry) => entry.item)
      : items;
    this.selected = Math.min(this.selected, Math.max(0, this.filtered.length - 1));
    this.render();
  }

  private render(): void {
    empty(this.resultsEl);
    if (!this.filtered.length) {
      createDiv({ cls: 'prompt-empty', text: this.inputEl.value ? 'No matches' : 'Type to search', parent: this.resultsEl });
      return;
    }
    this.filtered.forEach((item, index) => {
      const row = createDiv({
        cls: `prompt-result${index === this.selected ? ' is-selected' : ''}`,
        parent: this.resultsEl,
      });
      createDiv({ cls: 'prompt-result-label', text: item.label, parent: row });
      if (item.hint) createDiv({ cls: 'prompt-result-hint', text: item.hint, parent: row });
      row.addEventListener('mousemove', () => {
        if (this.selected === index) return;
        this.selected = index;
        this.render();
      });
      row.addEventListener('click', () => this.choose(item));
    });
  }

  private onKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || (event.key === 'n' && event.ctrlKey)) {
      event.preventDefault();
      this.move(1);
    } else if (event.key === 'ArrowUp' || (event.key === 'p' && event.ctrlKey)) {
      event.preventDefault();
      this.move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = this.filtered[this.selected];
      if (item) this.choose(item);
      else if (this.onEmpty) {
        this.close();
        this.onEmpty(this.inputEl.value);
      }
    }
  }

  private move(delta: number): void {
    if (!this.filtered.length) return;
    this.selected = (this.selected + delta + this.filtered.length) % this.filtered.length;
    this.render();
    this.resultsEl.children[this.selected]?.scrollIntoView({ block: 'nearest' });
  }

  private choose(item: PromptItem): void {
    this.close();
    item.action();
  }
}
