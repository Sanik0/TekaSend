import { build, context } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const watching = process.argv.includes('--watch');
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
const options = {
  entryPoints: {
    content: 'src/content.ts',
    background: 'src/background.ts',
    popup: 'src/popup.ts'
  },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome138',
  sourcemap: true,
  logLevel: 'info'
};
if (watching) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching source files. Reload the extension in chrome://extensions after changes.');
} else {
  await build(options);
}
