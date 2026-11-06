import type { FileSystemAdapter } from './adapter';

export interface EditorOptions {
  livePreview: boolean;
  spellcheck: boolean;
  showLineNumbers: boolean;
  lineWidth: number;
  fontSize: number;
}

export interface AppConfig {
  theme: 'dark' | 'light' | 'system';
  editor: EditorOptions;
  showInlineTitle: boolean;
  defaultMode: 'preview' | 'source';
  attachFolder: string;
}

export interface AppearanceConfig {
  cssTheme: string;
  enabledSnippets: string[];
  baseFontSize: number;
  accentColor: string;
}

const APP_DEFAULTS: AppConfig = {
  theme: 'dark',
  editor: { livePreview: true, spellcheck: true, showLineNumbers: false, lineWidth: 700, fontSize: 16 },
  showInlineTitle: true,
  defaultMode: 'preview',
  attachFolder: '',
};

const APPEARANCE_DEFAULTS: AppearanceConfig = {
  cssTheme: '',
  enabledSnippets: [],
  baseFontSize: 16,
  accentColor: '',
};

type Json = Record<string, unknown>;

/** Reads/writes `.obsidian/*.json`, splitting config by concern like Obsidian does. */
export class ConfigManager {
  private appJson: AppConfig = structuredClone(APP_DEFAULTS);
  private appearanceJson: AppearanceConfig = structuredClone(APPEARANCE_DEFAULTS);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  readonly dir: string;

  constructor(private readonly adapter: FileSystemAdapter, private readonly configDir = '.obsidian') {
    this.dir = configDir;
  }

  async load(): Promise<void> {
    const app = await this.readJson('app.json');
    const appearance = await this.readJson('appearance.json');
    this.appJson = this.merge(APP_DEFAULTS, app) as AppConfig;
    this.appearanceJson = this.merge(APPEARANCE_DEFAULTS, appearance) as AppearanceConfig;
    this.appJson.editor = this.merge(APP_DEFAULTS.editor, (app.editor as Json) ?? {}) as EditorOptions;
  }

  getConfig(): AppConfig {
    return this.appJson;
  }

  setConfig<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.appJson[key] = value;
    this.scheduleSave();
  }

  getAppearance(): AppearanceConfig {
    return this.appearanceJson;
  }

  setAppearance<K extends keyof AppearanceConfig>(key: K, value: AppearanceConfig[K]): void {
    this.appearanceJson[key] = value;
    this.scheduleSave();
  }

  async readJson(name: string): Promise<Json> {
    try {
      return JSON.parse(await this.adapter.read(`${this.configDir}/${name}`)) as Json;
    } catch {
      return {};
    }
  }

  async writeJson(name: string, value: unknown): Promise<void> {
    await this.adapter.write(`${this.configDir}/${name}`, JSON.stringify(value, null, 2));
  }

  async readPluginList(): Promise<string[]> {
    const enabled = await this.readJson('community-plugins.json');
    return Array.isArray(enabled) ? (enabled as string[]) : [];
  }

  async saveNow(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await Promise.all([
      this.writeJson('app.json', this.appJson),
      this.writeJson('appearance.json', this.appearanceJson),
    ]);
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), 400);
  }

  private merge(base: unknown, override: unknown): unknown {
    if (Array.isArray(base)) return Array.isArray(override) ? override : base;
    if (base && typeof base === 'object' && override && typeof override === 'object') {
      const out: Json = { ...(base as Json) };
      for (const [key, value] of Object.entries(override as Json)) {
        out[key] = key in (base as Json) ? this.merge((base as Json)[key], value) : value;
      }
      return out;
    }
    return override === undefined ? base : override;
  }
}
