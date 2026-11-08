// Tiny vector drawing layer with two outputs:
//   SvgDoc  → inline preview in the app
//   PdfDoc  → a real PDF file (built-in Helvetica/Courier, no libraries, works offline)
// Both use the same API with a top-left origin, in points (1/72 in).

const FONTS = {
  sans: ['Helvetica', 'Helvetica, Arial, sans-serif', 'normal', 'normal'],
  hand: ['Helvetica-Oblique', 'Helvetica, Arial, sans-serif', 'italic', 'normal'],
  bold: ['Helvetica-Bold', 'Helvetica, Arial, sans-serif', 'normal', 'bold'],
  mono: ['Courier', '"Courier New", ui-monospace, monospace', 'normal', 'normal'],
  monob: ['Courier-Bold', '"Courier New", ui-monospace, monospace', 'normal', 'bold'],
};
const FONT_KEYS = Object.keys(FONTS);

/** Rough text width. Courier is exactly 0.6 em; Helvetica averages ~0.5 em for mixed text. */
export function textWidth(s, size, font = 'hand') {
  const k = font.startsWith('mono') ? 0.6 : font === 'bold' ? 0.56 : 0.5;
  return String(s).length * size * k;
}

/** Greedy word wrap to a width in points. */
export function wrap(s, width, size, font = 'hand') {
  const out = [];
  for (const para of String(s ?? '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size, font) <= width || !line) line = next;
      else { out.push(line); line = word; }
      while (textWidth(line, size, font) > width && line.length > 4) {
        const cut = Math.max(4, Math.floor(width / (size * 0.52)));
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line);
  }
  return out;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class SvgDoc {
  constructor(w, h) { this.w = w; this.h = h; this.parts = []; }

  line(x1, y1, x2, y2, color = '#000', width = 1) {
    this.parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`);
  }

  rect(x, y, w, h, { stroke = null, fill = null, width = 1 } = {}) {
    this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill || 'none'}" stroke="${stroke || 'none'}" stroke-width="${width}"/>`);
  }

  circle(cx, cy, r, { stroke = null, fill = null, width = 1 } = {}) {
    this.parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill || 'none'}" stroke="${stroke || 'none'}" stroke-width="${width}"/>`);
  }

  text(x, y, s, { font = 'sans', size = 10, color = '#000', anchor = 'start' } = {}) {
    if (s == null || s === '') return;
    const [, family, style, weight] = FONTS[font];
    this.parts.push(`<text x="${x}" y="${y}" font-family='${family}' font-style="${style}" font-weight="${weight}" font-size="${size}" fill="${color}" text-anchor="${anchor}">${esc(s)}</text>`);
  }

  page() { /* single-page preview: no-op */ }

  svg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="100%" role="img">${this.parts.join('')}</svg>`;
  }
}

// ---------------------------------------------------------------- PDF

// Characters outside the PDF's WinAnsi encoding get ASCII stand-ins.
const SUBST = {
  '→': '->', '←': '<-', '↔': '<->', '⇄': '<->', '✓': 'v', '✔': 'v', '✗': 'x', '✕': 'x', '≤': '<=', '≥': '>=',
  '⚠': '!', '📓': '', '📖': '', '📍': '', '☐': '[ ]', '−': '-', '≈': '~', 'ⁿ': '^n', 'ʰ': '^h', '²': '2', '³': '3',
};
const WINANSI = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

function encode(s) {
  let out = '';
  for (const ch of String(s)) {
    const sub = SUBST[ch];
    if (sub !== undefined) { out += sub; continue; }
    const code = WINANSI[ch] ?? ch.codePointAt(0);
    out += code < 256 ? String.fromCharCode(code) : '?';
  }
  return out.replace(/[\\()]/g, m => `\\${m}`);
}

const hex = c => {
  const v = c.replace('#', '');
  const n = v.length === 3 ? v.split('').map(x => x + x).join('') : v;
  return [0, 2, 4].map(i => (parseInt(n.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
};
const f = n => (Math.round(n * 100) / 100).toString();

export class PdfDoc {
  constructor(w, h) { this.w = w; this.h = h; this.pages = []; this.page(); }

  page() { this.ops = []; this.pages.push(this.ops); }

  Y(y) { return this.h - y; }

  line(x1, y1, x2, y2, color = '#000', width = 1) {
    this.ops.push(`${hex(color)} RG ${f(width)} w ${f(x1)} ${f(this.Y(y1))} m ${f(x2)} ${f(this.Y(y2))} l S`);
  }

  paint(stroke, fill, width) {
    const p = [];
    if (stroke) p.push(`${hex(stroke)} RG ${f(width)} w`);
    if (fill) p.push(`${hex(fill)} rg`);
    return [p.join(' '), stroke && fill ? 'B' : fill ? 'f' : 'S'];
  }

  rect(x, y, w, h, { stroke = null, fill = null, width = 1 } = {}) {
    const [pre, op] = this.paint(stroke, fill, width);
    this.ops.push(`${pre} ${f(x)} ${f(this.Y(y + h))} ${f(w)} ${f(h)} re ${op}`);
  }

  circle(cx, cy, r, { stroke = null, fill = null, width = 1 } = {}) {
    const k = 0.5523 * r;
    const y = this.Y(cy);
    const [pre, op] = this.paint(stroke, fill, width);
    this.ops.push(`${pre} ${f(cx + r)} ${f(y)} m ${f(cx + r)} ${f(y + k)} ${f(cx + k)} ${f(y + r)} ${f(cx)} ${f(y + r)} c `
      + `${f(cx - k)} ${f(y + r)} ${f(cx - r)} ${f(y + k)} ${f(cx - r)} ${f(y)} c ${f(cx - r)} ${f(y - k)} ${f(cx - k)} ${f(y - r)} ${f(cx)} ${f(y - r)} c `
      + `${f(cx + k)} ${f(y - r)} ${f(cx + r)} ${f(y - k)} ${f(cx + r)} ${f(y)} c ${op}`);
  }

  text(x, y, s, { font = 'sans', size = 10, color = '#000', anchor = 'start' } = {}) {
    if (s == null || s === '') return;
    let tx = x;
    if (anchor !== 'start') { const w = textWidth(s, size, font); tx = anchor === 'middle' ? x - w / 2 : x - w; }
    this.ops.push(`BT /F${FONT_KEYS.indexOf(font) + 1} ${f(size)} Tf ${hex(color)} rg ${f(tx)} ${f(this.Y(y))} Td (${encode(s)}) Tj ET`);
  }

  /** Assemble the file. Returns a Uint8Array. */
  bytes(title = 'CCNA notebook') {
    const objs = [];
    const add = s => { objs.push(s); return objs.length; };
    const catalog = add(null);
    const pagesObj = add(null);
    const fontObjs = FONT_KEYS.map(k => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[k][0]} /Encoding /WinAnsiEncoding >>`));
    const fontDict = fontObjs.map((o, i) => `/F${i + 1} ${o} 0 R`).join(' ');
    const kids = [];
    for (const ops of this.pages) {
      const stream = ops.join('\n');
      const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${this.w} ${this.h}] /Resources << /Font << ${fontDict} >> >> /Contents ${content} 0 R >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
    objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const info = add(`<< /Title (${encode(title)}) /Producer (CCNA-Q) >>`);
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
