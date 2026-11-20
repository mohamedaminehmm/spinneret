// Runs inside offscreen.html (a normal page context, so WASM + dynamic import work). Bundled by scripts/setup.mjs.
import { pipeline, env } from '@huggingface/transformers';
import { semScores } from '../rank.js';

env.allowRemoteModels = false;                       // everything is bundled: private, offline, no host permissions
env.allowLocalModels = true;
env.localModelPath = chrome.runtime.getURL('models/');
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('wasm/');
env.backends.onnx.wasm.numThreads = 1;               // no cross-origin isolation in extensions, so no threads

let extractor = null;
const load = () => (extractor ||= pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8', device: 'wasm' }));
const embed = async texts => (await (await load())(texts, { pooling: 'mean', normalize: true })).tolist();

chrome.runtime.onMessage.addListener((m, sender, send) => {
  if (!m || m.type !== 'rank-offscreen') return;
  semScores(embed, m.digest, m.phrases).then(sem => send({ ok: true, sem }), e => { extractor = null; send({ ok: false, error: String(e) }); });
  return true;
});
