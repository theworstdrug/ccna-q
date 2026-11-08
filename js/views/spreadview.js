// Spread preview sheet: the chapter's notebook pages with live data, plus Save/Share PDF.

import { h, sheet, toast, download } from '../ui.js';
import { spreadSvg, mistakesSvg, chapterPdf } from '../spread.js';
import { buzz } from '../gestures.js';

export function openSpreadPreview(key) {
  const first = spreadSvg(key, 0);
  const { content } = first;
  const views = [...Array.from({ length: first.count }, (_, i) => ['s', i, `Spread ${i + 1} · pp.${content.start + i * 2}–${content.start + i * 2 + 1}`]),
    ...(content.misses.length ? [['m', 0, `Mistake log (${content.misses.length})`]] : [])];
  let cur = 0;
  const pv = h('div.spread-pv', { title: 'Tap to zoom', onclick: () => { pv.classList.toggle('zoomed'); buzz(4); } });
  const chips = h('div.chips', {});
  const draw = () => {
    const [kind, i] = views[cur];
    pv.innerHTML = kind === 's' ? spreadSvg(key, i).svg : mistakesSvg(key);
    chips.replaceChildren(...views.map((v, k) => h('button.chip-btn' + (k === cur ? '.on' : ''), { onclick: () => { cur = k; draw(); } }, v[2])));
  };
  const save = async () => {
    const bytes = chapterPdf(key);
    const name = `ch${content.n}-notebook-spread.pdf`;
    const file = typeof File === 'function' ? new File([bytes], name, { type: 'application/pdf' }) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: `Ch ${content.n} notebook spread` }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    download(name, bytes, 'application/pdf');
    toast('PDF saved');
  };
  draw();
  sheet(h('div.spread-sheet', {},
    h('p.hint', {}, content.cueSource === 'lesson'
      ? 'Cues come from the app lesson until you add your own (Cornell notes or From notebook). Tap the page to zoom.'
      : 'Built from your cues, struggling terms, quiz misses, labs and summary. Tap the page to zoom.'),
    chips, pv,
    h('div.row.wrap', {},
      h('button.btn', { onclick: save }, '⬇ Save / share PDF'),
      h('a.btn.ghost', { href: `#/notes/${content.n}` }, 'Edit cues & summary'))),
  { title: `Ch ${content.n} · notebook preview`, tall: true });
}
