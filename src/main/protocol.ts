import { protocol } from 'electron';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { pluginScriptRoot, rendererRoot, safeJoin, vaultIdFor } from './paths';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
};

function mimeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** Vault roots the renderer is allowed to read through app://_local/. */
const vaultRoots = new Map<string, string>();

export function registerVaultRoot(vaultId: string, root: string): void {
  vaultRoots.set(vaultId, path.resolve(root));
}

/** Map an app:// URL to a file on disk inside an allowed root. */
function resolveTarget(url: URL): string | null {
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith('/_plugin/')) {
    const parts = pathname.slice('/_plugin/'.length).split('/');
    const vaultId = parts.shift();
    if (!vaultId) return null;
    return safeJoin(pluginScriptRoot(vaultId), parts.join('/'));
  }
  if (pathname.startsWith('/_local/')) {
    const parts = pathname.slice('/_local/'.length).split('/');
    const vaultId = parts.shift();
    const root = vaultId ? vaultRoots.get(vaultId) : undefined;
    if (!root) return null;
    return safeJoin(root, parts.join('/'));
  }
  return safeJoin(rendererRoot(), pathname);
}

export function registerAppProtocol(): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'obsidian.md') {
      return new Response('Not Found', { status: 404 });
    }

    const file = resolveTarget(url);
    if (!file) return new Response('Forbidden', { status: 403 });

    let stat;
    try {
      stat = await fs.stat(file);
    } catch {
      return new Response('Not Found', { status: 404 });
    }
    if (!stat.isFile()) return new Response('Not Found', { status: 404 });

    const headers = new Headers({
      'Content-Type': mimeFor(file),
      'Cache-Control': 'no-cache',
      'Accept-Ranges': 'bytes',
    });

    const range = request.headers.get('Range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416 });
      const start = Number(match[1] || 0);
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (start > end || end >= stat.size) return new Response(null, { status: 416 });
      headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(toWeb(createReadStream(file, { start, end }), request), {
        status: 206,
        headers,
      });
    }

    headers.set('Content-Length', String(stat.size));
    return new Response(toWeb(createReadStream(file), request), { status: 200, headers });
  });
}

function toWeb(stream: NodeJS.ReadableStream, request: Request): ReadableStream {
  return new ReadableStream({
    start(controller) {
      stream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
      request.signal.addEventListener('abort', () => (stream as unknown as { destroy?: () => void }).destroy?.());
    },
    cancel() {
      (stream as unknown as { destroy?: () => void }).destroy?.();
    },
  });
}

export function pluginUrl(vaultPath: string, pluginId: string, file = 'main.js'): string {
  return `app://obsidian.md/_plugin/${vaultIdFor(vaultPath)}/${pluginId}/${file}`;
}
