import { app } from 'electron';
import path from 'node:path';
import crypto from 'node:crypto';

export function rendererRoot(): string {
  return path.join(app.getAppPath(), 'dist', 'renderer');
}

export function userData(...parts: string[]): string {
  return path.join(app.getPath('userData'), ...parts);
}

export function pluginScriptRoot(vaultId: string): string {
  return userData('plugin-scripts', vaultId);
}

export function vaultIdFor(vaultPath: string): string {
  return crypto.createHash('sha1').update(path.resolve(vaultPath)).digest('hex').slice(0, 16);
}

/** Resolve a path and guarantee it stays inside `root` (path traversal guard). */
export function safeJoin(root: string, relative: string): string | null {
  const resolved = path.resolve(root, '.' + path.sep + relative);
  const normalizedRoot = path.resolve(root) + path.sep;
  return resolved.startsWith(normalizedRoot) ? resolved : null;
}
