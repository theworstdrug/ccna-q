// Cue suggestions: leading questions for the Cornell cue column. QUESTIONS ONLY, never answers.
//
//  • ruleCues(): instant, offline, built-in templates driven by the glossary terms in the text
//  • modelCues(): the on-device model shared with the chat (js/localllm.js). Free, no account or key.
//
// Whatever produces them, cleanQuestions() keeps only text up to the first "?".

import { GLOSSARY } from './data/glossary.js';
import { termsIn } from './terms.js';


// ---------------------------------------------------------------- cleaning

/** Turn raw text into a clean list of questions, with anything after "?" removed. */
export function cleanQuestions(raw, max = 8) {
  const out = [];
  const seen = new Set();
  for (const rawLine of String(raw).split('\n')) {
    // every "?" ends a question; whatever follows the last one (an answer, a remark) is dropped
    const parts = rawLine.split('?');
    for (let k = 0; k < parts.length - 1; k++) {
      let q = parts[k].replace(/\*\*|__/g, '').replace(/^\s*(?:[-*•]|\d+[.)]|Q\d*[:.)]|Question\s*\d*[:.)])\s*/i, '').replace(/^["“'(]+/, '').trim();
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

// ---------------------------------------------------------------- staying on topic

const STOP = new Set('the a an and or of to in on for with is are be by as at it its this that these those from what why how when which who does do did can could would should will if then than there their they you your into about between each other more most some such only also not no use used using uses happens happen happening purpose role difference different work works way network networks networking device devices data explain mean means'.split(' '));
/** Light stemming so "elect", "elected" and "election" meet. Leaves acronyms and CLI words alone. */
export function stem(w) {
  if (w.length <= 4 || /\d/.test(w)) return w;
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (/(s|x|z|ch|sh)es$/.test(w) && w.length - 2 >= 4) return w.slice(0, -2);
  for (const suf of ['ations', 'ation', 'ions', 'ion', 'ings', 'ing', 'ers', 'er', 'ed', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 4 && !(suf === 's' && w.endsWith('ss'))) return w.slice(0, -suf.length);
  }
  return w;
}
export const words = s => (String(s).toLowerCase().match(/[a-z0-9][a-z0-9.\-]*[a-z0-9]|[a-z0-9]/g) || []).filter(w => w.length > 1 && !STOP.has(w)).map(stem);

/**
 * Drop questions that wander off the passage: no shared content word with it, or naming a
 * protocol/term (from the glossary) that neither the passage nor the background mentions.
 */
export function onTopic(qs, context) {
  const ctxWords = new Set(words(context));
  const ctxTerms = new Set(termsIn(context));
  return qs.filter(q => {
    if (!words(q).some(w => ctxWords.has(w))) return false;
    return termsIn(q).every(t => {
      if (ctxTerms.has(t) || GENERIC.has(t)) return true;
      const name = GLOSSARY.find(g => g.id === t)?.term;
      return !!name && words(name).every(w => ctxWords.has(w));
    });
  });
}

// ---------------------------------------------------------------- on-device model
// The same on-device model as the chat (js/localllm.js), so a device only ever downloads one.

/** The chat prompt. Instructions go after the text: small models follow them better there. */
export function cuePrompt(text, { max = 6, background = '' } = {}) {
  const bg = background ? `Background facts:\n${background.slice(0, 600)}\n\n` : '';
  return [
    { role: 'system', content: 'You are a CCNA tutor. You write short study questions about networking.' },
    { role: 'user', content: `${bg}Text:\n${text.slice(0, 1400)}\n\nWrite ${max} questions that test understanding of the Text above. Use "why", "how" and "what happens if". Only ask about things the Text talks about${background ? ' (the background is just for accuracy)' : ''}. One question per line. Do not answer them.` },
  ];
}

/** Leading questions for a passage, from the on-device model, optionally grounded in reference excerpts. */
export async function modelCues(text, { max = 6, background = '', onProgress } = {}) {
  const { localGenerate } = await import('./localllm.js');
  const out = await localGenerate({ messages: cuePrompt(text, { max, background }), maxNewTokens: 220, onProgress });
  return onTopic(cleanQuestions(out, max + 2), `${text}\n${background}`).slice(0, max);
}
