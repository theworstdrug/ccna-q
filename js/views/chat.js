// Chat: ask about any topic and go deeper.
//  • Book (free, offline): answers are built from your books' own sentences, with pages,
//    plus the full passages. Nothing is made up, because nothing is generated.
//  • Claude (optional, your API key): a real tutor conversation grounded in the same passages.

import { h, md, sheet, toast } from '../ui.js';
import { db, update } from '../store.js';
import { fullIndex, search, keyPoints, listDocs } from '../refs.js';
import { words, ruleCues } from '../cuegen.js';
import { bankAdd } from '../cuebank.js';
import { currentTopic, topicTitle } from '../sync.js';
import { askTutor, tutorKey, TUTOR_MODEL } from '../tutor.js';
import { askLocal, localKey, localReady, LOCAL_MODELS } from '../localllm.js';
import { cloudOn, pdfUrl, syncLibrary } from '../cloud.js';
import { buzz } from '../gestures.js';

const STARTERS = [
  'How does OSPF elect a DR and BDR?',
  'What is PortFast, and when is it dangerous?',
  'Why use PAT instead of static NAT?',
  'How does a switch learn MAC addresses?',
  'What does the native VLAN do on a trunk?',
  'Standard vs extended ACLs: where do they go?',
];

const newThread = () => ({ id: Date.now().toString(36), title: '', at: Date.now(), msgs: [] });
const chatState = () => { const s = db(); if (!s.chat?.threads) s.chat = { threads: [], cur: null }; return s.chat; };
const thread = () => chatState().threads.find(t => t.id === chatState().cur) || null;

function ensureThread() {
  let t = thread();
  if (!t) {
    t = newThread();
    update(s => { s.chat.threads.unshift(t); s.chat.cur = t.id; s.chat.threads = s.chat.threads.slice(0, 30); });
    t = thread();
  }
  return t;
}

const label = x => (typeof x.p === 'number' ? `${x.name} p.${x.p}` : `${x.name} · ${x.p}`);

export function render(root) {
  const saved = db().settings.chatEngine;
  let engine = saved === 'claude' && tutorKey() ? 'claude' : saved === 'local' ? 'local' : 'book';
  let busy = null; // AbortController while a model is answering
  let textOf = new Map(); // "doc:i" → passage text
  const loadText = async () => { const idx = await fullIndex(); textOf = new Map(idx.items.map(it => [`${it.doc}:${it.i}`, it.text])); };

  const list = h('div.chat-list', { 'aria-live': 'polite' });
  const input = h('textarea.input.chat-in', {
    rows: 1, placeholder: 'Ask about any CCNA topic…', 'aria-label': 'Message',
    oninput: () => fit(),
    onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); send(); } },
  });
  const fit = () => { input.style.height = 'auto'; input.style.height = `${Math.min(160, input.scrollHeight + 2)}px`; };
  const sendBtn = h('button.btn.chat-send', { 'aria-label': 'Send', onclick: () => (busy ? busy.abort() : send()) }, '↑');
  const seg = h('div.seg.small-seg.chat-seg', {});
  const libNote = h('div.muted.small.chat-lib', {});
  const engineNote = h('div.muted.small.chat-lib', {});

  const drawSeg = () => {
    seg.replaceChildren(
      h('button' + (engine === 'book' ? '.on' : ''), { onclick: () => setEngine('book'), title: 'Quotes your books. Free, instant, offline.' }, '📖 Book'),
      h('button' + (engine === 'local' ? '.on' : ''), { onclick: () => setEngine('local'), title: 'An open model on this device. Free and private.' }, '🧠 On-device'),
      h('button' + (engine === 'claude' ? '.on' : ''), { onclick: () => setEngine('claude'), title: 'Claude via your API key.' }, '✨ Claude'));
    engineNote.textContent = engine === 'local'
      ? `${LOCAL_MODELS[localKey()].name} on this device · free · ${localReady(localKey()) ? 'ready' : `downloads ~${(LOCAL_MODELS[localKey()].size / 1000).toFixed(1)} GB once`} · `
      : engine === 'claude' ? 'Claude tutor · billed to your API key · ' : 'Quotes your books · free · offline · ';
    engineNote.append(h('a', { href: '#/library' }, 'change'));
  };
  const setEngine = e => {
    if (e === 'claude' && !tutorKey()) {
      sheet(h('div', {},
        h('p', {}, 'The Claude tutor needs your own Anthropic API key. It runs on Anthropic\'s servers and is billed to your account per question (usually a few cents).'),
        h('p.muted.small', {}, 'Book mode stays free and works offline: it answers with the matching sentences from your books.'),
        h('a.btn.full', { href: '#/library' }, 'Add a key in Library & AI ›')), { title: 'Claude tutor' });
      return;
    }
    engine = e;
    update(s => { s.settings.chatEngine = e; });
    drawSeg();
  };

  const drawLib = async () => {
    const docs = await listDocs().catch(() => []);
    libNote.replaceChildren(docs.length ? `Searching ${docs.map(d => d.name).join(', ')} + the app's lessons · ` : 'Searching the app\'s lessons only · ', h('a', { href: '#/library' }, docs.length ? 'library' : 'add your books'));
  };

  // ---------- rendering ----------
  const sources = (src, open = false) => src?.length ? h('details.chat-src', { open: open || null },
    h('summary', {}, `Passages (${src.length})`),
    src.map(x => h('div.src-card', {},
      h('div.src-head', {}, h('strong', {}, label(x)), x.ch ? h('span.muted.small', {}, ` · ${x.ch}`) : null,
        x.pdf && cloudOn() ? h('button.btn.tiny.ghost', { onclick: () => openPdf(x) }, 'Open page') : null),
      h('div.src-text', {}, textOf.get(`${x.doc}:${x.i}`) || x.text || '(this book is no longer in your library)')))) : null;

  const actions = m => h('div.chat-actions', {},
    h('button.btn.tiny.ghost', {
      onclick: () => {
        const text = m.engine !== 'book' ? m.text : (m.points || []).map(p => p.s).join(' ') + ' ' + (m.src || []).map(x => textOf.get(`${x.doc}:${x.i}`) || '').join(' ');
        const qs = ruleCues(text, 6);
        const topic = currentTopic();
        const n = bankAdd(qs, { topic, src: `chat: ${m.q || ''}`.slice(0, 80), engine: 'quick' });
        toast(n ? `${n} cue questions saved under ${topicTitle(topic)} (Cue lab)` : 'Those cues are already in your bank');
      },
    }, '✨ Cue questions'),
    h('button.btn.tiny.ghost', { onclick: () => { navigator.clipboard?.writeText(m.engine !== 'book' ? m.text : (m.points || []).map(p => `• ${p.s} (${label(p)})`).join('\n')).then(() => toast('Copied')); } }, 'Copy'));

  const bubble = m => {
    if (m.role === 'user') return h('div.msg.me', {}, h('div.bubble', {}, m.text));
    if (m.engine === 'claude' || m.engine === 'local') {
      return h('div.msg.bot', {},
        h('div.bubble.md', { html: md(m.text || '') }),
        m.error ? h('div.verdict.bad', {}, m.error) : null,
        h('div.muted.small', {}, `${m.engine === 'local' ? `${LOCAL_MODELS[m.model]?.name || 'On-device model'} · on this device` : 'Claude'} · grounded in ${m.src?.length || 0} passage${m.src?.length === 1 ? '' : 's'}`),
        sources(m.src), actions(m));
    }
    const pts = m.points || [];
    return h('div.msg.bot', {},
      h('div.bubble', {},
        pts.length ? [h('div.muted.small', {}, 'From your books'),
          h('ul.points', {}, pts.map(p => h('li', {}, p.s, ' ', h('span.cite', {}, label(p)))))]
          : h('p', {}, 'Nothing in your library matches that well. Try different words (the protocol or command name works best), add a book, or ask the Claude tutor.')),
      sources(m.src, !pts.length && m.src?.length), m.src?.length ? actions(m) : null);
  };

  const empty = () => h('div.chat-empty', {},
    h('div.big-emoji', {}, '💬'),
    h('p', {}, 'Ask anything from the exam topics. Book mode quotes your books with page numbers; the Claude tutor explains in depth.'),
    h('div.chips.chat-starters', {}, [...STARTERS, `Explain the key ideas of ${topicTitle(currentTopic())}`].map(q => h('button.chip-btn', { onclick: () => { input.value = q; send(); } }, q))));

  const draw = () => {
    const t = thread();
    list.replaceChildren(...(t?.msgs.length ? t.msgs.map(bubble) : [empty()]));
    requestAnimationFrame(() => list.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  };

  async function openPdf(x) {
    try {
      const doc = (await listDocs()).find(d => d.id === x.doc);
      toast('Opening the PDF…');
      const url = await pdfUrl(doc, x.pp || x.p);
      if (url) window.open(url, '_blank');
    } catch (e) { toast(`Couldn't open it: ${e.message}`, 4000); }
  }

  // ---------- sending ----------
  async function send() {
    const q = input.value.trim();
    if (!q || busy) return;
    input.value = ''; fit();
    buzz(6);
    const t = ensureThread();
    const prevQ = [...t.msgs].reverse().find(m => m.role === 'user')?.text || '';
    // short follow-ups ("why?", "and on a trunk?", "what about priority 0?") borrow the previous question's words
    const followUp = prevQ && words(q).length < 3 && (!words(q).length || /\b(it|its|that|this|those|these|they|them|why|and|about|instead|else|then|there)\b/i.test(q));
    const query = followUp ? `${prevQ} ${q}` : q;
    update(s => { const th = s.chat.threads.find(x => x.id === t.id); th.msgs.push({ role: 'user', text: q, at: Date.now() }); if (!th.title) th.title = q.slice(0, 60); th.at = Date.now(); });
    draw();

    const idx = await fullIndex();
    if (textOf.size !== idx.items.length) await loadText();
    const docs = await listDocs().catch(() => []);
    const pdfOf = id => docs.find(d => d.id === id)?.pdf || null;
    const hits = search(idx, query, { k: engine === 'claude' ? 5 : 4, terms: 16 });
    const src = hits.map(x => ({ doc: x.doc, i: x.i, name: x.name, p: x.p, pp: x.pp, ch: x.ch, pdf: pdfOf(x.doc) })); // text is looked up from the index when shown

    if (engine === 'book') {
      const points = keyPoints(hits, query, 6).map(p => ({ s: p.s, name: p.name, p: p.p, pp: p.pp, doc: p.doc }));
      update(s => { s.chat.threads.find(x => x.id === t.id).msgs.push({ role: 'assistant', engine: 'book', q, points, src, at: Date.now() }); });
      draw();
      return;
    }

    // Claude or on-device model: stream into a live bubble, then save
    const live = h('div.bubble.md', {}, h('span.muted', {}, engine === 'local' && !localReady(localKey()) ? 'Getting the model ready…' : 'Thinking…'));
    const prog = h('div.bar', { hidden: true }, h('span', { style: { width: '0%' } }));
    const progLabel = h('div.muted.small', {});
    list.append(h('div.msg.bot', {}, live, progLabel, prog));
    live.scrollIntoView({ block: 'end' });
    busy = new AbortController();
    sendBtn.textContent = '■'; sendBtn.setAttribute('aria-label', 'Stop');
    const prior = t.msgs.slice(0, -1);
    let acc = '';
    let raf = 0;
    const onText = d => { acc += d; if (!raf) raf = requestAnimationFrame(() => { raf = 0; live.innerHTML = md(acc); live.scrollIntoView({ block: 'end' }); }); };
    try {
      if (engine === 'local') {
        const key = localKey();
        // earlier generated exchanges as plain text (excerpts are only sent for the new question)
        const history = [];
        prior.forEach((m, i) => { const a = prior[i + 1]; if (m.role === 'user' && (a?.engine === 'local' || a?.engine === 'claude') && a.text && !a.error) history.push({ role: 'user', content: m.text }, { role: 'assistant', content: a.text }); });
        const excerpts = hits.slice(0, 4).map(x => `[${typeof x.p === 'number' ? `p.${x.p}` : x.p}] ${x.text}`).join('\n\n');
        const text = await askLocal({
          key, history, question: q, excerpts, onText, signal: busy.signal,
          onProgress: (p, l) => { progLabel.textContent = p >= 1 ? '' : l; prog.hidden = p >= 1; prog.firstChild.style.width = `${Math.round(p * 100)}%`; if (p >= 1) { live.replaceChildren(h('span.muted', {}, 'Thinking…')); drawSeg(); } },
        });
        if (busy.signal.aborted) throw Object.assign(new Error('Stopped.'), { name: 'AbortError' });
        update(s => { s.chat.threads.find(x => x.id === t.id).msgs.push({ role: 'assistant', engine: 'local', model: key, q, text, src, at: Date.now() }); });
      } else {
        // earlier Claude exchanges, as complete user→assistant pairs exactly as they were sent
        const pairs = [];
        prior.forEach((m, i) => { const a = prior[i + 1]; if (m.role === 'user' && m.api && a?.engine === 'claude' && a.text && !a.error) pairs.push({ role: 'user', content: m.api }, { role: 'assistant', content: a.text }); });
        const res = await askTutor({ history: pairs.slice(-16), question: q, hits, signal: busy.signal, onText });
        update(s => {
          const th = s.chat.threads.find(x => x.id === t.id);
          th.msgs[th.msgs.length - 1].api = res.content; // the exact user turn sent, so later turns replay it unchanged
          th.msgs.push({ role: 'assistant', engine: 'claude', model: TUTOR_MODEL, q, text: res.text, src, at: Date.now() });
        });
      }
    } catch (e) {
      const stopped = e?.name === 'AbortError' || /abort|stopped/i.test(e?.message || '');
      update(s => { s.chat.threads.find(x => x.id === t.id).msgs.push({ role: 'assistant', engine, model: engine === 'local' ? localKey() : TUTOR_MODEL, q, text: acc, src, error: stopped ? 'Stopped.' : e.message, at: Date.now() }); });
    } finally {
      busy = null;
      sendBtn.textContent = '↑'; sendBtn.setAttribute('aria-label', 'Send');
      draw();
    }
  }

  // ---------- threads ----------
  const history = () => {
    const ts = chatState().threads;
    const close = sheet(h('div.thread-list', {},
      ts.length ? ts.map(t => h('div.thread-row', {},
        h('button.grow.thread-open', { onclick: () => { update(s => { s.chat.cur = t.id; }); close(); draw(); } },
          h('div.thread-title', {}, t.title || 'Untitled'), h('div.muted.small', {}, `${t.msgs.filter(m => m.role === 'user').length} questions · ${new Date(t.at).toLocaleDateString()}`)),
        h('button.icon-btn.tiny', { 'aria-label': 'Delete chat', onclick: e => { update(s => { s.chat.threads = s.chat.threads.filter(x => x.id !== t.id); if (s.chat.cur === t.id) s.chat.cur = null; }); e.currentTarget.closest('.thread-row').remove(); draw(); } }, '✕')))
        : h('p.muted', {}, 'No chats yet.')), { title: 'Chats' });
  };

  root.append(
    h('header.view-head', {}, h('h1.grow', {}, 'Chat'),
      h('button.icon-btn', { 'aria-label': 'Chat history', title: 'Chats', onclick: history }, '🕘'),
      h('button.icon-btn', { 'aria-label': 'New chat', title: 'New chat', onclick: () => { update(s => { s.chat.cur = null; }); draw(); input.focus(); } }, '＋'),
      h('a.icon-btn', { href: '#/library', 'aria-label': 'Library & AI settings', title: 'Library & AI' }, '⚙')),
    seg, engineNote, libNote, list,
    h('div.chat-bar', {}, input, sendBtn));
  drawSeg(); drawLib();
  loadText().finally(draw);
  if (cloudOn()) syncLibrary().then(async r => { if (r.down || r.gone) { drawLib(); await loadText(); draw(); } }).catch(() => {});
  return () => busy?.abort();
}
