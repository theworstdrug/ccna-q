// On-device AI (free, private, offline once downloaded), run with transformers.js on WebGPU.
// Used by the chat's AI tutor and by the cue generator.
//
// Nothing comes from a CDN: the transformers.js runtime and the ONNX Runtime WebAssembly ship
// with the app (js/vendor/transformers-4.3.1). Model weights come from your private books repo
// when it is connected (a mirror under models/, with the big weights file split into <100 MB
// parts that are streamed back together), otherwise from Hugging Face. Either way the browser
// keeps them in its cache, so they download once per device.

import { cloudOn, ghRaw } from './cloud.js';
import { keyPoints } from './refs.js';
import { review } from './guard.js';

const VENDOR = new URL('./vendor/transformers-4.3.1/', import.meta.url).href;
export const TRANSFORMERS_URL = `${VENDOR}transformers.min.js`;

// Sizes are the download for the q4f16 weights, in MB.
export const LOCAL_MODELS = {
  granite: {
    id: 'onnx-community/granite-4.0-1b-ONNX-web', name: 'Granite 4.0 1B', size: 1250, ctx: 4000,
    mirror: 'models/granite-4.0-1b',
    note: 'IBM, Apache-2.0. Most accurate in our CCNA test (5/5 with Lammle passages). Phones and computers.',
  },
  granitelite: {
    // same weights and identical answers; rebuilt so loading needs ~0.8 GB less memory (no second
    // copy of the 411 MB embedding for the output layer, shorter rotary tables). Only in the books repo.
    id: 'ccnaq/granite-4.0-1b-lite', name: 'Granite 4.0 1B', size: 1220, ctx: 3000,
    mirror: 'models/granite-4.0-1b-lite', mirrorOnly: true,
    note: 'Phone build of Granite 1B: identical answers, lower memory while loading. Needs your books repo connected.',
  },
  smol: {
    // the cue model: writes good leading questions, and small enough for any phone
    id: 'HuggingFaceTB/SmolLM2-360M-Instruct', name: 'SmolLM2 360M', size: 273, ctx: 2048,
    mirror: 'models/smollm2-360m', weights: 'onnx/model_q4f16.onnx', wasm: true, small: true,
    note: 'Hugging Face, Apache-2.0. Small and quick: writes the AI cue questions everywhere and answers on phones. Every answer is checked against your books before you see it.',
  },
  gemma4: {
    id: 'onnx-community/gemma-4-E2B-it-ONNX', name: 'Gemma 4 E2B', size: 3110, ctx: 6000,
    note: 'Google, Apache-2.0. Faster on a good GPU and writes tighter answers, but scored 4/5 (it followed a misleading passage). Computers with ~4 GB of graphics memory. Downloads from Hugging Face.',
  },
};

const KEY = 'ccnaq.localModel';
/** Phone-sized layout: the AI settings are hidden and the small model is always used. */
export const isPhone = () => !!globalThis.matchMedia?.('(max-width: 820px) and (pointer: coarse)').matches;
/** Phones answer with SmolLM (Granite 1B doesn't fit an iPhone's memory for web apps). */
/** Cue questions always come from the small model: it's good at leading questions and fits any phone. */
export const CUE_KEY = 'smol';
export const PHONE_KEY = 'smol'; // phones: SmolLM restates your books and every sentence is checked // smaller models (350M–700M) all invented facts; this is Granite 1B rebuilt to load with less memory
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
    const m = LOCAL_MODELS[key];
    return !!(await cache.match(`https://huggingface.co/${m.id}/resolve/main/${m.weights || 'onnx/model_q4f16.onnx_data'}`));
  } catch { return false; }
}

// ---------------------------------------------------------------- private-repo mirror

/**
 * A fetch that serves a mirrored model's files from the private repo. Requests for anything
 * not in the mirror's manifest, or any failure, fall through to the normal fetch (Hugging Face).
 */
export function mirrorFetch(model, manifest, raw, base = globalThis.fetch.bind(globalThis), cache = null, onBytes = null) {
  const prefix = `https://huggingface.co/${model.id}/resolve/main/`;
  return async (url, init = {}) => {
    const u = String(url);
    const path = u.startsWith(prefix) ? decodeURIComponent(u.slice(prefix.length).split('?')[0]) : null;
    const f = path && manifest.files[path];
    if (!f && path && model.mirrorOnly) return new Response('Not found', { status: 404 }); // not on Hugging Face either
    if (!f) return base(url, init);
    const headers = new Headers(init.headers || {});
    // size probe (transformers.js asks for byte 0 and reads the total from content-range)
    if (/^bytes=0-0$/.test(headers.get('Range') || '')) {
      return new Response(new Uint8Array(1), { status: 206, headers: { 'content-range': `bytes 0-0/${f.size}`, 'content-length': '1', 'content-type': 'application/octet-stream' } });
    }
    const hdrs = { 'content-length': String(f.size), 'content-type': 'application/octet-stream' };
    // already on this device?
    if (cache) {
      const hit = await cache.match(u).catch(() => null);
      if (hit && +(hit.headers.get('content-length') || 0) === f.size) return hit;
    }
    // Download straight to disk first, then hand back the stored copy. Saving before the model is
    // built matters on phones: building it is what runs out of memory, and a download that was
    // still being saved at that moment would be lost and start over on the next launch.
    const deliver = async body => {
      let seen = 0;
      const counted = onBytes ? body.pipeThrough(new TransformStream({ transform(chunk, ctrl) { seen += chunk.byteLength; onBytes(path, seen, f.size); ctrl.enqueue(chunk); } })) : body;
      if (!cache) return new Response(counted, { status: 200, headers: hdrs });
      try {
        await cache.put(u, new Response(counted, { status: 200, headers: hdrs }));
        const stored = await cache.match(u);
        if (stored) return stored;
      } catch (e) { console.warn('could not store', path, e); }
      // storage refused it (full?): fetch again and pass it straight through
      return new Response(f.parts ? partsStream() : (await raw(`${model.mirror}/${path}`)).body, { status: 200, headers: hdrs });
    };
    try {
      if (!f.parts) return await deliver((await raw(`${model.mirror}/${path}`)).body);
      return await deliver(partsStream());
    } catch (e) {
      console.warn('mirror failed, using Hugging Face', e);
      return model.mirrorOnly ? new Response('Mirror unavailable', { status: 503 }) : base(url, init);
    }
    // the parts streamed back together as one file
    function partsStream() {
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
      let k = 0;
      let reader = null;
      return new ReadableStream({
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
    }
  };
}

let mirrorBytes = null; // (path, seen, total) while a mirrored file downloads to disk
async function useMirror(tf, m) {
  tf.env.fetch = globalThis.fetch.bind(globalThis);
  tf.env.useBrowserCache = true;
  if (!m.mirror || !cloudOn()) return false;
  try {
    const manifest = JSON.parse(await (await ghRaw(`${m.mirror}/manifest.json`)).text());
    // the mirror does its own caching (streamed to disk); transformers.js would otherwise store
    // each file by copying the whole buffer into a new Response, a second copy of the 1.2 GB weights
    const cache = await caches.open('transformers-cache').catch(() => null);
    tf.env.useBrowserCache = !cache;
    tf.env.fetch = mirrorFetch(m, manifest, ghRaw, globalThis.fetch.bind(globalThis), cache, (...a) => mirrorBytes?.(...a));
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

const loadedModels = new Map(); // key → { key, tok, model, tf }
const loadingModels = new Map(); // key → promise
export const localReady = key => loadedModels.has(key);

/** Load (downloading on first use) a model. onProgress(0..1, label). */
export function loadLocal(key = localKey(), onProgress = () => {}, { retry = false } = {}) {
  if (localReady(key)) return Promise.resolve(loadedModels.get(key));
  if (!retry && crashedBefore(key)) {
    return Promise.reject(Object.assign(new Error(`Last time, ${LOCAL_MODELS[key].name} ran this device out of memory while starting, and the app was closed. Close other apps and tap Try again, or use Book mode.`), { crashed: true }));
  }
  if (loadingModels.has(key)) return loadingModels.get(key);
  const m = LOCAL_MODELS[key];
  const p = (async () => {
    const gpu = await adapter();
    if (!gpu.ok && !m.wasm) throw new Error('This browser has no WebGPU, which the on-device AI needs. Use Chrome or Edge on a computer, or Safari on iOS 26+.');
    // small models also run without WebGPU (on the CPU, slower)
    const device = gpu.ok ? 'webgpu' : 'wasm';
    const dtype = device === 'wasm' ? 'int8' : gpu.f16 ? 'q4f16' : 'q4';
    onProgress(0, 'Starting the AI engine…');
    const tf = await import(TRANSFORMERS_URL);
    tf.env.backends.onnx.wasm.wasmPaths = VENDOR;
    tf.env.allowLocalModels = false;
    const fromRepo = await useMirror(tf, m);
    if (m.mirrorOnly && !fromRepo) throw new Error(`${m.name} for phones comes from your books repo: connect your books first (Chat → ⚙).`);
    // transformers.js can lose a failed download in a detached promise and hang; watch fetches
    // ourselves and fail the load with a clear message instead
    let fetchError = null;
    const inner = tf.env.fetch;
    tf.env.fetch = async (url, init) => {
      try {
        const res = await inner(url, init);
        // 404s are normal (optional files); access and server errors are not
        if ((res.status === 401 || res.status === 403 || res.status >= 500) && String(url).includes('/resolve/main/')) fetchError = new Error(`Download failed (${res.status}) for ${String(url).split('/').pop()}`);
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
    const dl = {};
    mirrorBytes = (path, seen, total) => {
      dl[path] = [seen, total];
      const [l, t] = Object.values(dl).reduce((a, [u, v]) => [a[0] + u, a[1] + v], [0, 0]);
      if (l < t) onProgress(Math.min(0.95, l / t), `Downloading ${m.name} from your books repo · ${Math.round(l / 1e6)} / ${Math.round(t / 1e6)} MB (once, saved as it arrives)`);
    };
    let prepared = false;
    const progress_callback = x => {
      if (x.status === 'progress' && x.total) {
        files[x.file] = [x.loaded, x.total];
        const [l, t] = Object.values(files).reduce((a, [u, v]) => [a[0] + u, a[1] + v], [0, 0]);
        if (l < t) onProgress(Math.min(0.99, l / t), stored || fromRepo ? `Loading ${m.name} from this device… ${Math.round((l / t) * 100)}%` : `Downloading ${m.name} · ${Math.round(l / 1e6)} / ${Math.round(t / 1e6)} MB (once)`);
      }
      // every file is in: from here the device builds the model on its GPU (the memory-hungry part)
      if (!prepared && Object.keys(files).some(f => /\.onnx(_data)?$/.test(f)) && Object.values(files).every(([l, t]) => l >= t)) {
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
      model = await Promise.race([tf.AutoModelForCausalLM.from_pretrained(m.id, { device, dtype, progress_callback }), failed]);
    } finally { clearInterval(iv); tf.env.fetch = inner; mirrorBytes = null; }
    setGuard(null);
    onProgress(1, `${m.name} ready`);
    if (!(await modelStored(key))) console.warn(`${m.name} loaded but was not stored; it will download again next time`);
    // a phone can't hold two models: let the other one go
    if (isPhone()) for (const [k, v] of loadedModels) { await v.model.dispose?.(); loadedModels.delete(k); }
    const entry = { key, tok, model, tf };
    loadedModels.set(key, entry);
    return entry;
  })().catch(e => {
    if (!e.crashed) setGuard(null);
    if (!(e instanceof Error) || !e.message) e = new Error(`The model couldn't start on this device (${String(e?.message ?? e ?? 'unknown error')}).`);
    throw e;
  }).finally(() => { loadingModels.delete(key); });
  loadingModels.set(key, p);
  return p;
}

/** Generate a reply to chat messages. Streams into onText; stops when signal aborts. */
export async function localGenerate({ key = localKey(), messages, maxNewTokens = 600, repetitionPenalty = 1.05, onText, onProgress, signal }) {
  const { tok, model, tf } = await loadLocal(key, onProgress);
  const inputs = tok.apply_chat_template(messages, { add_generation_prompt: true, enable_thinking: false, return_dict: true });
  let text = '';
  const streamer = new tf.TextStreamer(tok, { skip_prompt: true, skip_special_tokens: true, callback_function: t => { text += t; onText?.(t); } });
  const stopping = new tf.StoppingCriteria();
  stopping._call = ids => ids.map(() => !!signal?.aborted);
  const criteria = new tf.StoppingCriteriaList();
  criteria.push(stopping);
  await model.generate({ ...inputs, max_new_tokens: maxNewTokens, do_sample: false, repetition_penalty: repetitionPenalty, streamer, stopping_criteria: criteria });
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

const SMALL_SYSTEM = 'You are a CCNA study assistant. Use only facts stated in the numbered excerpts. Never add facts from memory. If the excerpts do not answer the question, reply exactly: Your books don\'t cover that.';

/**
 * Draft an answer, then check every sentence against the passages before anything is shown.
 * Small models restate the best-matching book sentences; bigger ones explain from whole passages.
 * Returns { sentences: [{ s, cite }], dropped, fallback, points } — when too little of the draft
 * holds up, `fallback` is true and `points` are the book's own sentences to show instead.
 */
export async function answerChecked({ key = localKey(), question, hits, history = [], onStage = () => {}, onProgress, signal }) {
  const m = LOCAL_MODELS[key];
  const points = keyPoints(hits, question, 6);
  let messages, sources;
  if (m.small) {
    sources = points.map(p => ({ text: p.s, name: p.name, p: p.p }));
    const ex = points.map((p, i) => `[${i + 1}] ${p.s}`).join('\n');
    messages = [{ role: 'system', content: SMALL_SYSTEM }, { role: 'user', content: `Excerpts:\n${ex}\n\nQuestion: ${question}\n\nAnswer the question by restating the excerpts that answer it, one plain sentence each, in a sensible order (3 to 5 sentences). Keep their facts exactly; do not add anything else. Do not mention the excerpts.` }];
  } else {
    const use = hits.slice(0, 4);
    sources = use.map(x => ({ text: x.text, name: x.name, p: x.p }));
    const excerpts = use.map(x => `[${typeof x.p === 'number' ? `p.${x.p}` : x.p}] ${x.text}`).join('\n\n');
    messages = [{ role: 'system', content: LOCAL_SYSTEM }, ...fitHistory(history, excerpts, m.ctx), { role: 'user', content: `Book excerpts:\n${excerpts}\n\nQuestion: ${question}` }];
  }
  if (!points.length && m.small) return { sentences: [], dropped: [], fallback: true, points };
  onStage('draft');
  const draft = await localGenerate({ key, messages, maxNewTokens: m.small ? 240 : 500, repetitionPenalty: m.small ? 1.1 : 1.05, onProgress, signal });
  if (signal?.aborted) throw Object.assign(new Error('Stopped.'), { name: 'AbortError' });
  onStage('check');
  const rv = review(draft, sources);
  return { sentences: rv.kept, dropped: rv.dropped, fallback: !rv.ok, points, draft };
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

