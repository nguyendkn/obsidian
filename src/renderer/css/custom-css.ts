import type { App } from '../core/app';

/**
 * Loads community themes and snippets from `.obsidian/` into <style> tags and
 * re-applies them when those files change on disk.
 */
export class CustomCss {
  private themeEl: HTMLStyleElement;
  private snippetEls = new Map<string, HTMLStyleElement>();
  private unwatch: (() => void) | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly app: App) {
    this.themeEl = createStyle('obsidian-theme');
  }

  async load(): Promise<void> {
    await this.reloadAll();
    this.unwatch?.();
    this.unwatch = this.app.vault.adapter.watch((relPath) => {
      if (!relPath.startsWith(this.app.config.dir + '/')) return;
      if (!/\.css$/.test(relPath)) return;
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => void this.reloadAll(), 250);
    });
  }

  async reloadAll(): Promise<void> {
    await this.reloadTheme();
    await this.reloadSnippets();
  }

  onVaultChange(path: string): void {
    if (path.startsWith(this.app.config.dir)) void this.reloadAll();
  }

  private async reloadTheme(): Promise<void> {
    const theme = this.app.config.getAppearance().cssTheme;
    if (!theme) {
      this.themeEl.textContent = '';
      document.body.removeAttribute('data-css-theme');
      return;
    }
    try {
      const css = await this.app.adapter.read(`${this.app.config.dir}/themes/${theme}/theme.css`);
      this.themeEl.textContent = css;
      document.body.dataset.cssTheme = theme;
    } catch {
      this.themeEl.textContent = '';
    }
  }

  private async reloadSnippets(): Promise<void> {
    const enabled = new Set(this.app.config.getAppearance().enabledSnippets);
    for (const [name, el] of this.snippetEls) {
      if (!enabled.has(name)) {
        el.remove();
        this.snippetEls.delete(name);
      }
    }
    for (const name of enabled) {
      try {
        const css = await this.app.adapter.read(`${this.app.config.dir}/snippets/${name}.css`);
        let el = this.snippetEls.get(name);
        if (!el) {
          el = createStyle(`obsidian-snippet-${name}`);
          this.snippetEls.set(name, el);
        }
        el.textContent = css;
      } catch {
        // Missing snippet: ignore, keep the rest working.
      }
    }
  }
}

function createStyle(id: string): HTMLStyleElement {
  const existing = document.getElementById(id);
  if (existing instanceof HTMLStyleElement) return existing;
  const el = document.createElement('style');
  el.id = id;
  document.head.append(el);
  return el;
}
