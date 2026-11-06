/** Transient toast, equivalent to Obsidian's `new Notice(message)`. */
export class Notice {
  private static host: HTMLElement | null = null;
  private el: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(message: string | DocumentFragment, duration = 4000) {
    const host = Notice.host ?? (Notice.host = Notice.mountHost());
    this.el = createDiv({ cls: 'notice' }, (el) => {
      if (typeof message === 'string') el.textContent = message;
      else el.append(message);
    });
    host.append(this.el);
    requestAnimationFrame(() => this.el.classList.add('is-visible'));
    this.timer = setTimeout(() => this.hide(), duration);
  }

  setMessage(message: string): void {
    this.el.textContent = message;
  }

  hide(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.el.classList.remove('is-visible');
    setTimeout(() => this.el.remove(), 250);
  }

  private static mountHost(): HTMLElement {
    const existing = document.querySelector<HTMLElement>('.notice-container');
    if (existing) return existing;
    const host = createDiv({ cls: 'notice-container' });
    document.body.append(host);
    return host;
  }
}
