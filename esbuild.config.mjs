import esbuild from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

if (!watch) await rm(outdir, { recursive: true, force: true });
await mkdir(`${outdir}/renderer/workers`, { recursive: true });

const common = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  target: 'es2022',
};

// Renderer runs with nodeIntegration, so Node built-ins stay as runtime require().
const nodeExternals = ['electron', 'fs', 'path', 'os', 'url', 'crypto', 'child_process', 'node:*', 'chokidar'];

const builds = [
  {
    entryPoints: ['src/main/main.ts'],
    outfile: `${outdir}/main.js`,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    ...common,
  },
  {
    entryPoints: ['src/renderer/app.ts'],
    outfile: `${outdir}/renderer/app.js`,
    platform: 'browser',
    format: 'iife',
    external: nodeExternals,
    ...common,
  },
  {
    entryPoints: ['src/renderer/workers/metadata.worker.ts'],
    outfile: `${outdir}/renderer/workers/metadata.worker.js`,
    platform: 'browser',
    format: 'iife',
    ...common,
  },
  {
    entryPoints: ['src/renderer/workers/sim.worker.ts'],
    outfile: `${outdir}/renderer/workers/sim.worker.js`,
    platform: 'browser',
    format: 'iife',
    ...common,
  },
  {
    entryPoints: ['src/starter/starter.ts'],
    outfile: `${outdir}/renderer/starter.js`,
    platform: 'browser',
    format: 'iife',
    external: nodeExternals,
    ...common,
  },
];

async function copyStatic() {
  await cp('src/renderer/index.html', `${outdir}/renderer/index.html`);
  await cp('src/starter/starter.html', `${outdir}/renderer/starter.html`);
  await cp('src/renderer/styles', `${outdir}/renderer/styles`, { recursive: true });
}

await copyStatic();

if (watch) {
  for (const build of builds) {
    const ctx = await esbuild.context(build);
    await ctx.watch();
  }
  console.log('watching...');
} else {
  await Promise.all(builds.map((build) => esbuild.build(build)));
  console.log('build complete');
}
