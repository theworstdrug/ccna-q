// Anki: build a deck from several sources and get it into Anki in one step.
//   • iPhone / anywhere: a real .apkg (share → AnkiMobile), re-imports update in place
//   • Desktop: AnkiConnect push (adds + updates) and pull review stats back into the app

import { h, toast, download } from '../ui.js';
import { db, update } from '../store.js';
import { SOURCES, collectNotes, noteHash, defaultSelection, parseCustom } from '../anki/sources.js';
import { buildApkg, loadSql } from '../anki/apkg.js';
import { ping, pushNotes, pullStats, ANKICONNECT_CODE } from '../anki/connect.js';
import { blankCard } from '../srs.js';
import { buzz } from '../gestures.js';

const JITL_URL = 'https://jitl.jp/ccna-files';

const st = () => {
  const s = db();
  s.anki = s.anki || {};
  s.anki.sel = { ...defaultSelection(), ...(s.anki.sel || {}) };
  return s.anki;
};

export function render(root) {
  const a = st();
  const summary = h('div.anki-summary', {});
  const status = h('div.anki-status', {});

  const current = () => collectNotes(st().sel);
  const drawSummary = () => {
    const notes = current();
    const last = st().last;
    const hashes = last?.hashes || {};
    const changed = notes.filter(n => hashes[n.id] !== noteHash(n)).length;
    const decks = new Set(notes.map(n => n.deck)).size;
    summary.replaceChildren(
      h('div.anki-big', {}, h('strong', {}, notes.length), ' cards in ', h('strong', {}, decks), ' decks'),
      h('div.muted.small', {}, last
        ? `${changed} new or changed since your last export (${new Date(last.at).toLocaleDateString()} via ${last.method})`
        : 'Never exported yet: the first import creates everything under a "CCNA-Q" deck.'));
  };

  // ---------- sources
  const srcList = h('div.src-list', {});
  for (const src of SOURCES) {
    const sel = a.sel[src.id];
    const count = h('span.src-count', {});
    const paint = () => { count.textContent = `${src.build(st().sel[src.id].opt || src.def).length}`; };
    const toggle = h('input', { type: 'checkbox', checked: sel.on, 'aria-label': `Include ${src.title}`, onchange: e => { update(() => { st().sel[src.id].on = e.target.checked; }); row.classList.toggle('off', !e.target.checked); drawSummary(); } });
    const opt = src.options.length > 1 ? h('select.input.src-opt', {
      'aria-label': `${src.title} scope`,
      onchange: e => { update(() => { st().sel[src.id].opt = e.target.value; }); paint(); drawSummary(); },
    }, src.options.map(([v, l]) => h('option', { value: v, selected: (sel.opt || src.def) === v }, l))) : null;
    const row = h('div.src-row' + (sel.on ? '' : '.off'), {},
      h('label.src-main', {}, toggle, h('div.grow', {}, h('div.src-title', {}, src.title, ' ', count), h('div.muted.small', {}, src.desc))),
      opt);
    paint();
    srcList.append(row);
  }

  // custom cards
  const custom = h('textarea.input.custom-cards', {
    rows: 4, placeholder: 'One card per line:\nWhat does PoE stand for? ; Power over Ethernet\nshow ip int br ; one line per interface: IP + status',
    oninput: e => { update(() => { st().custom = e.target.value; }); customCount.textContent = `${parseCustom(e.target.value).length} cards`; drawSummary(); },
  }, a.custom || '');
  const customCount = h('span.muted.small', {}, `${parseCustom(a.custom || '').length} cards`);

  // ---------- actions
  const setStatus = (msg, kind = '') => status.replaceChildren(h('div.anki-msg' + (kind ? `.${kind}` : ''), {}, msg));
  const remember = (notes, method) => update(() => {
    st().last = { at: Date.now(), method, count: notes.length, hashes: Object.fromEntries(notes.map(n => [n.id, noteHash(n)])) };
    window.dispatchEvent(new Event('ccnaq:nav'));
  });

  const exportApkg = async btn => {
    const notes = current();
    if (!notes.length) { toast('Pick at least one source'); return; }
    btn.disabled = true;
    setStatus('Building your deck…');
    try {
      const SQL = await loadSql();
      const bytes = await buildApkg(SQL, notes);
      const name = `CCNA-Q-${new Date().toISOString().slice(0, 10)}.apkg`;
      const file = typeof File === 'function' ? new File([bytes], name, { type: 'application/octet-stream' }) : null;
      let shared = false;
      if (file && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'CCNA-Q Anki deck' }); shared = true; } catch (e) { if (e?.name === 'AbortError') { setStatus('Cancelled.'); return; } }
      }
      if (!shared) download(name, bytes, 'application/octet-stream');
      remember(notes, '.apkg');
      buzz(15);
      setStatus(`✓ ${notes.length} cards packed. ${shared ? 'Pick AnkiMobile in the share sheet.' : 'Open the downloaded file with Anki (double-click on desktop).'} Re-importing later updates cards and keeps your progress.`, 'ok');
      drawSummary();
    } catch (e) {
      setStatus(`Couldn't build the deck: ${e.message}`, 'bad');
    } finally { btn.disabled = false; }
  };

  const sendDesktop = async btn => {
    const notes = current();
    if (!notes.length) { toast('Pick at least one source'); return; }
    btn.disabled = true;
    try {
      await ping();
      const r = await pushNotes(notes, msg => setStatus(msg));
      remember(notes, 'AnkiConnect');
      buzz(15);
      setStatus(`✓ Anki updated: ${r.added} added, ${r.updated} updated, ${r.unchanged} already up to date. Sync in Anki to send them to AnkiWeb and your phone.`, 'ok');
      drawSummary();
    } catch (e) {
      setStatus(e.message, 'bad');
      setup.open = true;
    } finally { btn.disabled = false; }
  };

  const pullBack = async btn => {
    btn.disabled = true;
    try {
      setStatus('Reading your review stats from Anki…');
      const r = applyAnkiStats(await pullStats());
      setStatus(`✓ From Anki: ${r.weak} terms you keep missing are now marked weak (they'll show on your notebook To-write list), ${r.known} mature terms marked known.`, 'ok');
      window.dispatchEvent(new Event('ccnaq:nav'));
    } catch (e) {
      setStatus(e.message, 'bad');
      setup.open = true;
    } finally { btn.disabled = false; }
  };

  const origin = location.origin;
  const setup = h('details.panel.anki-setup', {},
    h('summary', {}, h('strong', {}, 'Set up one-click send (Anki desktop, once)')),
    h('ol', {},
      h('li', {}, 'In Anki desktop: Tools → Add-ons → Get Add-ons → code ', h('code', {}, ANKICONNECT_CODE), ' (AnkiConnect). Restart Anki.'),
      h('li', {}, 'Tools → Add-ons → AnkiConnect → Config. Add this site to ', h('code', {}, 'webCorsOriginList'), ':',
        h('div.copy-row', {}, h('code', {}, origin), h('button.btn.ghost.small', { onclick: () => { navigator.clipboard?.writeText(origin); toast('Copied'); } }, 'Copy'))),
      h('li', {}, 'Keep Anki open, then use "Send to Anki desktop" here. Your browser may ask to allow access to devices on your local network: allow it.')),
    h('p.muted.small', {}, 'AnkiWeb has no import, so cards reach your phone when you sync Anki. On the iPhone itself, use the .apkg button instead.'));

  root.append(
    h('header.view-head', {}, h('a.icon-btn', { href: '#/review', 'aria-label': 'Back' }, '‹'), h('h1.grow', {}, 'Anki')),
    h('p.hint', {}, 'Turn what\'s in this app (and what you add yourself) into Anki decks. Exports keep stable card ids, so exporting again updates cards instead of duplicating them.'),
    h('section.panel', {}, summary,
      h('div.anki-actions', {},
        h('button.btn.big.full', { onclick: e => exportApkg(e.currentTarget) }, '⬇ Get deck (.apkg)'),
        h('div.muted.small.center', {}, 'iPhone: share → AnkiMobile · Desktop: opens in Anki'),
        h('div.row.wrap', {},
          h('button.btn.ghost', { onclick: e => sendDesktop(e.currentTarget) }, '⚡ Send to Anki desktop'),
          h('button.btn.ghost', { onclick: e => pullBack(e.currentTarget) }, '⇄ Pull review stats'))),
      status),
    h('h2.section-title', {}, 'Sources'),
    srcList,
    h('section.panel', {},
      h('div.panel-head', {}, h('h2', {}, 'Custom cards'), customCount),
      custom),
    h('section.panel.jitl', {},
      h('div.panel-head', {}, h('h2', {}, 'Jeremy\'s IT Lab decks'), h('span.muted.small', {}, 'official, free')),
      h('p', {}, 'Jeremy shares an Anki deck for most course days, with the Packet Tracer labs. They\'re his to distribute, so CCNA-Q doesn\'t copy them: get them from the link in his video descriptions.'),
      h('ol.small', {},
        h('li', {}, 'Open the link below and follow his steps to get the files.'),
        h('li', {}, 'Open each day\'s .apkg with Anki (desktop) or share it to AnkiMobile.'),
        h('li', {}, 'They live alongside the CCNA-Q decks; nothing here overwrites them.')),
      h('div.row.wrap', {},
        h('a.btn', { href: JITL_URL, target: '_blank', rel: 'noopener' }, 'Open jitl.jp/ccna-files ↗'),
        h('label.check', {}, h('input', { type: 'checkbox', checked: !!a.jitl, onchange: e => update(() => { st().jitl = e.target.checked; }) }), h('span', {}, 'I\'ve imported JITL decks')))),
    setup);
  drawSummary();
}

/** Merge Anki review stats into the app's term statuses. */
export function applyAnkiStats(stats) {
  let weak = 0;
  let known = 0;
  update(s => {
    for (const [id, x] of Object.entries(stats)) {
      if (!id.startsWith('g:')) continue;
      const tid = id.slice(2);
      const c = s.terms[tid] || (s.terms[tid] = blankCard());
      if (x.lapses >= 2 && (c.lapses || 0) < x.lapses) {
        c.lapses = x.lapses;
        if (c.status === 5 || c.status === 0) { c.status = 2; c.due = Date.now(); }
        weak++;
      } else if (x.ivl >= 21 && x.lapses < 2 && c.status !== 5) {
        c.status = 5;
        known++;
      }
    }
  });
  return { weak, known };
}
