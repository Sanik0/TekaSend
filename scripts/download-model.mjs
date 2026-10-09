import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const modelId = 'onnx-community/Shield-82M-ONNX';
const revision = 'b5033d026f56eab7dc3d8abfab54eb171b0358c1';
const modelFile = 'onnx/model_quantized.onnx';
const modelBytes = 81970098;
const modelSha256 = '5617fb4e932191567eb3b2328f44e71444adbff55b216fd040875f2ad7006668';
const modelDirectory = join(projectRoot, '.local-model', ...modelId.split('/'));
const files = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'merges.txt',
  'vocab.json',
  modelFile
];

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function isValidFile(file, path, size) {
  if (size === 0) return false;
  if (file === modelFile) {
    return size === modelBytes && (await sha256File(path)) === modelSha256;
  }
  if (file.endsWith('.json')) {
    try {
      JSON.parse(await readFile(path, 'utf8'));
    } catch {
      return false;
    }
  }
  return true;
}

async function downloadFile(file) {
  const destination = join(modelDirectory, ...file.split('/'));
  const existing = await stat(destination).catch(error => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (existing && !existing.isFile()) {
    throw new Error(`Cannot save ${file}: ${destination} is not a file`);
  }
  if (existing && await isValidFile(file, destination, existing.size)) {
    console.log(`Already present: ${file}`);
    return;
  }
  if (existing) console.warn(`Replacing incomplete or invalid file: ${file}`);

  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.part-${process.pid}-${randomUUID()}`;
  const url = `https://huggingface.co/${modelId}/resolve/${revision}/${file}`;

  try {
    console.log(`Downloading ${file}...`);
    const response = await fetch(url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} from Hugging Face`);
    }
    if (response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('Hugging Face returned HTML instead of a model file');
    }

    let downloaded = 0;
    let nextReport = 10 * 1024 * 1024;
    const digest = file === modelFile ? createHash('sha256') : null;
    const progress = new Transform({
      transform(chunk, _encoding, callback) {
        downloaded += chunk.length;
        digest?.update(chunk);
        if (file === modelFile && downloaded >= nextReport) {
          console.log(`  ${Math.round(downloaded / (1024 * 1024))} MiB received`);
          nextReport += 10 * 1024 * 1024;
        }
        callback(null, chunk);
      }
    });
    await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(temporary, { flags: 'wx' }));

    const completed = await stat(temporary);
    if (completed.size === 0) {
      throw new Error('Downloaded file is empty');
    }
    if (file === modelFile && (completed.size !== modelBytes || digest?.digest('hex') !== modelSha256)) {
      throw new Error('Model size or SHA-256 did not match the pinned revision');
    }
    if (file.endsWith('.json')) {
      JSON.parse(await readFile(temporary, 'utf8'));
    }

    if (existing) await rm(destination, { force: true });
    await rename(temporary, destination);
    console.log(`Saved ${file} (${Math.round(completed.size / 1024)} KiB)`);
  } catch (error) {
    await rm(temporary, { force: true });
    throw new Error(`Could not download ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

try {
  for (const file of files) {
    await downloadFile(file);
  }
  console.log(`Model ready in ${modelDirectory}`);
  console.log('Run npm.cmd run build, then reload TekaSend in chrome://extensions and refresh the page.');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('Check your connection and rerun npm.cmd run model:download. Completed files will be reused.');
  process.exitCode = 1;
}
