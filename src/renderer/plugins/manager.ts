import type { App } from '../core/app';
import {
  Plugin,
  type MarkdownPostProcessor,
  type PluginManifest,
  type PluginSettingTab,
} from './plugin';
import { buildObsidianApi } from './api';

interface LoadedModule {
  exports: any;
}

/**
 * Loads `community-plugins.json` and evaluates each plugin's main.js inside a
 * CommonJS shim, with `require('obsidian')` routed to our own API surface.
 */
export class PluginManager {
  plugins = new Map<string, Plugin>();
  manifests = new Map<string, PluginManifest>();
  enabled = new Set<string>();
  postProcessors: MarkdownPostProcessor[] = [];
  settingTabs: PluginSettingTab[] = [];
  private api = buildObsidianApi();

  constructor(private readonly app: App) {}

  async initialize(): Promise<void> {
    await this.discover();
    const enabled = await this.app.config.readPluginList();
    for (const id of enabled) {
      try {
        await this.enablePlugin(id);
      } catch (err) {
        console.error(`[plugin:${id}] failed to load`, err);
      }
    }
  }

  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  isEnabled(id: string): boolean {
    return this.plugins.has(id);
  }

  async enablePlugin(id: string): Promise<void> {
    if (this.plugins.has(id)) return;
    const manifest = this.manifests.get(id);
    if (!manifest) throw new Error(`Unknown plugin: ${id}`);
    const instance = await this.instantiate(manifest);
    this.plugins.set(id, instance);
    this.enabled.add(id);
    await this.persistEnabled();
    await instance.onload();
  }

  async disablePlugin(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    try {
      plugin.onunload();
    } finally {
      plugin.dispose();
    }
    this.plugins.delete(id);
    this.enabled.delete(id);
    await this.persistEnabled();
  }

  async reloadPlugin(id: string): Promise<void> {
    const wasEnabled = this.plugins.has(id);
    if (wasEnabled) await this.disablePlugin(id);
    if (wasEnabled) await this.enablePlugin(id);
  }

  private async discover(): Promise<void> {
    let entries: Array<{ name: string; type: string }> = [];
    try {
      entries = await this.app.adapter.list(`${this.app.config.dir}/plugins`);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.type !== 'folder') continue;
      try {
        const raw = await this.app.adapter.read(`${this.app.config.dir}/plugins/${entry.name}/manifest.json`);
        const manifest = JSON.parse(raw) as PluginManifest;
        if (manifest.id) this.manifests.set(manifest.id, manifest);
      } catch {
        // Plugin without a manifest is skipped.
      }
    }
  }

  private async instantiate(manifest: PluginManifest): Promise<Plugin> {
    const base = `${this.app.config.dir}/plugins/${manifest.id}`;
    const code = await this.app.adapter.read(`${base}/main.js`);
    const module: LoadedModule = { exports: {} };
    const req = (id: string) => this.requireForPlugin(id);
    const factory = new Function('module', 'exports', 'require', 'app', code);
    factory(module, module.exports, req, this.app);
    const exported: any = (module.exports as any).default ?? module.exports;
    if (typeof exported !== 'function') {
      throw new Error(`Plugin ${manifest.id} did not export a class`);
    }
    const instance = new exported(this.app, manifest) as Plugin;
    instance.app = this.app;
    instance.manifest = manifest;
    return instance;
  }

  private requireForPlugin(id: string): any {
    if (id === 'obsidian') return this.api;
    // Electron's renderer has Node available; fall back to real modules.
    try {
      return require(id);
    } catch {
      throw new Error(`Cannot find module "${id}"`);
    }
  }

  private async persistEnabled(): Promise<void> {
    await this.app.config.writeJson('community-plugins.json', [...this.enabled].sort());
  }
}
