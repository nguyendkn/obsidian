/** Base modal + promise helper, mirroring Obsidian's Modal API. */
export class Modal {
  app?: unknown;
  containerEl: HTMLElement;
  modalEl: HTMLElement;
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  private backdrop: HTMLElement;
  private keyHandler = (evt: KeyboardEvent) => {
    if (evt.key === 'Escape') this.close();
  };

  constructor(app?: unknown) {
    this.app = app;
    this.backdrop = createDiv({ cls: 'modal-backdrop' });
    this.modalEl = createDiv({ cls: 'modal' });
    this.titleEl = createDiv({ cls: 'modal-title' });
    this.contentEl = createDiv({ cls: 'modal-content' });
    this.containerEl = createDiv({ cls: 'modal-container' });
    this.modalEl.append(this.titleEl, this.contentEl);
    this.containerEl.append(this.modalEl);
    this.backdrop.addEventListener('click', () => this.close());
    this.containerEl.addEventListener('mousedown', (evt) => {
      if (evt.target === this.containerEl) this.close();
    });
  }

  open(): void {
    document.body.append(this.containerEl, this.backdrop);
    document.addEventListener('keydown', this.keyHandler);
    this.onOpen();
    requestAnimationFrame(() => this.containerEl.classList.add('is-open'));
  }

  close(): void {
    document.removeEventListener('keydown', this.keyHandler);
    this.containerEl.classList.remove('is-open');
    this.onClose();
    setTimeout(() => {
      this.containerEl.remove();
      this.backdrop.remove();
    }, 150);
  }

  onOpen(): void {}
  onClose(): void {}
}

export function promptText(app: unknown, title: string, initial = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    modal.titleEl.textContent = title;
    const input = createEl('input', { cls: 'modal-input', type: 'text', parent: modal.contentEl });
    input.value = initial;
    const actions = createDiv({ cls: 'modal-actions', parent: modal.contentEl });
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      modal.close();
      resolve(value);
    };
    createEl('button', { cls: 'btn', text: 'Cancel', parent: actions }, (el) =>
      el.addEventListener('click', () => finish(null)),
    );
    createEl('button', { cls: 'btn btn-primary', text: 'OK', parent: actions }, (el) =>
      el.addEventListener('click', () => finish(input.value)),
    );
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') finish(input.value);
    });
    modal.onClose = () => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    };
    modal.open();
    setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
  });
}

export function confirmText(app: unknown, title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    modal.titleEl.textContent = title;
    createEl('p', { cls: 'modal-message', text: message, parent: modal.contentEl });
    const actions = createDiv({ cls: 'modal-actions', parent: modal.contentEl });
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      modal.close();
      resolve(value);
    };
    createEl('button', { cls: 'btn', text: 'Cancel', parent: actions }, (el) =>
      el.addEventListener('click', () => finish(false)),
    );
    createEl('button', { cls: 'btn btn-danger', text: 'Delete', parent: actions }, (el) =>
      el.addEventListener('click', () => finish(true)),
    );
    modal.onClose = () => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    };
    modal.open();
  });
}
