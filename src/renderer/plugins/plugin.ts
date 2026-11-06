import type { App } from '../core/app';
import type { Command } from '../core/commands';
import { Events } from '../core/events';
import type { ViewCreator } from '../views/view';
import { Setting } from '../ui/setting';
import type { PluginManager } from './manager';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  description?: string;
  author?: string;
  isDesktopOnly?: boolean;
}

export interface MarkdownPostProcessorContext {
  docId: string;
  sourcePath: string;
  frontmatter: Record<string, unknown> | undefined;
  addChild(el: HTMLElement): void;
}

export type MarkdownPostProcessor = (
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
) => Promise<void> | void;

export interface EventRef {
  event: Events;
  name: string;
  callback: (...args: any[]) => void;
}

export abstract class Plugin {
  app: App;
  manifest: PluginManifest;
  private data: unknown = null;
  private disposers: Array<() => void> = [];

  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }

  abstract onload(): Promise<void> | void;
  onunload(): void {}

  addCommand(command: Command): Command {
    this.app.commands.addCommand(command);
    this.disposers.push(() => this.app.commands.removeCommand(command.id));
    return command;
  }

  addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement {
    const el = createDiv({ cls: 'ribbon-item', title });
    el.dataset.icon = icon;
    el.textContent = icon;
    el.addEventListener('click', callback);
    return el;
  }

  registerView(type: string, creator: ViewCreator): void {
    this.app.viewRegistry.register(type, creator);
    this.disposers.push(() => this.app.viewRegistry.unregister(type));
  }

  addSettingTab(tab: PluginSettingTab): void {
    const manager = this.app.plugins as PluginManager;
    manager.settingTabs.push(tab);
    this.disposers.push(() => {
      const idx = manager.settingTabs.indexOf(tab);
      if (idx >= 0) manager.settingTabs.splice(idx, 1);
    });
  }

  registerMarkdownPostProcessor(processor: MarkdownPostProcessor): void {
    const manager = this.app.plugins as PluginManager;
    manager.postProcessors.push(processor);
    this.disposers.push(() => {
      const idx = manager.postProcessors.indexOf(processor);
      if (idx >= 0) manager.postProcessors.splice(idx, 1);
    });
  }

  registerEvent(ref: EventRef): void {
    ref.event.on(ref.name, ref.callback);
    this.disposers.push(() => ref.event.off(ref.name, ref.callback));
  }

  registerDomEvent<K extends keyof HTMLElementEventMap>(
    el: HTMLElement | Window | Document,
    type: K | string,
    callback: (evt: any) => void,
  ): void {
    (el as EventTarget).addEventListener(type, callback as EventListener);
    this.disposers.push(() => (el as EventTarget).removeEventListener(type, callback as EventListener));
  }

  registerInterval(id: number): number {
    this.disposers.push(() => window.clearInterval(id));
    return id;
  }

  async loadData(): Promise<any> {
    if (this.data !== null) return this.data;
    try {
      const raw = await this.app.adapter.read(`${this.app.config.dir}/plugins/${this.manifest.id}/data.json`);
      this.data = JSON.parse(raw);
    } catch {
      this.data = {};
    }
    return this.data;
  }

  async saveData(data: unknown): Promise<void> {
    this.data = data;
    await this.app.adapter.write(
      `${this.app.config.dir}/plugins/${this.manifest.id}/data.json`,
      JSON.stringify(data, null, 2),
    );
  }

  dispose(): void {
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose();
      } catch (err) {
        console.error(`[plugin:${this.manifest.id}] dispose failed`, err);
      }
    }
  }
}

export abstract class PluginSettingTab {
  app: App;
  containerEl: HTMLElement;
  plugin: Plugin;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = createDiv({ cls: 'plugin-settings' });
  }

  abstract display(): void;
  hide(): void {}

  addSetting(): Setting {
    return new Setting(this.containerEl);
  }
}
