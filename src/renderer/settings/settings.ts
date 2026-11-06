import { Modal } from '../ui/modal';
import { Setting } from '../ui/setting';
import { createDiv, empty } from '../core/dom';
import type { App } from '../core/app';

const TABS = ['Appearance', 'Editor', 'Plugins', 'About'] as const;
type Tab = (typeof TABS)[number];

/** The settings modal: theme, editor, plugin toggles and version info. */
export class Settings {
  constructor(private readonly app: App) {}

  open(tab: Tab = 'Appearance'): void {
    const modal = new Modal(this.app);
    modal.modalEl.classList.add('mod-settings');
    modal.titleEl.textContent = 'Settings';
    const body = createDiv({ cls: 'settings-body' });
    const nav = createDiv({ cls: 'settings-nav' });
    const panel = createDiv({ cls: 'settings-panel' });
    body.append(nav, panel);
    modal.contentEl.append(body);

    const render = (current: Tab) => {
      empty(panel);
      for (const button of nav.children) button.classList.toggle('is-active', button.textContent === current);
      if (current === 'Appearance') this.renderAppearance(panel);
      if (current === 'Editor') this.renderEditor(panel);
      if (current === 'Plugins') this.renderPlugins(panel);
      if (current === 'About') this.renderAbout(panel);
    };

    for (const tabName of TABS) {
      createDiv({ cls: 'settings-nav-item', text: tabName, parent: nav }, (el) =>
        el.addEventListener('click', () => render(tabName)),
      );
    }
    modal.open();
    render(tab);
  }

  private renderAppearance(panel: HTMLElement): void {
    const appearance = this.app.config.getAppearance();
    new Setting(panel)
      .setName('Base color scheme')
      .setDesc('Controls the default dark or light palette')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('dark', 'Dark')
          .addOption('light', 'Light')
          .addOption('system', 'Adapt to system')
          .setValue(this.app.config.getConfig().theme)
          .onChange((value) => {
            this.app.config.setConfig('theme', value as 'dark' | 'light' | 'system');
            this.app.applyTheme();
          });
      });

    new Setting(panel)
      .setName('Accent color')
      .setDesc('CSS color override applied to interactive elements')
      .addText((text) => {
        text.setValue(appearance.accentColor).onChange((value) => {
          this.app.config.setAppearance('accentColor', value);
          document.body.style.setProperty('--accent', value || '');
        });
      });

    const themes = createDiv({ cls: 'theme-list' });
    new Setting(panel).setName('Community themes').setDesc('Adds theme.css from .obsidian/themes').setHeading();
    panel.append(themes);
    void this.app.adapter.list(`${this.app.config.dir}/themes`).then((entries) => {
      const select = createDiv({ cls: 'theme-list-items' });
      createDiv({ cls: 'theme-chip', text: 'Default', parent: select }, (el) => {
        el.classList.toggle('is-active', !appearance.cssTheme);
        el.addEventListener('click', () => {
          this.app.config.setAppearance('cssTheme', '');
          void this.app.customCss.reloadAll();
          empty(panel);
          this.renderAppearance(panel);
        });
      });
      for (const entry of entries.filter((e) => e.type === 'folder')) {
        createDiv({ cls: 'theme-chip', text: entry.name, parent: select }, (el) => {
          el.classList.toggle('is-active', appearance.cssTheme === entry.name);
          el.addEventListener('click', () => {
            this.app.config.setAppearance('cssTheme', entry.name);
            void this.app.customCss.reloadAll();
            empty(panel);
            this.renderAppearance(panel);
          });
        });
      }
      themes.append(select);
    });

    new Setting(panel)
      .setName('Base font size')
      .setDesc('Pixels, applied to the document root')
      .addText((text) => {
        text.setValue(String(appearance.baseFontSize)).onChange((value) => {
          const size = Number(value) || 16;
          this.app.config.setAppearance('baseFontSize', size);
          document.documentElement.style.fontSize = `${size}px`;
        });
      });
  }

  private renderEditor(panel: HTMLElement): void {
    const editor = this.app.config.getConfig().editor;
    new Setting(panel)
      .setName('Live preview')
      .setDesc('Render embeds and hide formatting marks outside the cursor line')
      .addToggle((toggle) => {
        toggle.setValue(editor.livePreview).onChange((value) => {
          this.app.config.setConfig('editor', { ...editor, livePreview: value });
          this.app.vault.trigger('editor-config-changed');
        });
      });

    new Setting(panel)
      .setName('Show line numbers')
      .addToggle((toggle) => {
        toggle.setValue(editor.showLineNumbers).onChange((value) => {
          this.app.config.setConfig('editor', { ...editor, showLineNumbers: value });
          this.app.vault.trigger('editor-config-changed');
        });
      });

    new Setting(panel)
      .setName('Spellcheck')
      .addToggle((toggle) => {
        toggle.setValue(editor.spellcheck).onChange((value) => {
          this.app.config.setConfig('editor', { ...editor, spellcheck: value });
        });
      });

    new Setting(panel)
      .setName('Readable line width')
      .setDesc('Maximum editor width in pixels')
      .addText((text) => {
        text.setValue(String(editor.lineWidth)).onChange((value) => {
          const width = Number(value) || 700;
          this.app.config.setConfig('editor', { ...editor, lineWidth: width });
          document.documentElement.style.setProperty('--line-width', `${width}px`);
        });
      });
  }

  private renderPlugins(panel: HTMLElement): void {
    const manifests = [...this.app.plugins.manifests.values()];
    if (!manifests.length) {
      createDiv({ cls: 'settings-empty', text: 'No community plugins installed in .obsidian/plugins', parent: panel });
      return;
    }
    for (const manifest of manifests) {
      const enabled = this.app.plugins.isEnabled(manifest.id);
      new Setting(panel)
        .setName(manifest.name)
        .setDesc(`${manifest.description ?? ''} · v${manifest.version}`)
        .addButton((button) =>
          button.setButtonText('Reload').onClick(() => void this.app.plugins.reloadPlugin(manifest.id)),
        )
        .addToggle((toggle) => {
          toggle.setValue(enabled).onChange((value) => {
            void (value ? this.app.plugins.enablePlugin(manifest.id) : this.app.plugins.disablePlugin(manifest.id));
          });
        });
    }
    for (const tab of this.app.plugins.settingTabs) {
      tab.containerEl && panel.append(tab.containerEl);
    }
  }

  private renderAbout(panel: HTMLElement): void {
    const info = window.obsidianIpc?.version();
    new Setting(panel)
      .setName('Obsidian Arch')
      .setDesc('Independent educational reimplementation of the Obsidian desktop architecture.')
    createDiv({
      cls: 'settings-credits',
      text: info
        ? `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`
        : 'Running outside Electron',
      parent: panel,
    });
  }
}
