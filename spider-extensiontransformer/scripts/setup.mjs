// npm run setup: copies the ONNX runtime WASM, downloads the model once, bundles the offscreen script.
import { cp, mkdir, readdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exists = p => access(p).then(() => true, () => false);

// 1. ONNX runtime WASM (MV3 forbids loading code from a CDN, so it ships inside the extension)
const dist = path.join(root, 'node_modules/onnxruntime-web/dist'), out = path.join(root, 'wasm');
await mkdir(out, { recursive: true });
let copied = 0;
for (const f of await readdir(dist)) if (/^ort-wasm-simd-threaded(\.jsep)?\.(wasm|mjs)$/.test(f)) { await cp(path.join(dist, f), path.join(out, f)); copied++; }
console.log(`wasm: copied ${copied} files`); if (!copied) throw new Error('no ort-wasm files found in ' + dist);

// 2. Model (about 23 MB, quantized MiniLM). Downloaded once, then bundled into the extension.
const base = 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/', dir = path.join(root, 'models/Xenova/all-MiniLM-L6-v2');
for (const f of ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx']) {
  const dst = path.join(dir, f);
  if (await exists(dst)) { console.log('model: have', f); continue; }
  const r = await fetch(base + f); if (!r.ok) throw new Error(`download failed (${r.status}): ${base + f}`);
  await mkdir(path.dirname(dst), { recursive: true }); await writeFile(dst, Buffer.from(await r.arrayBuffer())); console.log('model: got', f);
}

// 3. Bundle the offscreen script (transformers.js + rank.js)
await build({ entryPoints: [path.join(root, 'src/offscreen.js')], bundle: true, format: 'esm', platform: 'browser', target: 'chrome116',
  outfile: path.join(root, 'dist/offscreen.js'), external: ['onnxruntime-node', 'sharp'], logLevel: 'info' });
console.log('done. Reload the extension in chrome://extensions');
