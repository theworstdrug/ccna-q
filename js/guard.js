// Guard rails for on-device answers: the model drafts, then every sentence is checked against
// the book passages it was given before anything is shown. Small models write fluently and get
// facts wrong; checking each sentence against the source catches most of that, deterministically.
//
// A sentence is kept only if:
//  • most of its content words appear in one passage sentence (its support)
//  • every number in it appears in the passages
//  • every networking term in it (glossary terms) appears in the passages
//  • it doesn't flip a fact (highest↔lowest, source↔destination, permit↔deny, …) against its support
// Kept sentences carry a citation to the page they came from.

import { words } from './cuegen.js';
import { termsIn } from './terms.js';

const OPPOSITES = [
  ['highest', 'lowest'], ['higher', 'lower'], ['maximum', 'minimum'], ['most', 'least'], ['more', 'less', 'fewer'],
  ['source', 'destination'], ['inbound', 'outbound'], ['ingress', 'egress'], ['permit', 'deny'], ['allow', 'block'],
  ['enable', 'disable'], ['enabled', 'disabled'], ['before', 'after'], ['first', 'last'], ['always', 'never'],
  ['increase', 'decrease'], ['increases', 'decreases'], ['larger', 'smaller'], ['longer', 'shorter'], ['faster', 'slower'],
  ['can', 'cannot', "can't"],
  // exam contrasts that small models swap
  ['standard', 'extended'], ['tcp', 'udp'], ['inside', 'outside'], ['access', 'trunk'], ['tagged', 'untagged'], ['static', 'dynamic'],
];
const lower = s => ` ${String(s).toLowerCase().replace(/[^a-z0-9'\-\s]/g, ' ').replace(/\s+/g, ' ')} `;
const has = (s, w) => s.includes(` ${w} `);

/** Split text into sentences (also list items and lines). */
export function sentences(text) {
  return String(text)
    .replace(/\r/g, '')
    .replace(/\s*\[\d{1,2}\]\s*/g, '\n') // excerpt markers the model copied: treat as breaks
    .split(/\n+/)
    .flatMap(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/([.!?])\s+(?=[A-Z0-9("'])/g, '$1\u0001').split('\u0001'))
    .map(s => s.replace(/\*\*|__|`/g, '').replace(/^[■•\-–]\s*/, '').trim())
    .filter(Boolean);
}

/** Headings and fragments ("Mismatched Native VLAN on a Trunk"), not statements. */
const isHeading = s => !/[.!?]$/.test(s) && (s.split(/\s+/).length < 7 || s.split(/\s+/).filter(w => /^[A-Z0-9]/.test(w)).length / s.split(/\s+/).length > 0.6);

const numbersIn = s => (String(s).match(/\d+(?:\.\d+)*/g) || []).filter(n => n.length > 0);

/** Does the draft sentence state the opposite of its supporting sentence? */
function flips(draft, support) {
  const d = lower(draft), s = lower(support);
  for (const group of OPPOSITES) {
    const inD = group.filter(w => has(d, w)), inS = group.filter(w => has(s, w));
    if (inD.length && inS.length && !inD.some(w => inS.includes(w))) return `${inD[0]} ≠ ${inS[0]}`;
  }
  return null;
}

/**
 * Review a draft answer against the passages it was given.
 * sources: [{ text, name, p }]. Returns { kept: [{ s, cite }], dropped: [{ s, why }], ratio }.
 */
export function review(draft, sources, { minSupport = 0.7 } = {}) {
  const srcSents = sources.flatMap(x => sentences(x.text).map(t => ({ t, w: new Set(words(t)), name: x.name, p: x.p })));
  const allText = sources.map(x => x.text).join('\n');
  const allWords = new Set(words(allText));
  const allTerms = new Set(termsIn(allText));
  const allNums = new Set(numbersIn(allText));
  const kept = [], dropped = [];
  for (const s of sentences(draft)) {
    if (/:\s*$/.test(s)) continue; // "Here's how it works:" lead-ins
    if (/books? don'?t cover/i.test(s)) { kept.push({ s, cite: null }); continue; }
    // talk about the excerpts or the course, not about networking
    if (/\b(excerpts?|the text|the passages?|the books?|this chapter|ICND\d?|you should be familiar|in summary|to summarize)\b/i.test(s)) { dropped.push({ s, why: 'not about the topic' }); continue; }
    const w = [...new Set(words(s))];
    if (w.length < 3 || isHeading(s)) continue;
    let best = null, bestScore = 0;
    const scored = srcSents.map(x => ({ x, sc: w.filter(t => x.w.has(t)).length / w.length }));
    for (const { x, sc } of scored) if (sc > bestScore) { bestScore = sc; best = x; }
    // it must agree with at least one strongly matching book sentence on every contrast
    // (highest/lowest, source/destination, standard/extended, …)
    const strong = scored.filter(c => c.sc >= minSupport);
    const agree = strong.filter(c => !flips(s, c.x.t)).sort((a, b) => b.sc - a.sc);
    const flip = strong.length && !agree.length ? flips(s, best.t) || flips(s, strong[0].x.t) : null;
    if (agree.length) best = agree[0].x;
    // also allow support spread over the passages, but with a higher bar
    const spread = w.filter(t => allWords.has(t)).length / w.length;
    const why =
      (bestScore < minSupport && !(spread >= 0.9 && bestScore >= 0.5)) ? 'not supported by your books' :
      numbersIn(s).some(n => !allNums.has(n)) ? 'number not in your books' :
      termsIn(s).some(t => !allTerms.has(t)) ? 'term not in the passages' :
      flip ? `contradicts the book (${flip})` : null;
    if (why) dropped.push({ s, why }); else kept.push({ s, cite: best ? { name: best.name, p: best.p } : null });
  }
  const total = kept.length + dropped.length;
  const ratio = total ? kept.length / total : 0;
  // only trust the draft if enough of it held up; otherwise the caller shows the book's own sentences
  return { kept, dropped, ratio, ok: kept.length >= 2 && ratio >= 0.5 };
}

/** Is the question in scope and covered by the passages? (Off-topic questions have no networking
 *  terms and only half their words matched; in-scope ones are fully covered.) Skip the model when not. */
export const answerable = (hits, question) => hits.length > 0 && (termsIn(question).length > 0 || (hits[0].cover ?? 0) >= 0.8);
