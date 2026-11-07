// Tiny DOM helpers: h() element builder, bottom sheet, toast, markdown-lite.

import { dragDismiss } from './gestures.js';

export function h(tag, attrs = {}, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Inline markdown: `code`, **bold**, *em*. Input is escaped first. */
export function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

/** Block markdown-lite → HTML string (headings, lists, code, tables, paragraphs). */
export function md(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++;
      out.push(`<pre class="code">${esc(buf.join('\n'))}</pre>`);
    } else if (/^#{1,3} /.test(l)) {
      const n = l.match(/^#+/)[0].length + 1;
      out.push(`<h${n}>${inline(l.replace(/^#+ /, ''))}</h${n}>`);
      i++;
    } else if (/^\s*[-*] /.test(l) || /^\s*\d+\. /.test(l)) {
      const ordered = /^\s*\d+\. /.test(l);
      const buf = [];
      while (i < lines.length && (/^\s*[-*] /.test(lines[i]) || /^\s*\d+\. /.test(lines[i]))) {
        buf.push(`<li>${inline(lines[i].replace(/^\s*([-*]|\d+\.) /, ''))}</li>`);
        i++;
      }
      out.push(ordered ? `<ol>${buf.join('')}</ol>` : `<ul>${buf.join('')}</ul>`);
    } else if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(2).map(cells);
      out.push(`<div class="tablewrap"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (!l.trim()) {
      i++;
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3} |```|\||\s*[-*] |\s*\d+\. )/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${inline(buf.join(' '))}</p>`);
    }
  }
  return out.join('');
}

let sheetEl = null;
/** Bottom sheet (modal on desktop). Returns a close function. */
export function sheet(content, { onClose, tall = false, title } = {}) {
  closeSheet();
  const close = () => { closeSheet(); onClose?.(); };
  const panel = h('div.sheet' + (tall ? '.tall' : ''), { role: 'dialog', 'aria-modal': 'true' },
    h('div.sheet-head', {},
      h('div.grab', {}),
      title ? h('div.sheet-title', {}, title) : null,
      h('button.icon-btn.sheet-x', { 'aria-label': 'Close', onclick: close }, '✕')),
    h('div.sheet-body', {}, content));
  sheetEl = h('div.scrim', { onclick: e => { if (e.target === sheetEl) close(); } }, panel);
  document.body.append(sheetEl);
  dragDismiss(panel.querySelector('.sheet-head'), panel, close);
  requestAnimationFrame(() => sheetEl?.classList.add('open'));
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  sheetEl._off = () => document.removeEventListener('keydown', onKey);
  return close;
}

export function closeSheet() {
  if (!sheetEl) return;
  sheetEl._off?.();
  sheetEl.remove();
  sheetEl = null;
}

export function toast(msg, ms = 2200) {
  const t = h('div.toast', {}, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

export function download(name, text, type = 'text/plain') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const fmtDate = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
