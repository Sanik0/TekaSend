import { build, context } from 'esbuild';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const watching = process.argv.includes('--watch');
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });

// ONNX Runtime loads this JavaScript factory and WebAssembly binary at runtime.
// They must ship with the extension; Chrome MV3 does not allow remote executable code.
const ortAssets = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm'
];
await mkdir('dist/ort', { recursive: true });
for (const asset of ortAssets) {
  await cp(join('node_modules', 'onnxruntime-web', 'dist', asset), join('dist', 'ort', asset));
}

const modelId = join('onnx-community', 'Shield-82M-ONNX');
const modelSource = join('.local-model', modelId);
const modelFiles = [
  'config.json', 'tokenizer.json', 'tokenizer_config.json',
  'special_tokens_map.json', 'merges.txt', 'vocab.json',
  join('onnx', 'model_quantized.onnx')
];
const modelDirectory = await stat(modelSource).catch(error => {
  if (error?.code === 'ENOENT') return null;
  throw error;
});
if (modelDirectory) {
  if (!modelDirectory.isDirectory()) throw new Error(`${modelSource} is not a directory`);
  const missing = [];
  for (const file of modelFiles) {
    const info = await stat(join(modelSource, file)).catch(error => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (!info?.isFile() || info.size === 0) missing.push(file);
  }
  if (missing.length) {
    throw new Error(`Local model is incomplete (${missing.join(', ')}). Run npm.cmd run model:download.`);
  }
  const modelDestination = join('dist', 'models', modelId);
  await mkdir(dirname(modelDestination), { recursive: true });
  await cp(modelSource, modelDestination, { recursive: true });
  console.log('Packaged the local Shield-82M model.');
} else {
  console.warn('Local Shield-82M model is absent. Run npm.cmd run model:download to enable on-device AI.');
}

const options = {
  entryPoints: {
    content: 'src/content.ts',
    background: 'src/background.ts',
    popup: 'src/popup.ts',
    offscreen: 'src/offscreen.ts'
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
