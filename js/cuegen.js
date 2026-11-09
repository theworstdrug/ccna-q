// Cue suggestions: leading questions for the Cornell cue column. QUESTIONS ONLY, never answers.
//
//  • ruleCues(): instant, offline, built-in templates driven by the glossary terms in the text
//  • modelCues(): a small open model running on the device (transformers.js, WebGPU or WASM).
//    Free, no account or key. Downloaded once from Hugging Face, then cached for offline use.
//
// Whatever produces them, cleanQuestions() keeps only text up to the first "?".

import { GLOSSARY } from './data/glossary.js';
import { termsIn } from './terms.js';

export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1';

export const MODELS = {
  better: { id: 'onnx-community/Qwen2.5-0.5B-Instruct', name: 'Better · Qwen2.5 0.5B', size: { webgpu: 483, wasm: 512 }, dtype: { webgpu: 'q4f16', wasm: 'int8' } },
  compact: { id: 'HuggingFaceTB/SmolLM2-360M-Instruct', name: 'Compact · SmolLM2 360M', size: { webgpu: 273, wasm: 365 }, dtype: { webgpu: 'q4f16', wasm: 'int8' } },
};
export const defaultModelKey = () => (globalThis.matchMedia?.('(pointer: coarse)').matches ? 'compact' : 'better');

// ---------------------------------------------------------------- cleaning

/** Turn raw text into a clean list of questions, with anything after "?" removed. */
export function cleanQuestions(raw, max = 8) {
  const out = [];
  const seen = new Set();
  for (const rawLine of String(raw).split('\n')) {
    // every "?" ends a question; whatever follows the last one (an answer, a remark) is dropped
    const parts = rawLine.split('?');
    for (let k = 0; k < parts.length - 1; k++) {
      let q = parts[k].replace(/^\s*(?:[-*•]|\d+[.)]|Q\d*[:.)]|Question\s*\d*[:.)])\s*/i, '').replace(/^["“'(]+/, '').trim();
      if (!q) continue;
      q = `${q}?`;
      if (/^(here are|sure|okay|answer)/i.test(q)) continue;
      if (q.length < 12 || q.length > 170) continue;
      const key = q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q[0].toUpperCase() + q.slice(1));
      if (out.length >= max) return out;
    }
  }
  return out;
}

/** Plain prose from a lesson body: no code blocks, inline code or markdown marks. */
export function prose(body) {
  return String(body).replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(/\*\*|__|^#+\s*/gm, '').replace(/\n{2,}/g, '\n').trim();
}

/** Split a lesson into its "## " sections so each request stays small. */
export function sections(body) {
  const parts = String(body).split(/\n(?=## )/).map(p => prose(p)).filter(p => p.length > 80);
  return parts.length ? parts : [prose(body)];
}

// ---------------------------------------------------------------- built-in generator

// Words too broad to make a useful question on their own.
const GENERIC = new Set(['router', 'switch', 'frame', 'packet', 'segment', 'area', 'cost', 'metric', 'ping', 'subnetting', 'ipv4-address',
  'octet', 'ethernet', 'mac-address', 'broadcast', 'unicast', 'multicast', 'flooding', 'trunk', 'vlan', 'cloud', 'virtualization', 'api', 'rest']);

// Classic CCNA contrasts: asked only when both sides appear in the text.
const CONTRASTS = [
  ['tcp', 'udp'], ['standard-acl', 'extended-acl'], ['hub', 'switch'], ['switch', 'router'], ['static-route', 'default-route'],
  ['distance-vector', 'link-state'], ['rip', 'ospf'], ['access-port', 'trunk'], ['stp', 'rstp'], ['lacp', 'pagp'], ['cdp', 'lldp'],
  ['hsrp', 'vrrp'], ['radius', 'tacacs'], ['wpa2', 'wpa3'], ['ssh', 'telnet'], ['policing', 'queuing'], ['static-nat', 'pat'],
  ['collision-domain', 'broadcast-domain'], ['enable-secret', 'service-password-encryption'], ['multimode-fiber', 'single-mode-fiber'],
  ['full-duplex', 'half-duplex'], ['root-port', 'designated-port'], ['dr', 'ospf-priority'], ['connected-route', 'static-route'],
  ['private-address', 'nat'], ['dhcp', 'apipa'], ['global-unicast', 'link-local-address'], ['unique-local', 'global-unicast'],
  ['autonomous-ap', 'lightweight-ap'], ['data-plane', 'northbound-api'], ['json', 'xml'], ['ansible', 'configuration-drift'],
  ['straight-through-cable', 'crossover-cable'], ['store-and-forward', 'flooding'], ['port-security', 'dhcp-snooping'],
  ['dhcp-snooping', 'dynamic-arp-inspection'], ['administrative-distance', 'metric'], ['longest-prefix-match', 'administrative-distance'],
];

const TEMPLATES = [
  t => `How does ${t} work, step by step?`,
  t => `What problem does ${t} solve?`,
  t => `What would go wrong if ${t} were misconfigured or missing?`,
  t => `When would you use ${t}, and when wouldn't you?`,
  t => `How would you check ${t} on a Cisco device?`,
  t => `How would you explain ${t} to someone new to networking?`,
];

export function ruleCues(text, max = 6, seed = 0) {
  const ids = termsIn(text);
  const has = new Set(ids);
  const byId = id => GLOSSARY.find(g => g.id === id);
  const out = [];
  for (const [a, b] of CONTRASTS) if (has.has(a) && has.has(b) && byId(a) && byId(b)) out.push(`How is ${byId(a).term} different from ${byId(b).term}?`);
  // rank the rest by how often the text mentions them
  const freq = id => { const t = byId(id); return t ? (text.match(new RegExp(`\\b${t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')) || []).length : 0; };
  const ranked = ids.filter(id => !GENERIC.has(id) && byId(id)).sort((x, y) => freq(y) - freq(x));
  // short or very basic passages: broad terms get a softer question at the end
  ranked.forEach((id, k) => out.push(TEMPLATES[(k + seed) % TEMPLATES.length](byId(id).term)));
  if (out.length < max) for (const id of ids.filter(x => GENERIC.has(x) && byId(x))) out.push(`What role does ${byId(id).term} play in this topic?`);
  // rotate so "More" gives a different set
  const shift = (seed * max) % Math.max(1, out.length);
  return cleanQuestions([...out.slice(shift), ...out.slice(0, shift)].join('\n'), max);
}

// ---------------------------------------------------------------- on-device model

let gen = null;
let genKey = null;

export const modelReady = key => gen && genKey === key;

async function pickDevice() {
  try {
    if (navigator.gpu && await navigator.gpu.requestAdapter()) return 'webgpu';
  } catch { /* fall through */ }
  return 'wasm';
}

/** Load (downloading on first use) the chosen model. onProgress(0..1, label). */
export async function loadModel(key = defaultModelKey(), onProgress = () => {}) {
  if (modelReady(key)) return gen;
  const m = MODELS[key];
  const device = await pickDevice();
  onProgress(0, 'Loading the AI runtime…');
  const tf = await import(TRANSFORMERS_URL);
  const files = {};
  gen = await tf.pipeline('text-generation', m.id, {
    device, dtype: m.dtype[device],
    progress_callback: p => {
      if (p.status === 'progress' && p.total) {
        files[p.file] = [p.loaded, p.total];
        const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
        onProgress(l / t, `Downloading ${m.name} · ${Math.round(l / 1e6)} / ${Math.round(t / 1e6)} MB`);
      } else if (p.status === 'ready') onProgress(1, 'Model ready');
    },
  });
  genKey = key;
  return gen;
}

/** Leading questions for a passage, from the on-device model. */
export async function modelCues(text, { key = defaultModelKey(), max = 6, onProgress } = {}) {
  const g = await loadModel(key, onProgress);
  onProgress?.(1, 'Thinking…');
  const messages = [
    { role: 'system', content: 'You are a CCNA tutor who writes study questions.' },
    { role: 'user', content: `Read the text and write ${max} different questions that test understanding of it. Ask "why", "how" and "what happens if" questions. Write only the questions, one per line. Do not answer them.\n\nText:\n${text.slice(0, 1800)}` },
  ];
  const out = await g(messages, { max_new_tokens: 240, do_sample: false, repetition_penalty: 1.15 });
  return cleanQuestions(out[0].generated_text.at(-1).content, max);
}
