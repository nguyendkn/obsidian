import { promises as fs } from 'node:fs';
import path from 'node:path';
import { userData, vaultIdFor } from './paths';
import type { VaultRecord, VaultRegistry as RegistryData } from '../shared/types';

const REGISTRY_FILE = () => userData('vaults.json');

export class VaultRegistry {
  private data: RegistryData = { vaults: {} };
  private loaded = false;

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(REGISTRY_FILE(), 'utf8');
      const parsed = JSON.parse(raw) as RegistryData;
      if (parsed && typeof parsed.vaults === 'object') this.data = parsed;
    } catch {
      this.data = { vaults: {} };
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(REGISTRY_FILE()), { recursive: true });
    await fs.writeFile(REGISTRY_FILE(), JSON.stringify(this.data, null, 2), 'utf8');
  }

  async list(): Promise<Array<{ id: string; path: string; name: string; ts: number }>> {
    await this.load();
    return Object.entries(this.data.vaults)
      .map(([id, rec]) => ({ id, path: rec.path, name: path.basename(rec.path), ts: rec.ts }))
      .sort((a, b) => b.ts - a.ts);
  }

  async add(vaultPath: string): Promise<string> {
    await this.load();
    const id = vaultIdFor(vaultPath);
    this.data.vaults[id] = { path: vaultPath, ts: Date.now() };
    await this.save();
    return id;
  }

  async remove(id: string): Promise<void> {
    await this.load();
    delete this.data.vaults[id];
    await this.save();
  }

  async touch(id: string): Promise<void> {
    await this.load();
    const rec = this.data.vaults[id] as VaultRecord | undefined;
    if (rec) rec.ts = Date.now();
    await this.save();
  }

  async get(id: string): Promise<VaultRecord | undefined> {
    await this.load();
    return this.data.vaults[id];
  }
}
