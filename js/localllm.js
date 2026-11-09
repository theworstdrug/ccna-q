// On-device AI (free, private, offline once downloaded), run with transformers.js on WebGPU.
// Used by the chat's AI tutor and by the cue generator.
//
// Nothing comes from a CDN: the transformers.js runtime and the ONNX Runtime WebAssembly ship
// with the app (js/vendor/transformers-4.3.1). Model weights come from your private books repo
// when it is connected (a mirror under models/, with the big weights file split into <100 MB
// parts that are streamed back together), otherwise from Hugging Face. Either way the browser
// keeps them in its cache, so they download once per device.

import { cloudOn, ghRaw } from './cloud.js';

const VENDOR = new URL('./vendor/transformers-4.3.1/', import.meta.url).href;
export const TRANSFORMERS_URL = `${VENDOR}transformers.min.js`;

// Sizes are the download for the q4f16 weights, in MB.
export const LOCAL_MODELS = {
  granite: {
    id: 'onnx-community/granite-4.0-1b-ONNX-web', name: 'Granite 4.0 1B', size: 1250, ctx: 4000,
    mirror: 'models/granite-4.0-1b',
    note: 'IBM, Apache-2.0. Most accurate in our CCNA test (5/5 with Lammle passages). Phones and computers.',
  },
  granite350: {
    id: 'onnx-community/granite-4.0-350m-ONNX-web', name: 'Granite 4.0 350M', size: 350, ctx: 3000,
    mirror: 'models/granite-4.0-350m',
    note: 'IBM, Apache-2.0. Small enough for a phone\'s memory. Simpler answers than the 1B.',
  },
  gemma4: {
    id: 'onnx-community/gemma-4-E2B-it-ONNX', name: 'Gemma 4 E2B', size: 3110, ctx: 6000,
    note: 'Google, Apache-2.0. Faster on a good GPU and writes tighter answers, but scored 4/5 (it followed a misleading passage). Computers with ~4 GB of graphics memory. Downloads from Hugging Face.',
  },
};

const KEY = 'ccnaq.localModel';
/** Phone-sized layout: the AI settings are hidden and the small model is always used. */
export const isPhone = () => !!globalThis.matchMedia?.('(max-width: 820px) and (pointer: coarse)').matches;
/** Phones get the small model: the 1B's 1.25 GB of weights is more memory than iOS allows a web app. */
export const PHONE_KEY = 'granite'; // pending: a smaller model that is still accurate (see tests)
export const defaultLocalKey = () => (isPhone() ? PHONE_KEY : 'granite');
export const localKey = () => {
  if (isPhone()) return PHONE_KEY;
  try { const k = localStorage.getItem(KEY); return LOCAL_MODELS[k] ? k : defaultLocalKey(); } catch { return defaultLocalKey(); }
};
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

/** Is this model's weights file already stored in the browser? */
export async function modelStored(key) {
  try {
    const cache = await caches.open('transformers-cache');
    return !!(await cache.match(`https://huggingface.co/${LOCAL_MODELS[key].id}/resolve/main/onnx/model_q4f16.onnx_data`));
  } catch { return false; }
}

// ---------------------------------------------------------------- private-repo mirror

/**
 * A fetch that serves a mirrored model's files from the private repo. Requests for anything
 * not in the mirror's manifest, or any failure, fall through to the normal fetch (Hugging Face).
 */
export function mirrorFetch(model, manifest, raw, base = globalThis.fetch.bind(globalThis)) {
  const prefix = `https://huggingface.co/${model.id}/resolve/main/`;
  return async (url, init = {}) => {
    const u = String(url);
    const path = u.startsWith(prefix) ? decodeURIComponent(u.slice(prefix.length).split('?')[0]) : null;
    const f = path && manifest.files[path];
    if (!f) return base(url, init);
    const headers = new Headers(init.headers || {});
    // size probe (transformers.js asks for byte 0 and reads the total from content-range)
    if (/^bytes=0-0$/.test(headers.get('Range') || '')) {
      return new Response(new Uint8Array(1), { status: 206, headers: { 'content-range': `bytes 0-0/${f.size}`, 'content-length': '1', 'content-type': 'application/octet-stream' } });
    }
    try {
      if (!f.parts) {
        const res = await raw(`${model.mirror}/${path}`);
        return new Response(res.body, { status: 200, headers: { 'content-length': String(f.size), 'content-type': 'application/octet-stream' } });
      }
      // stream the parts back together as one file
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
      let k = 0;
      let reader = null;
      const body = new ReadableStream({
        async pull(ctrl) {
          for (;;) {
            if (!reader) {
              if (k >= f.parts.length) { ctrl.close(); return; }
              reader = (await raw(`${model.mirror}/${dir}${f.parts[k++]}`)).body.getReader();
            }
            const { done, value } = await reader.read();
            if (done) { reader = null; continue; }
            ctrl.enqueue(value);
            return;
          }
        },
        cancel() { reader?.cancel(); },
      });
      return new Response(body, { status: 200, headers: { 'content-length': String(f.size), 'content-type': 'application/octet-stream' } });
    } catch (e) {
      console.warn('mirror failed, using Hugging Face', e);
      return base(url, init);
    }
  };
}

async function useMirror(tf, m) {
  tf.env.fetch = globalThis.fetch.bind(globalThis);
  if (!m.mirror || !cloudOn()) return false;
  try {
    const manifest = JSON.parse(await (await ghRaw(`${m.mirror}/manifest.json`)).text());
    tf.env.fetch = mirrorFetch(m, manifest, ghRaw);
    return true;
  } catch { return false; } // mirror not there: Hugging Face it is
}

// ---------------------------------------------------------------- loading + generating

// ---------------------------------------------------------------- crash guard
// If the app is killed while the model is being prepared (out of memory on a phone), the next
// launch would just start again and loop. Remember the stage so it can stop and explain instead.
const GUARD = 'ccnaq.ai.loading';
const guard = () => { try { return JSON.parse(localStorage.getItem(GUARD) || 'null'); } catch { return null; } };
const setGuard = g => { try { if (g) localStorage.setItem(GUARD, JSON.stringify(g)); else localStorage.removeItem(GUARD); } catch { /* ignore */ } };
/** Did the last attempt to load this model die while preparing it? */
export const crashedBefore = key => { const g = guard(); return !!(g && g.key === key && g.stage === 'prepare' && Date.now() - g.at < 6 * 3600e3); };
export const clearCrash = () => setGuard(null);

/** One line describing this device's AI readiness, for error messages and screenshots. */
export async function diagnostics(key = localKey()) {
  const g = await adapter();
  let st = '';
  try { const e = await navigator.storage?.estimate?.(); if (e?.quota) st = `${Math.round((e.usage || 0) / 1e6)} MB used of ${Math.round(e.quota / 1e6)} MB`; } catch { /* ignore */ }
  const persisted = await navigator.storage?.persisted?.().catch(() => null);
  const last = guard();
  return [`model ${LOCAL_MODELS[key]?.name}`, `WebGPU ${g.ok ? 'yes' : 'no'}`, `f16 ${g.f16 ? 'yes' : 'no'}`, `stored ${(await modelStored(key)) ? 'yes' : 'no'}`, st && `storage ${st}${persisted ? ' (persistent)' : ''}`, last && `last stage ${last.stage}`].filter(Boolean).join(' · ');
}

let loaded = null; // { key, tok, model, tf }
let loading = null;
export const localReady = key => loaded?.key === key;

/** Load (downloading on first use) a model. onProgress(0..1, label). */
export function loadLocal(key = localKey(), onProgress = () => {}, { retry = false } = {}) {
  if (localReady(key)) return Promise.resolve(loaded);
  if (!retry && crashedBefore(key)) {
    return Promise.reject(Object.assign(new Error(`Last time, ${LOCAL_MODELS[key].name} ran this device out of memory while starting, and the app was closed. Close other apps and tap Try again, or use Book mode.`), { crashed: true }));
  }
  if (loading?.key === key) return loading.p;
  const m = LOCAL_MODELS[key];
  const p = (async () => {
    const gpu = await adapter();
    if (!gpu.ok) throw new Error('This browser has no WebGPU, which the on-device AI needs. Use Chrome or Edge on a computer, or Safari on iOS 26+.');
    onProgress(0, 'Starting the AI engine…');
    const tf = await import(TRANSFORMERS_URL);
    tf.env.backends.onnx.wasm.wasmPaths = VENDOR;
    tf.env.allowLocalModels = false;
    const fromRepo = await useMirror(tf, m);
    // transformers.js can lose a failed download in a detached promise and hang; watch fetches
    // ourselves and fail the load with a clear message instead
    let fetchError = null;
    const inner = tf.env.fetch;
    tf.env.fetch = async (url, init) => {
      try {
        const res = await inner(url, init);
        if (!res.ok && res.status !== 206 && String(url).includes('/resolve/main/')) fetchError = new Error(`Download failed (${res.status}) for ${String(url).split('/').pop()}`);
        return res;
      } catch (e) { fetchError = new Error(`Download failed: ${e.message || e}. Check your connection and try again.`); throw e; }
    };
    const stored = await modelStored(key);
    if (!stored) {
      try { await navigator.storage?.persist?.(); } catch { /* ignore */ }
      try {
        const est = await navigator.storage?.estimate?.();
        if (est?.quota && est.quota - (est.usage || 0) < m.size * 1.15e6) throw Object.assign(new Error(`Not enough storage for ${m.name}: it needs about ${m.size} MB free for this app. Free up space on the device and try again.`), { storage: true });
      } catch (e) { if (e.storage) throw e; }
    }
    const files = {};
    let prepared = false;
    const progress_callback = x => {
      if (x.status === 'progress' && x.total) {
        files[x.file] = [x.loaded, x.total];
        const [l, t] = Object.values(files).reduce((a, [u, v]) => [a[0] + u, a[1] + v], [0, 0]);
        if (l < t) onProgress(Math.min(0.99, l / t), stored ? `Loading ${m.name} from this device… ${Math.round((l / t) * 100)}%` : `Downloading ${m.name}${fromRepo ? ' from your books repo' : ''} · ${Math.round(l / 1e6)} / ${Math.round(t / 1e6)} MB (once)`);
      }
      // every file is in: from here the device builds the model on its GPU (the memory-hungry part)
      if (!prepared && Object.keys(files).some(f => f.endsWith('.onnx_data')) && Object.values(files).every(([l, t]) => l >= t)) {
        prepared = true;
        setGuard({ key, stage: 'prepare', at: Date.now() });
        onProgress(0.995, `Preparing ${m.name} on this device's GPU… (the first time can take a minute)`);
      }
    };
    setGuard({ key, stage: 'download', at: Date.now() });
    let iv = 0;
    const failed = new Promise((_, reject) => { iv = setInterval(() => { if (fetchError) { clearInterval(iv); reject(fetchError); } }, 500); });
    failed.catch(() => {}); // handled through the races below
    let tok, model;
    try {
      tok = await Promise.race([tf.AutoTokenizer.from_pretrained(m.id, { progress_callback }), failed]);
      // AutoModelForCausalLM loads only the text parts (no vision/audio encoders);
      // q4f16 needs the GPU's half-precision support, otherwise q4 (bigger, from Hugging Face)
      model = await Promise.race([tf.AutoModelForCausalLM.from_pretrained(m.id, { device: 'webgpu', dtype: gpu.f16 ? 'q4f16' : 'q4', progress_callback }), failed]);
    } finally { clearInterval(iv); tf.env.fetch = inner; }
    setGuard(null);
    onProgress(1, `${m.name} ready`);
    if (!(await modelStored(key))) console.warn(`${m.name} loaded but was not stored; it will download again next time`);
    if (loaded?.model) await loaded.model.dispose?.();
    loaded = { key, tok, model, tf };
    return loaded;
  })().catch(e => { if (!e.crashed) setGuard(null); throw e; }).finally(() => { loading = null; });
  loading = { key, p };
  return p;
}

/** Generate a reply to chat messages. Streams into onText; stops when signal aborts. */
export async function localGenerate({ key = localKey(), messages, maxNewTokens = 600, onText, onProgress, signal }) {
  const { tok, model, tf } = await loadLocal(key, onProgress);
  const inputs = tok.apply_chat_template(messages, { add_generation_prompt: true, enable_thinking: false, return_dict: true });
  let text = '';
  const streamer = new tf.TextStreamer(tok, { skip_prompt: true, skip_special_tokens: true, callback_function: t => { text += t; onText?.(t); } });
  const stopping = new tf.StoppingCriteria();
  stopping._call = ids => ids.map(() => !!signal?.aborted);
  const criteria = new tf.StoppingCriteriaList();
  criteria.push(stopping);
  await model.generate({ ...inputs, max_new_tokens: maxNewTokens, do_sample: false, repetition_penalty: 1.05, streamer, stopping_criteria: criteria });
  return text.trim();
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
export async function askLocal({ key = localKey(), history, question, excerpts, onText, onProgress, signal }) {
  const m = LOCAL_MODELS[key];
  const user = excerpts ? `Book excerpts:\n${excerpts}\n\nQuestion: ${question}` : question;
  const messages = [{ role: 'system', content: LOCAL_SYSTEM }, ...fitHistory(history, excerpts, m.ctx), { role: 'user', content: user }];
  return localGenerate({ key, messages, onText, onProgress, signal });
}

