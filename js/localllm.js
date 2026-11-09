// On-device chat models (free, private, offline after the first download), run with
// transformers.js on WebGPU. Used by the chat's "On-device" engine; answers are grounded in
// passages from your books, the same way the Claude tutor's are.

import { TRANSFORMERS_URL } from './cuegen.js';

// Sizes are the download for the text-only parts (q4f16 weights), in MB.
export const LOCAL_MODELS = {
  granite: {
    id: 'onnx-community/granite-4.0-1b-ONNX-web', name: 'Granite 4.0 1B', size: 1250, ctx: 4000,
    note: 'IBM, Apache-2.0. Most accurate in our CCNA test (5/5 with Lammle passages). Phones and computers.',
  },
  gemma4: {
    id: 'onnx-community/gemma-4-E2B-it-ONNX', name: 'Gemma 4 E2B', size: 3110, ctx: 6000,
    note: 'Google, Apache-2.0. Faster on a good GPU and writes tighter answers, but scored 4/5 (it followed a misleading passage). Computers with ~4 GB of graphics memory.',
  },
};

const KEY = 'ccnaq.localModel';
export const isPhone = () => !!globalThis.matchMedia?.('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
export const defaultLocalKey = () => 'granite';
export const localKey = () => { try { const k = localStorage.getItem(KEY); return LOCAL_MODELS[k] ? k : defaultLocalKey(); } catch { return defaultLocalKey(); } };
export const setLocalKey = k => { try { localStorage.setItem(KEY, k); } catch { /* blocked */ } };

let adapterInfo = null;
async function adapter() {
  if (adapterInfo) return adapterInfo;
  try {
    const a = navigator.gpu && await navigator.gpu.requestAdapter();
    adapterInfo = { ok: !!a, f16: !!a?.features?.has('shader-f16') };
  } catch { adapterInfo = { ok: false, f16: false }; }
  return adapterInfo;
}
export async function hasWebGPU() { return (await adapter()).ok; }

let loaded = null; // { key, tok, model }
let loading = null;
export const localReady = key => loaded?.key === key;

/** Load (downloading on first use) a model. onProgress(0..1, label). */
export function loadLocal(key, onProgress = () => {}) {
  if (localReady(key)) return Promise.resolve(loaded);
  if (loading?.key === key) return loading.p;
  const m = LOCAL_MODELS[key];
  const p = (async () => {
    const gpu = await adapter();
    if (!gpu.ok) throw new Error('This browser has no WebGPU, which on-device chat needs. Use Chrome or Edge on a computer, or Safari on iOS 26+.');
    onProgress(0, 'Loading the AI runtime…');
    const tf = await import(TRANSFORMERS_URL);
    const files = {};
    const progress_callback = x => {
      if (x.status === 'progress' && x.total) {
        files[x.file] = [x.loaded, x.total];
        const [l, t] = Object.values(files).reduce((a, [u, v]) => [a[0] + u, a[1] + v], [0, 0]);
        onProgress(l / t, `Downloading ${m.name} · ${Math.round(l / 1e6)} / ${Math.round(t / 1e6)} MB (once)`);
      }
    };
    const tok = await tf.AutoTokenizer.from_pretrained(m.id, { progress_callback });
    // AutoModelForCausalLM loads only the text parts (no vision/audio encoders)
    // q4f16 needs the GPU's half-precision support; otherwise use q4 (a little bigger and slower)
    const model = await tf.AutoModelForCausalLM.from_pretrained(m.id, { device: 'webgpu', dtype: gpu.f16 ? 'q4f16' : 'q4', progress_callback });
    onProgress(1, `${m.name} ready`);
    if (loaded?.model) await loaded.model.dispose?.();
    loaded = { key, tok, model, tf };
    return loaded;
  })().finally(() => { loading = null; });
  loading = { key, p };
  return p;
}

export const LOCAL_SYSTEM = 'You are a CCNA 200-301 tutor. Answer the student accurately using the book excerpts, citing pages like (p.123). Search finds excerpts by keywords, so some may be about a different topic that shares words (for example STP port states versus switch MAC learning): use only the excerpts that actually answer the question and ignore the rest. Explain the mechanism step by step in plain words, with a short example when it helps. If the excerpts do not cover something, say so instead of guessing. Keep it under about 250 words.';

/** Trim history so prompt + answer fit the model's budget (rough: 4 chars ≈ 1 token). */
export function fitHistory(history, excerpts, budgetTokens) {
  const cost = s => Math.ceil(String(s).length / 4);
  let left = budgetTokens - cost(LOCAL_SYSTEM) - cost(excerpts) - 450;
  const out = [];
  for (let i = history.length - 2; i >= 0; i -= 2) {
    const pair = [history[i], history[i + 1]];
    const c = cost(pair[0].content) + cost(pair[1].content);
    if (c > left) break;
    left -= c;
    out.unshift(...pair);
  }
  return out;
}

/**
 * Answer a question with the on-device model. history: [{ role, content }] of earlier turns
 * (plain text, no excerpts). Streams into onText; returns the full text.
 */
export async function askLocal({ key, history, question, excerpts, onText, onProgress, signal }) {
  const { tok, model, tf } = await loadLocal(key, onProgress);
  const m = LOCAL_MODELS[key];
  const user = excerpts ? `Book excerpts:\n${excerpts}\n\nQuestion: ${question}` : question;
  const messages = [{ role: 'system', content: LOCAL_SYSTEM }, ...fitHistory(history, excerpts, m.ctx), { role: 'user', content: user }];
  const inputs = tok.apply_chat_template(messages, { add_generation_prompt: true, enable_thinking: false, return_dict: true });
  let text = '';
  const streamer = new tf.TextStreamer(tok, { skip_prompt: true, skip_special_tokens: true, callback_function: t => { text += t; onText?.(t); } });
  const stopping = new tf.StoppingCriteria();
  stopping._call = ids => ids.map(() => !!signal?.aborted);
  const criteria = new tf.StoppingCriteriaList();
  criteria.push(stopping);
  await model.generate({ ...inputs, max_new_tokens: 600, do_sample: false, repetition_penalty: 1.05, streamer, stopping_criteria: criteria });
  return text.trim();
}
