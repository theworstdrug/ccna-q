#!/usr/bin/env python3
"""Generate docs/notebook-guide.pdf: how to set up and format the paper CCNA notebook.

    python3 tools/notebook_guide.py

Needs reportlab plus the DejaVu and GNU FreeFont fonts (fonts-dejavu-core, fonts-freefont-ttf).
"""
import os
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.utils import simpleSplit
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle, Paragraph
from reportlab.lib.styles import ParagraphStyle

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'notebook-guide.pdf')
PAGES = 154  # this notebook: 77 sheets
DEJAVU = '/usr/share/fonts/truetype/dejavu'
FREE = '/usr/share/fonts/truetype/freefont'

for name, path in [('Sans', f'{DEJAVU}/DejaVuSans.ttf'), ('Sans-B', f'{DEJAVU}/DejaVuSans-Bold.ttf'),
                   ('Sans-I', f'{FREE}/FreeSansOblique.ttf'),
                   ('Mono', f'{DEJAVU}/DejaVuSansMono.ttf'), ('Mono-B', f'{DEJAVU}/DejaVuSansMono-Bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name, path))

INK = HexColor('#14171c')
MUTED = HexColor('#5f6b7a')
LINE = HexColor('#cfd6df')
RULE = HexColor('#a9c6e8')     # notebook ruling blue
MARGIN = HexColor('#e7a3a3')   # notebook margin pink
ACCENT = HexColor('#0a66c2')
PEN = HexColor('#1d3f8f')      # "handwriting" ink
PENCIL = HexColor('#c0392b')   # the lines you draw yourself
SOFT = HexColor('#eef4fb')
WARN = HexColor('#b45309')
OK = HexColor('#15803d')

ZONE = {'header': HexColor('#fff4cc'), 'notes': HexColor('#e8f1fd'), 'lab': HexColor('#e7f6ec'),
        'summary': HexColor('#fde8e8'), 'cues': HexColor('#f1e9fb')}


# ---------------------------------------------------------------- helpers

def text(c, x, y, s, font='Sans', size=10, color=INK, anchor='l'):
    c.setFont(font, size)
    c.setFillColor(color)
    if anchor == 'c':
        c.drawCentredString(x, y, s)
    elif anchor == 'r':
        c.drawRightString(x, y, s)
    else:
        c.drawString(x, y, s)


def para(c, x, y, w, s, font='Sans', size=10, leading=None, color=INK):
    """Wrapped text; returns the y below the last line."""
    leading = leading or size * 1.38
    for line in simpleSplit(s, font, size, w):
        text(c, x, y, line, font, size, color)
        y -= leading
    return y


def bullets(c, x, y, w, items, size=10, gap=3, bullet='•', color=INK):
    for it in items:
        text(c, x, y, bullet, 'Sans-B', size, ACCENT)
        y = para(c, x + 13, y, w - 13, it, 'Sans', size, color=color) - gap
    return y


def heading(c, x, y, s, size=15, color=INK):
    text(c, x, y, s, 'Sans-B', size, color)
    return y - size * 1.5


def badge(c, x, y, n, r=8, fill=ACCENT):
    c.setFillColor(fill)
    c.circle(x, y, r, stroke=0, fill=1)
    text(c, x, y - r * 0.38, str(n), 'Sans-B', r * 1.1, white, 'c')


def arrow(c, x1, y1, x2, y2, color=MUTED, width=1.2, head=5):
    import math
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)
    a = math.atan2(y2 - y1, x2 - x1)
    p = c.beginPath()
    p.moveTo(x2, y2)
    p.lineTo(x2 - head * math.cos(a - 0.45), y2 - head * math.sin(a - 0.45))
    p.lineTo(x2 - head * math.cos(a + 0.45), y2 - head * math.sin(a + 0.45))
    p.close()
    c.drawPath(p, stroke=0, fill=1)


def dim(c, x1, x2, y, label, color=PENCIL):
    """Horizontal dimension line with arrows both ends."""
    arrow(c, (x1 + x2) / 2, y, x1, y, color, 0.9, 4)
    arrow(c, (x1 + x2) / 2, y, x2, y, color, 0.9, 4)
    text(c, (x1 + x2) / 2, y + 4, label, 'Sans-B', 7.5, color, 'c')


def footer(c, n, title='CCNA notebook guide'):
    w, _ = c._pagesize
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(40, 30, w - 40, 30)
    text(c, 40, 18, title, 'Sans', 8, MUTED)
    text(c, w - 40, 18, f'{n}', 'Sans', 8, MUTED, 'r')


def table(c, x, y, w, rows, widths, header=True, size=8.5, zebra=True, styles=()):
    st = ParagraphStyle('t', fontName='Sans', fontSize=size, leading=size * 1.25, textColor=INK)
    sh = ParagraphStyle('th', parent=st, fontName='Sans-B', textColor=white)
    data = [[Paragraph(str(v) if str(v) else '&nbsp;', sh if (header and i == 0) else st) for v in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=[w * f for f in widths])
    cmds = [('GRID', (0, 0), (-1, -1), 0.4, LINE), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 2.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
            ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4)]
    if header:
        cmds.append(('BACKGROUND', (0, 0), (-1, 0), ACCENT))
    if zebra:
        for i in range(1 if header else 0, len(rows)):
            if i % 2 == 0:
                cmds.append(('BACKGROUND', (0, i), (-1, i), HexColor('#f5f7fa')))
    cmds.extend(styles)
    t.setStyle(TableStyle(cmds))
    _, th = t.wrapOn(c, w, 1000)
    t.drawOn(c, x, y - th)
    return y - th - 10  # room so a caption's first line doesn't touch the table


def card(c, x, y, w, h, title, sub=None, fill=SOFT):
    c.setFillColor(fill)
    c.setStrokeColor(LINE)
    c.roundRect(x, y - h, w, h, 8, stroke=1, fill=1)
    text(c, x + 12, y - 20, title, 'Sans-B', 11.5)
    if sub:
        text(c, x + w - 12, y - 20, sub, 'Sans', 8.5, MUTED, 'r')
    return y - 34


# ---------------------------------------------------------------- notebook page drawing

def notebook_page(c, x, y, w, h, side='R', lines=28, num=None):
    """A college-ruled page. side='L' is a left-hand (even) page, 'R' a right-hand (odd) page.
    Draws the printed pink margin, binding holes on the inner edge and the page-number box
    in the top outer corner. Returns (line positions top→bottom, line spacing, box rect)."""
    c.setFillColor(white)
    c.setStrokeColor(HexColor('#9aa5b1'))
    c.setLineWidth(0.8)
    c.rect(x, y, w, h, stroke=1, fill=1)
    top_gap = h * 0.075
    sp = (h - top_gap - h * 0.03) / lines
    ys = [y + h - top_gap - i * sp for i in range(lines)]
    c.setStrokeColor(RULE)
    c.setLineWidth(0.45)
    for ly in ys:
        c.line(x + 2, ly, x + w - 2, ly)
    # printed margin (narrow) – the cue line you draw is wider
    mx = x + w * 0.11
    c.setStrokeColor(MARGIN)
    c.setLineWidth(0.6)
    c.line(mx, y + 2, mx, y + h - 2)
    # punched holes sit on the binding (inner) edge
    hx = x + w * 0.045 if side == 'R' else x + w * 0.955
    c.setFillColor(HexColor('#e9edf2'))
    c.setStrokeColor(HexColor('#b8c1cc'))
    for f in (0.15, 0.5, 0.85):
        c.circle(hx, y + h * f, w * 0.018, stroke=1, fill=1)
    # page-number box in the top outer corner
    bw, bh = w * 0.13, top_gap * 0.62
    bx = x + w - bw - 5 if side == 'R' else x + 5
    by = y + h - bh - (top_gap - bh) / 2
    c.setFillColor(white)
    c.setStrokeColor(HexColor('#7d8896'))
    c.setLineWidth(0.8)
    c.rect(bx, by, bw, bh, stroke=1, fill=1)
    if num is not None:
        text(c, bx + bw / 2, by + bh / 2 - 3.5, str(num), 'Sans-I', 10, PEN, 'c')
    return ys, sp, (bx, by, bw, bh)


def shade(c, x, y, w, h, color):
    c.setFillColor(color)
    c.rect(x, y, w, h, stroke=0, fill=1)


def pencil(c, x1, y1, x2, y2, width=1.6):
    c.setStrokeColor(PENCIL)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)


# ================================================================= PAGE 1 · overview

def page_overview(c, n):
    W, H = letter
    x, y = 40, H - 54
    text(c, x, y, 'CCNA Notebook Guide', 'Sans-B', 26)
    y -= 22
    text(c, x, y, f'How to set up and fill the pen+GEAR 1-subject notebook ({PAGES // 2} sheets = {PAGES} pages, college ruled)', 'Sans', 10.5, MUTED)
    y -= 14
    text(c, x, y, 'Method: Cornell notes · one topic per two-page spread · cues are questions · summary after the lab', 'Sans', 10.5, MUTED)

    # page map
    y -= 34
    y = heading(c, x, y, '1  Page map: decide where everything goes before you write')
    bx, bw, bh = x, W - 80, 34
    segs = [(1, 2, 'Index', HexColor('#ffd166')), (3, 9, 'Reference', HexColor('#ef8354')),
            (10, 71, 'Book chapters  (ch 1–20, in order)', HexColor('#4f9dde')),
            (72, 135, 'Beyond the book  (JITL topics)', HexColor('#43aa8b')),
            (136, PAGES, 'Back section', HexColor('#b07bd6'))]
    for a, b, label, col in segs:
        sx = bx + (a - 1) / PAGES * bw
        sw = (b - a + 1) / PAGES * bw
        c.setFillColor(col)
        c.rect(sx, y - bh, sw, bh, stroke=0, fill=1)
        c.setStrokeColor(white)
        c.setLineWidth(1.5)
        c.line(sx, y - bh, sx, y)
        if sw > 60:
            text(c, sx + sw / 2, y - bh / 2 - 3.5, label, 'Sans-B', 8.5, white, 'c')
    for p in (10, 72, 136):
        text(c, bx + (p - 1) / PAGES * bw, y - bh - 11, f'p.{p}', 'Sans', 7.5, MUTED, 'c')
    text(c, bx + bw, y - bh - 11, f'p.{PAGES}', 'Sans', 7.5, MUTED, 'r')
    # the two thin segments get a key instead of a label
    ky = y - bh - 25
    for i, (lab, col) in enumerate([('Index p.1–2', HexColor('#ffd166')), ('Reference p.3–9', HexColor('#ef8354'))]):
        kx = bx + i * 92
        c.setFillColor(col)
        c.rect(kx, ky - 1, 8, 8, stroke=0, fill=1)
        text(c, kx + 12, ky, lab, 'Sans', 7.5, MUTED)
    y -= bh + 42
    rows = [['Pages', 'Section', 'What goes there'],
            ['1–2', 'Index', 'Topic → page number. Fill it in as you go. (Mirror in the app: Book → Notebook.)'],
            ['3–9', 'Reference', 'pp.3–8: subnetting, ports, AD/route codes, IOS modes, "book is outdated" list, OSI chart (guide pages 5–8). p.9: your tab-colour key (guide page 8).'],
            ['10–71', 'Book chapters', 'One spread per chapter you read or skim, starting on an even page: about 3–4 pages each, 6 for Ch 8 and Ch 20. Skip chapters 4, 14 and Appendix A.'],
            ['72–135', 'Beyond the book', 'About 4 pages each: VLANs, STP, EtherChannel, OSPF, IPv6, FHRP, NAT, services, QoS, security, wireless, automation'],
            ['136–154', 'Back section', 'Work backwards: mistake log from p.154, weekly review log from p.145 (guide page 9)']]
    y = table(c, x, y, W - 80, rows, [0.11, 0.17, 0.72], size=8.8)

    # setup checklist + tabs
    y -= 26
    colw = (W - 80 - 20) / 2
    y0 = y
    yy = heading(c, x, y, '2  Setup tonight (≈20 min)')
    steps = [f'Write the page number in the corner box of every page, 1–{PAGES}. Odd numbers are right-hand pages, even numbers left-hand.',
             'Pages 1–2: copy the index from guide pages 4–5. Its page numbers are your budget.',
             'Pages 3–9: copy the reference pages and tab key (guide pages 5–8).',
             'Rule the first chapter spread (pages 10–11) as shown on page 2. Every spread starts on an even page.',
             'Page 154: write MISTAKE LOG. Page 145: WEEKLY REVIEW.',
             'Stick a tab on p.3 (Reference) and p.154 (Mistakes).',
             'Don\'t use the perforations. Torn-out pages break the index.']
    for i, s in enumerate(steps, 1):
        badge(c, x + 8, yy + 3.5, i, 7)
        yy = para(c, x + 22, yy, colw - 22, s, size=9.3) - 4

    tx = x + colw + 20
    ty = heading(c, tx, y, '3  Sticky-tab colour key')
    ty = para(c, tx, ty, colw, 'One colour per exam domain. Flag every spread\'s right-hand page in its domain colour (side edge); section flags on the top edge. Colour each box with the flag you choose:', size=9, color=MUTED) - 4
    keys = [('Network Fundamentals', '20%'), ('Network Access', '20%'), ('IP Connectivity', '25%'), ('IP Services', '10%'),
            ('Security Fundamentals', '15%'), ('Automation & Programmability', '10%'), ('Reference pages', ''), ('Mistake log', '')]
    for label, wt in keys:
        c.setStrokeColor(HexColor('#8a96a3'))
        c.setLineWidth(0.8)
        c.setFillColor(white)
        c.roundRect(tx, ty - 3, 22, 13, 2, stroke=1, fill=1)
        text(c, tx + 30, ty, label, 'Sans', 9.3)
        if wt:
            text(c, tx + colw, ty, f'exam {wt}', 'Sans', 8, MUTED, 'r')
        ty -= 19
    footer(c, n)


# ================================================================= PAGE 2 · ruling a spread (landscape)

def draw_spread_frame(c, X, Y, PW, PH, nums=(None, None)):
    """Two notebook pages side by side (left = even, right = odd). Returns geometry."""
    gap = 10
    L = (X, Y)
    R = (X + PW + gap, Y)
    ysL, sp, boxL = notebook_page(c, L[0], L[1], PW, PH, 'L', num=nums[0])
    ysR, _, boxR = notebook_page(c, R[0], R[1], PW, PH, 'R', num=nums[1])
    cue = PW * 0.30   # ≈2.5" on an 8" page
    head_y = ysL[0] + sp * 0.2
    sum_top = ysR[-7]  # last 6 lines
    return dict(L=L, R=R, ys=ysL, sp=sp, cue=cue, head_y=head_y, sum_top=sum_top, gap=gap, boxL=boxL, boxR=boxR)


def page_ruling(c, n):
    W, H = landscape(letter)
    c.setPageSize((W, H))
    text(c, 40, H - 46, 'How to rule each topic spread', 'Sans-B', 20)
    text(c, 40, H - 64, 'Draw these lines in pen (red below) on every new topic. Each colour zone has one job, and you fill them in this order: 1 → 5.', 'Sans', 10, MUTED)

    PW, PH = 248, 380
    X, Y = 40, 60
    g = draw_spread_frame(c, X, Y, PW, PH)
    (lx, ly), (rx, ry) = g['L'], g['R']
    ys, sp, cue = g['ys'], g['sp'], g['cue']

    # zones
    top = ys[0]
    shade(c, lx + 1, top, PW - 2, PH - (top - ly) - 1, ZONE['header'])
    shade(c, rx + 1, top, PW - 2, PH - (top - ry) - 1, ZONE['header'])
    shade(c, lx + cue, ly + 1, PW - cue - 1, top - ly - 1, ZONE['notes'])
    shade(c, lx + 1, ly + 1, cue - 1, top - ly - 1, ZONE['cues'])
    shade(c, rx + 1, g['sum_top'], cue - 1, top - g['sum_top'], ZONE['cues'])
    shade(c, rx + cue, g['sum_top'], PW - cue - 1, top - g['sum_top'], ZONE['lab'])
    shade(c, rx + 1, ry + 1, PW - 2, g['sum_top'] - ry - 1, ZONE['summary'])
    # redraw ruling on top of shading
    c.setStrokeColor(RULE)
    c.setLineWidth(0.45)
    for yy in ys:
        c.line(lx + 2, yy, lx + PW - 2, yy)
        c.line(rx + 2, yy, rx + PW - 2, yy)

    # your pen lines
    pencil(c, lx + cue, ly + 2, lx + cue, top)
    pencil(c, rx + cue, g['sum_top'], rx + cue, top)
    pencil(c, rx + 2, g['sum_top'], rx + PW - 2, g['sum_top'])
    pencil(c, lx + 2, top, lx + PW - 2, top, 1.2)
    pencil(c, rx + 2, top, rx + PW - 2, top, 1.2)

    # header text
    bL, bR = g['boxL'], g['boxR']
    text(c, bL[0] + bL[2] + 8, top + 9, 'Topic · Ch # · week', 'Sans-B', 8.5, INK)
    text(c, lx + PW - 18, top + 9, 'book p.__', 'Sans', 8, MUTED, 'r')
    text(c, rx + 12, top + 9, 'Lab · diagram · commands', 'Sans-B', 8.5, INK)
    text(c, bL[0] + bL[2] / 2, bL[1] + bL[3] / 2 - 3, 'even', 'Sans', 7, MUTED, 'c')
    text(c, bR[0] + bR[2] / 2, bR[1] + bR[3] / 2 - 3, 'odd', 'Sans', 7, MUTED, 'c')
    # callout for the corner boxes
    arrow(c, bR[0] - 30, ly + PH + 22, bR[0] + bR[2] / 2 - 4, bR[1] + bR[3] + 2, PENCIL, 0.9, 4)
    text(c, bR[0] - 34, ly + PH + 19, 'page # goes in the corner box', 'Sans-B', 7.5, PENCIL, 'r')

    # zone labels
    def zl(xc, yc, num, title, sub):
        badge(c, xc, yc + 12, num, 9)
        text(c, xc, yc - 4, title, 'Sans-B', 9.5, INK, 'c')
        for i, s in enumerate(sub):
            text(c, xc, yc - 16 - i * 10, s, 'Sans', 7.6, MUTED, 'c')

    badge(c, lx + PW / 2 + 34, top + 12, 1, 8)
    zl(lx + cue + (PW - cue) / 2, ly + PH * 0.5, 2, 'NOTES', ['while reading or', 'watching the video', 'facts, explanations,', 'book page refs'])
    zl(rx + cue + (PW - cue) / 2, g['sum_top'] + (top - g['sum_top']) / 2, 3, 'LAB', ['diagram first, then', 'commands → what', 'each one does'])
    zl(rx + PW / 2, ry + (g['sum_top'] - ry) / 2 + 2, 4, 'SUMMARY', ['after the lab: 2–4 sentences, own words'])
    zl(lx + cue / 2, ly + PH * 0.5, 5, 'CUES', ['written LAST', 'as questions', 'covers the notes', 'for self-testing'])
    zl(rx + cue / 2, g['sum_top'] + (top - g['sum_top']) / 2, 5, 'CUES', ['questions about', 'the lab'])

    # dimensions
    dim(c, lx, lx + cue, ly + PH + 10, '≈ 2.5 in')
    text(c, lx + cue + 8, ly + PH + 7, '← your cue line: wider than the printed pink margin', 'Sans', 7.5, PENCIL)
    arrow(c, rx + PW + 16, g['sum_top'], rx + PW + 16, ry + 4, PENCIL, 0.9, 4)
    arrow(c, rx + PW + 16, ry + 4, rx + PW + 16, g['sum_top'], PENCIL, 0.9, 4)
    c.saveState()
    c.translate(rx + PW + 26, ry + (g['sum_top'] - ry) / 2)
    c.rotate(90)
    text(c, 0, 0, 'bottom 6 lines', 'Sans-B', 7.5, PENCIL, 'c')
    c.restoreState()

    # right-hand legend
    lgx = rx + PW + 46
    lw = W - lgx - 30
    yy = H - 104
    yy = heading(c, lgx, yy, 'The 5 zones', 13)
    legend = [
        ('header', 1, 'Header line', 'Topic, chapter, week and book page, written beside the corner box (the page number goes in the box). Lets the index point here.'),
        ('notes', 2, 'Notes (left page)', 'While reading or watching. Short phrases, arrows, your own abbreviations. Leave gaps to add to later.'),
        ('lab', 3, 'Lab (right page)', 'Draw the topology first. Then every command you ran, with what it does in plain words.'),
        ('summary', 4, 'Summary', 'Write it only after the lab, not after the video. If you can\'t summarise it, redo the lab.'),
        ('cues', 5, 'Cues (both pages)', 'Last step. Turn each block of notes into a question. Cover the notes and answer out loud.'),
    ]
    for key, num, title, desc in legend:
        lines = simpleSplit(desc, 'Sans', 8, lw - 36)
        bh = 26 + len(lines) * 10
        c.setFillColor(ZONE[key])
        c.setStrokeColor(LINE)
        c.roundRect(lgx, yy - bh, lw, bh, 6, stroke=1, fill=1)
        badge(c, lgx + 14, yy - 12, num, 8)
        text(c, lgx + 28, yy - 16, title, 'Sans-B', 9.8)
        para(c, lgx + 28, yy - 28, lw - 36, desc, size=8, leading=10, color=INK)
        yy -= bh + 7
    yy -= 4
    c.setStrokeColor(PENCIL)
    c.setLineWidth(1.6)
    c.line(lgx, yy + 3, lgx + 22, yy + 3)
    para(c, lgx + 30, yy, lw - 30, '= lines you draw yourself (pen + ruler, or the edge of the book)', size=8.3, color=MUTED)
    yy -= 22
    para(c, lgx, yy, lw, 'Big topic (e.g. OSPF)? Continue onto the next spread and keep the same layout. Only the last right page gets the summary box.', size=8.3, color=MUTED)
    footer(c, n)


# ================================================================= PAGE 3 · worked example (landscape)

def write_rows(c, x0, xc, xw, ys, rows, start=1, cue_w=None, size=7.6):
    """rows: list of (cue, note). Text sits on the ruled lines, starting at line index `start`."""
    i = start
    for cue_t, note_t in rows:
        if i >= len(ys):
            break
        y = ys[i] + 1.8
        if cue_t:
            text(c, x0, y, cue_t, 'Sans-I', size, HexColor('#6b3fa0'))
        if note_t:
            font = 'Mono' if note_t.startswith('  ') or note_t.startswith('R1') else 'Sans-I'
            text(c, xc, y, note_t, font, size if font != 'Mono' else size - 0.4, PEN)
        i += 1
    return i


def page_example(c, n):
    W, H = landscape(letter)
    c.setPageSize((W, H))
    text(c, 40, H - 46, 'Worked example: Chapter 2, encapsulation', 'Sans-B', 20)
    text(c, 40, H - 64, 'Blue = notes and lab. Purple = cues (written last). Red = the lines you drew. Your handwriting will be bigger: let it spill onto a second spread.', 'Sans', 10, MUTED)

    PW, PH = 340, 470
    X, Y = 46, 50
    g = draw_spread_frame(c, X, Y, PW, PH, nums=(12, 13))
    (lx, ly), (rx, ry) = g['L'], g['R']
    ys, cue, top = g['ys'], g['cue'], g['ys'][0]
    pencil(c, lx + cue, ly + 2, lx + cue, top)
    pencil(c, rx + cue, g['sum_top'], rx + cue, top)
    pencil(c, rx + 2, g['sum_top'], rx + PW - 2, g['sum_top'])
    pencil(c, lx + 2, top, lx + PW - 2, top, 1.1)
    pencil(c, rx + 2, top, rx + PW - 2, top, 1.1)

    bL = g['boxL']
    text(c, bL[0] + bL[2] + 10, top + 8, 'Ch 2 · Encapsulation · wk 1', 'Sans-B', 9, PEN)
    text(c, lx + PW - 22, top + 8, 'book p.__', 'Sans-I', 8, PEN, 'r')
    text(c, rx + 40, top + 8, 'Lab: watch encapsulation hop by hop', 'Sans-B', 9, PEN)

    cx, nx = lx + 40, lx + cue + 6
    left = [
        ('5 steps of', 'SENDING side: 5 conversion steps'),
        ('encapsulation?', '1. Build data (app: e-mail text)'),
        ('', '2. Package for transport → SEGMENT'),
        ('', '     TCP/UDP header + port numbers'),
        ('Which layer adds', '3. Add network header → PACKET'),
        ('src/dest IP?', '     src + dest IP → routers read this'),
        ('Who adds MACs?', '4. Add data-link header → FRAME'),
        ('', '     src + dest MAC + FCS trailer'),
        ('Why rebuilt at', '     !! new frame at EVERY hop'),
        ('every hop?', '5. Convert to BITS on the cable'),
        ('', ''),
        ('PDU names', 'PDUs: Data → Segment → Packet'),
        ('L4 / L3 / L2 / L1?', '         → Frame → Bits'),
        ('', '"Don\'t Some People Fear Birthdays"'),
        ('', ''),
        ('What happens on', 'RECEIVING side = de-encapsulation'),
        ('the receiver?', 'each layer strips its header,'),
        ('', 'passes the rest UP'),
        ('', ''),
        ('OSI ↔ TCP/IP?', 'OSI 5-6-7 = TCP/IP Application'),
        ('', 'OSI 3 = Internet   OSI 1-2 = Link'),
        ('', ''),
        ('', 'see also: Ch 9 (TCP), Ch 19 (ARP)'),
    ]
    write_rows(c, cx, nx, PW - cue, ys, left, start=1)

    # right page: diagram
    rcx, rnx = rx + 40, rx + cue + 6
    dy = ys[1] - 4
    devs = [('PC1', rnx + 8), ('R1', rnx + 62), ('R2', rnx + 116), ('PC2', rnx + 170)]
    c.setStrokeColor(PEN)
    c.setLineWidth(1)
    c.line(devs[0][1] + 10, dy - 6, devs[-1][1] + 10, dy - 6)
    for name, dx in devs:
        c.setFillColor(white)
        c.setStrokeColor(PEN)
        if name.startswith('R'):
            c.circle(dx + 10, dy - 6, 8, stroke=1, fill=1)
        else:
            c.rect(dx, dy - 13, 20, 14, stroke=1, fill=1)
        text(c, dx + 10, dy - 25, name, 'Sans-I', 7, PEN, 'c')
    # nested envelope: frame ⊃ packet ⊃ segment ⊃ data (each layer keeps an 11 pt label strip)
    ex, etop = rnx + 4, ys[3] - 2
    strip = 11
    layers = [('FRAME  (MAC header + FCS)', 210), ('PACKET  (IP header)', 182), ('SEGMENT  (TCP/UDP ports)', 154), ('data', 126)]
    for i, (lab, w) in enumerate(layers):
        top_i = etop - i * strip
        hgt = 76 - i * 2 * strip
        c.setStrokeColor(PEN)
        c.setLineWidth(0.8)
        c.setFillColor(HexColor('#f3f7ff') if i % 2 == 0 else white)
        c.rect(ex + i * 14, top_i - hgt, w, hgt, stroke=1, fill=1)
        text(c, ex + i * 14 + 4, top_i - 8, lab, 'Sans-I', 6.6, PEN)
    right = [
        ('Which addresses', 'app Lab 5: ping PC1 → PC2'),
        ('change at a', '  ping 192.168.2.10'),
        ('router?', '  → watch it hop PC1-R1-R2-PC2'),
        ('', 'R1# show arp'),
        ('', '  = MACs R1 learned (L2 addresses)'),
        ('', ''),
        ('', 'IP src/dst   = SAME end to end'),
        ('', 'MAC src/dst  = rewritten by EACH router'),
    ]
    write_rows(c, rcx, rnx, PW - cue, ys, right, start=9)

    # summary
    sy = g['sum_top'] - g['sp'] + 1.8
    text(c, rx + 40, g['sum_top'] - 9, 'SUMMARY', 'Sans-B', 7.5, PENCIL)
    summary = ['Each layer wraps the one above in its own header (encapsulation).',
               'IP addresses get the packet across networks and never change.',
               'MAC addresses only get it across ONE link, so every router',
               'strips the frame and builds a new one. Receiver unwraps in reverse.']
    for i, s in enumerate(summary):
        text(c, rx + 40, sy - (i + 1) * g['sp'], s, 'Sans-I', 7.8, PEN)
    footer(c, n)


# ================================================================= PAGES 4-8 · index + reference, written on ruled pages

PEN_HEAD = HexColor('#14306e')


class Ruled:
    """Writes onto one drawn notebook page, line by line, like handwriting."""

    def __init__(self, c, x, y, w, h, side, num):
        self.c, self.x, self.w, self.side = c, x, w, side
        self.ys, self.sp, self.box = notebook_page(c, x, y, w, h, side, num=num)
        self.x0 = x + w * 0.11 + 6                       # just right of the printed pink margin
        self.x1 = x + w - (w * 0.09 if side == 'L' else 8)  # clear of the holes on left pages

    def X(self, f):
        return self.x0 + f * (self.x1 - self.x0)

    def head(self, s):
        """Header beside the corner box (box is top-left on left pages, top-right on right pages)."""
        bx, by, bw, bh = self.box
        hx = bx + bw + 10 if self.side == 'L' else self.x0
        text(self.c, hx, self.ys[0] + 9, s, 'Sans-B', 9.5, PEN_HEAD)
        pencil(self.c, self.x + 2, self.ys[0], self.x + self.w - 2, self.ys[0], 1.1)

    def w_(self, i, f, s, font='Sans-I', size=7.9, color=PEN, anchor='l'):
        if i < len(self.ys) and s:
            text(self.c, self.X(f), self.ys[i] + 2, s, font, size, color, anchor)

    def row(self, i, cols, cells, font='Sans-I', size=7.9, color=PEN):
        for f, s in zip(cols, cells):
            self.w_(i, f + 0.01, s, font, size, color)

    def mono(self, i, f, s, size=7.6, bold=False):
        self.w_(i, f, s, 'Mono-B' if bold else 'Mono', size)

    def label(self, i, s):
        self.w_(i, 0, s, 'Sans-B', 7.6, PENCIL)

    def cols(self, fracs, i0, i1):
        """Pen column lines between rows i0..i1 (inclusive), plus a pen line under the header row."""
        top = self.ys[i0] + self.sp
        for f in fracs:
            pencil(self.c, self.X(f), top, self.X(f), self.ys[i1], 0.9)
        pencil(self.c, self.x0, self.ys[i0], self.x1, self.ys[i0], 0.9)


def opening(c, n, title, sub, left, right):
    W, H = landscape(letter)
    c.setPageSize((W, H))
    text(c, 40, H - 46, title, 'Sans-B', 20)
    text(c, 40, H - 64, sub, 'Sans', 10, MUTED)
    PW, PH, X, Y = 340, 470, 46, 50
    for spec, x, side in ((left, X, 'L'), (right, X + PW + 10, 'R')):
        if spec is None:  # inside front cover
            c.setFillColor(HexColor('#e9e4da'))
            c.setStrokeColor(HexColor('#b9b2a5'))
            c.rect(x, Y, PW, PH, stroke=1, fill=1)
            text(c, x + PW / 2, Y + PH - 40, 'inside front cover', 'Sans', 9, MUTED, 'c')
            for k, s in enumerate(['Name: sin', 'CCNA 200-301 v1.1', 'Exam: Fri Jan 29, 2027', 'v1.1 last day: Feb 2',
                                   'Book: CCNA 1 & 2 Companion Guide 3e', '', 'If found, please return to:', '_______________________']):
                text(c, x + 40, Y + PH - 90 - k * 22, s, 'Sans-I', 11, PEN)
            continue
        num, fn = spec
        fn(Ruled(c, x, Y, PW, PH, side, num))
    footer(c, n)


# ---------- page contents

CH_PLAN = [  # chapter, title, pages, tab — 18 chapters × 2–6 pages = pp.10–71, every spread on an even page
    ('Ch 1', 'Binary, hex, IP & masks', '10–11', 'Fund'), ('Ch 2', 'OSI, TCP/IP, encapsulation', '12–15', 'Fund'),
    ('Ch 3', 'Media (skim)', '16–17', 'Fund'), ('Ch 5', 'Ethernet frames, MAC', '18–21', 'Fund'),
    ('Ch 6', 'Domains, switching, STP intro', '22–25', 'Access'), ('Ch 7', 'TCP/IP suite, IP classes', '26–29', 'Fund'),
    ('Ch 8', 'Routing basics + SUBNETTING', '30–35', 'Fund'), ('Ch 9', 'TCP/UDP, ports, apps', '36–39', 'Fund'),
    ('Ch 10', 'Inside a router (skim)', '40–41', 'IP'), ('Ch 11', 'IOS CLI basics (skim)', '42–43', 'IP'),
    ('Ch 12', 'Router configuration', '44–47', 'IP'), ('Ch 13', 'CDP, remote access', '48–49', 'Access'),
    ('Ch 15', 'Static routes, AD, protocols', '50–53', 'IP'), ('Ch 16', 'Reading the routing table', '54–55', 'IP'),
    ('Ch 17', 'ICMP, ping, traceroute', '56–57', 'Fund'), ('Ch 18', 'Troubleshooting', '58–61', 'IP'),
    ('Ch 19', 'TCP in depth, ARP', '62–65', 'Fund'), ('Ch 20', 'ACLs', '66–71', 'Sec'),
]
BEYOND_PLAN = [  # pp.72–121, spare 122–135
    ('VLANs & trunks', '72–75', 'Access'), ('Inter-VLAN routing', '76–77', 'Access'), ('STP / Rapid PVST+', '78–81', 'Access'),
    ('EtherChannel, LLDP', '82–83', 'Access'), ('OSPF', '84–89', 'IP'), ('IPv6', '90–93', 'IP'), ('FHRP / HSRP', '94–95', 'IP'),
    ('NAT & DHCP', '96–99', 'Svc'), ('DNS, NTP, SNMP, syslog, SSH', '100–103', 'Svc'), ('QoS', '104–105', 'Svc'),
    ('L2 security (port sec, snooping, DAI)', '106–109', 'Sec'), ('AAA, wireless security', '110–111', 'Sec'),
    ('Wireless architectures, WLC', '112–115', 'Access'), ('SDN, REST, JSON', '116–119', 'Auto'), ('Ansible/Terraform, AI', '120–121', 'Auto'),
]
IDX_COLS = [0, 0.72, 0.87]


def idx_header(r, i):
    r.row(i, IDX_COLS, ['Topic', 'Pages', 'Tab'], 'Sans-B', 7.8)
    r.cols(IDX_COLS[1:], i, 27)


def p1_index(r):
    r.head('INDEX')
    idx_header(r, 1)
    r.label(2, 'BOOK CHAPTERS')
    for k, (ch, t, pg, tab) in enumerate(CH_PLAN):
        r.row(3 + k, IDX_COLS, [f'{ch}  {t}', pg, tab])
    r.w_(22, 0.01, 'skipped: Ch 4, Ch 14, App A (no spread)', size=7.4, color=MUTED)
    r.w_(24, 0.01, 'Tabs: Fund · Access · IP · Svc · Sec · Auto', size=7.4, color=MUTED)


def p2_index(r):
    r.head('INDEX (cont.)')
    idx_header(r, 1)
    r.label(2, 'FRONT')
    r.row(3, IDX_COLS, ['Reference: subnet 3 · ports 4 · AD 5', '3–5', 'Ref'])
    r.row(4, IDX_COLS, ['IOS 6 · outdated 7 · OSI 8 · tab key 9', '6–9', 'Ref'])
    r.label(6, 'BEYOND THE BOOK')
    for k, (t, pg, tab) in enumerate(BEYOND_PLAN):
        r.row(7 + k, IDX_COLS, [t, pg, tab])
    r.row(22, IDX_COLS, ['spare / overflow', '122–135', ''])
    r.label(24, 'BACK (written backwards)')
    r.row(25, IDX_COLS, ['Weekly review log', '145 ←', ''])
    r.row(26, IDX_COLS, ['Mistake log', '154 ←', 'Mist.'])


def p3_subnet(r):
    r.head('REF · Subnetting')
    r.mono(1, 0, 'Bits  128  64  32  16   8   4   2   1', bold=True)
    r.mono(2, 0, 'Mask  128 192 224 240 248 252 254 255', bold=True)
    r.w_(3, 0, 'Block = 256 − mask octet   ·   Wildcard = 255 − mask octet', size=7.6)
    cols = [0, 0.13, 0.55, 0.78]
    r.row(5, cols, ['/', 'Mask', 'Block', 'Hosts'], 'Sans-B', 7.8)
    for k, p in enumerate(range(16, 31)):
        m = (0xffffffff << (32 - p)) & 0xffffffff
        octs = [(m >> s) & 255 for s in (24, 16, 8, 0)]
        kk = (p - 1) // 8
        r.row(6 + k, cols, [f'/{p}', '.'.join(map(str, octs)), f'{256 - octs[kk]}  ({kk + 1}{"st nd rd th".split()[kk]})', f'{2 ** (32 - p) - 2:,}'], size=7.6)
    r.cols(cols[1:], 5, 20)
    r.w_(22, 0, 'Network = multiple of block ≤ host octet', size=7.6)
    r.w_(23, 0, 'Broadcast = next multiple − 1', size=7.6)
    r.w_(24, 0, 'Hosts = 2^h − 2  ·  Subnets = 2^n (subnet zero OK)', size=7.6)
    r.w_(26, 0, 'e.g. 172.16.45.200/27 → block 32 → net .192, bcast .223', size=7.6)


def p4_ports(r):
    r.head('REF · Port numbers')
    cols = [0, 0.5]
    r.row(1, cols, ['TCP', 'UDP'], 'Sans-B', 7.8)
    rows = [('FTP  20 data / 21 ctrl', 'DNS  53'), ('SSH  22', 'DHCP  67 srv / 68 client'), ('Telnet  23', 'TFTP  69'),
            ('SMTP  25', 'NTP  123'), ('DNS  53 (zone transfer)', 'SNMP  161 / traps 162'), ('HTTP  80', 'Syslog  514'),
            ('POP3  110', 'RIP  520'), ('IMAP  143', 'CAPWAP  5246 ctrl / 5247 data'), ('BGP  179', 'RADIUS  1812 / 1813'),
            ('HTTPS  443', ''), ('TACACS+  49', '')]
    for k, (a, b) in enumerate(rows):
        r.row(2 + k, cols, [a, b])
    r.cols([0.5], 1, 12)
    r.w_(14, 0, 'Well-known 0–1023 · registered 1024–49151', size=7.6)
    r.w_(15, 0, 'Ephemeral (client source port) 49152–65535', size=7.6)
    r.w_(17, 0, 'IP protocol #:  ICMP 1 · TCP 6 · UDP 17 · OSPF 89', size=7.6)
    r.w_(19, 0, 'UDP = no handshake: DNS, DHCP, TFTP, SNMP, syslog, voice', size=7.6)


def p5_ad(r):
    r.head('REF · AD & route codes')
    cols = [0, 0.3, 0.45, 0.58]
    r.row(1, cols, ['Source', 'AD', 'Code', 'Meaning'], 'Sans-B', 7.8)
    rows = [('Connected', '0', 'C', 'connected subnet'), ('Static', '1', 'L', 'local /32 (own IP)'), ('eBGP', '20', 'S', 'static'),
            ('EIGRP', '90', 'S*', 'static default'), ('OSPF', '110', 'O', 'OSPF'), ('RIP', '120', 'D', 'EIGRP'),
            ('EIGRP ext.', '170', 'R', 'RIP'), ('iBGP', '200', 'B', 'BGP'), ('Unusable', '255', '*', 'candidate default')]
    for k, cells in enumerate(rows):
        r.row(2 + k, cols, cells)
    r.cols(cols[1:], 1, 10)
    r.label(12, 'CHOOSING A ROUTE')
    r.w_(13, 0, '1) longest prefix match, always first', size=7.6)
    r.w_(14, 0, '2) lowest AD (same prefix, different sources)', size=7.6)
    r.w_(15, 0, '3) lowest metric (same protocol)', size=7.6)
    r.w_(16, 0, '    equal metric → load-balance (ECMP)', size=7.6)
    r.mono(18, 0, 'O 10.1.1.0/24 [110/2] via 10.0.12.2', size=7.2)
    r.w_(19, 0, '    [AD / metric] → AD 110 (OSPF), cost 2', size=7.6)
    r.w_(21, 0, 'Floating static = higher AD, e.g. 130 > OSPF 110', size=7.6)
    r.mono(22, 0, 'ip route 0.0.0.0 0.0.0.0 10.0.0.1  → S*', size=7.2)


def p6_ios(r):
    r.head('REF · IOS modes')
    cols = [0, 0.36, 0.6]
    r.row(1, cols, ['Prompt', 'Mode', 'In → Out'], 'Sans-B', 7.8)
    rows = [('R1>', 'user EXEC', 'login → exit'), ('R1#', 'privileged', 'enable → disable'), ('R1(config)#', 'global', 'conf t → end'),
            ('R1(config-if)#', 'interface', 'int g0/0 → exit'), ('R1(config-line)#', 'line', 'line vty 0 4 → exit'),
            ('R1(config-router)#', 'routing', 'router ospf 1 → exit')]
    for k, (a, b, cc) in enumerate(rows):
        r.mono(2 + k, 0.01, a, size=7.2)
        r.w_(2 + k, 0.37, b)
        r.w_(2 + k, 0.61, cc)
    r.cols(cols[1:], 1, 7)
    r.w_(9, 0, 'end / Ctrl-Z → straight back to R1#', size=7.6)
    r.w_(10, 0, 'do <command> → run a # command from config mode', size=7.6)
    r.label(12, 'MUST-KNOW SHOW COMMANDS')
    cmds = [('sh ip int br', 'IP + status, 1 line each'), ('sh run', 'active config (RAM)'), ('sh start', 'saved config (NVRAM)'),
            ('sh ip route', 'routing table'), ('sh vlan brief', 'access ports per VLAN'), ('sh int trunk', 'trunks + allowed VLANs'),
            ('sh mac address-table', 'MAC → port'), ('sh cdp nei (detail)', 'who is connected where'), ('sh ip ospf nei', 'OSPF adjacencies'),
            ('sh access-lists', 'ACL lines + hit counts'), ('copy run start', 'SAVE IT!')]
    for k, (a, b) in enumerate(cmds):
        r.mono(13 + k, 0, a, size=7.2)
        r.w_(13 + k, 0.45, f'→ {b}')


def p7_outdated(r):
    r.head('REF · The book is out of date')
    cols = [0, 0.1, 0.5]
    r.row(1, cols, ['Ch', 'Book says', 'Today / exam'], 'Sans-B', 7.8)
    rows = [('3', 'WEP / LEAP', 'WPA2 (AES), WPA3 (SAE)'), ('3', 'straight vs crossover', 'Auto-MDIX (know the rule)'),
            ('6', '10BASE5 / 10BASE2 coax', 'gone'), ('6', '802.1D STP', 'Rapid STP / Rapid PVST+'), ('7', 'RARP, BOOTP', 'DHCP'),
            ('7', 'classful A / B / C', 'CIDR, any prefix'), ('8', 'subnets = 2^n − 2', '2^n (subnet zero OK)'),
            ('10', 'ISDN, Frame Relay', 'Ethernet WAN, MPLS, SD-WAN'), ('11', 'HyperTerminal, setup', 'screen / PuTTY; say "no"'),
            ('12', 'enable password', 'enable secret'), ('12', 'Telnet on VTY', 'SSH'), ('12', 'serial clock rate', 'not on v1.1'),
            ('15', 'IGRP, classful RIP', 'OSPF (IGRP is gone)'), ('17', 'source quench', 'deprecated')]
    for k, cells in enumerate(rows):
        r.row(2 + k, cols, cells, size=7.6)
    r.cols(cols[1:], 1, 27)
    r.w_(17, 0.11, '(add a line each time you hit a ⚠ in the app)', 'Sans', 7.0, MUTED)


def p8_osi(r):
    r.head('REF · OSI ↔ TCP/IP')
    cols = [0, 0.07, 0.33, 0.55, 0.73]
    r.row(1, cols, ['#', 'OSI', 'TCP/IP', 'PDU', 'Device'], 'Sans-B', 7.8)
    rows = [('7', 'Application', 'Application', 'Data', ''), ('6', 'Presentation', '   "', 'Data', ''), ('5', 'Session', '   "', 'Data', ''),
            ('4', 'Transport', 'Transport', 'Segment', 'firewall'), ('3', 'Network', 'Internet', 'Packet', 'router'),
            ('2', 'Data Link', 'Link', 'Frame', 'switch, AP'), ('1', 'Physical', 'Link', 'Bits', 'hub, cable')]
    for k, cells in enumerate(rows):
        r.row(2 + k, cols, cells)
    r.cols(cols[1:], 1, 8)
    r.label(10, 'PROTOCOLS / ADDRESSES')
    for k, s in enumerate(['7  HTTP · DNS · FTP · SMTP · SNMP · SSH', '6  encryption, compression, formats', '5  session setup / teardown',
                           '4  TCP, UDP · port numbers', '3  IP, ICMP, OSPF · IP addresses', '2  Ethernet, 802.1Q · MAC addresses',
                           '1  UTP, fiber, radio · bits']):
        r.w_(11 + k, 0, s, size=7.6)
    r.w_(19, 0, 'All People Seem To Need Data Processing (7 → 1)', size=7.6)
    r.w_(20, 0, 'Don\'t Some People Fear Birthdays (PDUs):', size=7.6)
    r.w_(21, 0, '   Data · Segment · Packet · Frame · Bits', size=7.6)


def p9_tabs(r):
    r.head('TAB KEY')
    cols = [0, 0.14, 0.7]
    r.row(1, cols, ['Colour', 'Domain', 'Exam %'], 'Sans-B', 7.8)
    rows = [('Network Fundamentals', '20%'), ('Network Access', '20%'), ('IP Connectivity', '25%'), ('IP Services', '10%'),
            ('Security Fundamentals', '15%'), ('Automation & Prog.', '10%'), ('Reference pages', '—'), ('Mistake log', '—')]
    for k, (d, pct) in enumerate(rows):
        i = 2 + k
        c = r.c
        c.setStrokeColor(PEN)
        c.setLineWidth(0.8)
        c.rect(r.X(0.02), r.ys[i] + 2, 18, 8, stroke=1, fill=0)
        r.w_(i, 0.15, d)
        r.w_(i, 0.71, pct)
    r.cols(cols[1:], 1, 9)
    r.label(11, 'WHERE THE FLAGS GO')
    for k, s in enumerate(['Side edge: every spread, on its right-hand page,', '   in its domain colour. Stagger them down the edge.',
                           'Top edge: sections. Index p.1 · Reference p.3 ·', '   Beyond the book p.72 · Back p.136',
                           '', 'Weight = how much of the exam: IP Connectivity', '   (25%) deserves the most flags and review.',
                           '', 'Exam Fri Jan 29 · v1.1 last day Feb 2']):
        r.w_(12 + k, 0, s, size=7.6)


def page_ref_open1(c, n):
    opening(c, n, 'Index (p.1): written on the page', 'Page 1 is a right-hand page, so the index starts opposite the inside cover. The page numbers are a ready-made budget: copy them as-is.',
            None, (1, p1_index))


def page_ref_open2(c, n):
    opening(c, n, 'Index (p.2) and subnetting reference (p.3)', 'Red = lines you draw (column lines, header rule). Blue = your writing. Each row of text sits on one ruled line.',
            (2, p2_index), (3, p3_subnet))


def page_ref_open3(c, n):
    opening(c, n, 'Reference: ports (p.4) and AD / route codes (p.5)', 'Copy these once; add to them whenever Anki or a quiz catches you out.',
            (4, p4_ports), (5, p5_ad))


def page_ref_open4(c, n):
    opening(c, n, 'Reference: IOS modes (p.6) and "the book is out of date" (p.7)', 'Leave the bottom of p.7 empty. Every ⚠ box in the app\'s chapter pages becomes a new line.',
            (6, p6_ios), (7, p7_outdated))


def page_ref_open5(c, n):
    opening(c, n, 'Reference: OSI chart (p.8) and tab key (p.9)', 'Colour the boxes on p.9 with the actual sticky flag you choose for each domain.',
            (8, p8_osi), (9, p9_tabs))


# ================================================================= PAGE 9 · back section

def page_back(c, n):
    W, H = letter
    x, y = 40, H - 46
    text(c, x, y, 'The back section (pp. 136–154)', 'Sans-B', 18)
    y -= 18
    text(c, x, y, 'Both logs start at the back of the notebook and grow towards the middle, so they never collide with your spreads.', 'Sans', 10, MUTED)
    y -= 28
    y = heading(c, x, y, 'Mistake log: start on p.154 and work backwards', 12.5)
    y = para(c, x, y, W - 80, 'One line per missed question from Boson, the app\'s chapter quizzes or Anki. The app keeps its own Weak topics list automatically; this log is for the misses you want to think through. Three misses on the same topic → redo that spread from memory.', size=8.5, color=MUTED) - 2
    ml = [['Date', 'Source', 'Topic', 'What I got wrong', 'The right idea', 'Spread'],
          ['11/14', 'Quiz ch 8', 'Subnetting', 'Said 6 subnets for 3 borrowed bits', '2³ = 8 (subnet zero is allowed)', 'p.30'],
          ['11/16', 'Anki', 'Ports', 'TFTP = TCP 69', 'TFTP = UDP 69 (no handshake)', 'p.4'],
          ['', '', '', '', '', ''], ['', '', '', '', '', '']]
    y = table(c, x, y, W - 80, ml, [0.08, 0.11, 0.14, 0.27, 0.3, 0.1], size=8.2)

    y -= 18
    y = heading(c, x, y, 'Weekly review log: start on p.145 and work backwards', 12.5)
    y = para(c, x, y, W - 80, 'Every Sunday at 4 pm, one row per week. Compare the hours with the plan\'s split (60/40 theory/practice in weeks 1–2, 40/60 after that, 20/80 in week 12).', size=8.5, color=MUTED) - 2
    wr = [['Wk', 'Hours (theory / practice)', 'Chapters / topics done', 'Lab redone from memory', 'Weakest topic → next week'],
          ['1', '5 / 4', 'Ch 1, 2, 5', 'Lab 1 Hello, switch', 'hex conversions'],
          ['2', '', '', '', ''], ['3', '', '', '', '']]
    y = table(c, x, y, W - 80, wr, [0.06, 0.2, 0.25, 0.23, 0.26], size=8.2)
    footer(c, n)


# ================================================================= PAGE 7 · routine

def page_routine(c, n):
    W, H = letter
    x, y = 40, H - 46
    text(c, x, y, 'Using the notebook every session', 'Sans-B', 20)
    y -= 32
    y = heading(c, x, y, 'One study session, in order', 12.5)
    steps = [('Read', 'book section or\nJITL video'), ('Notes', 'left page\n(zone 2)'), ('Lab', 'same day: app\nor Packet T.'),
             ('Lab page', 'right page\n(zone 3)'), ('Summary', 'zone 4,\nown words'), ('Cues', 'zone 5, as\nquestions'), ('App', 'cues into\nCornell notes')]
    bw, bh, gap = 66, 62, 9.3
    bx = x
    for i, (t, sub) in enumerate(steps):
        c.setFillColor(SOFT if i % 2 == 0 else HexColor('#f4f8ef'))
        c.setStrokeColor(LINE)
        c.roundRect(bx, y - bh, bw, bh, 7, stroke=1, fill=1)
        badge(c, bx + 11, y - 11, i + 1, 7)
        text(c, bx + bw / 2, y - 30, t, 'Sans-B', 9, INK, 'c')
        for j, s in enumerate(sub.split('\n')):
            text(c, bx + bw / 2, y - 42 - j * 9, s, 'Sans', 6.8, MUTED, 'c')
        if i < len(steps) - 1:
            arrow(c, bx + bw + 1, y - bh / 2, bx + bw + gap - 1, y - bh / 2, ACCENT, 1.2, 4)
        bx += bw + gap
    y -= bh + 24

    colw = (W - 80 - 20) / 2
    y0 = y
    yl = heading(c, x, y, 'Daily, 7:30 pm (10–15 min)', 12)
    yl = bullets(c, x, yl, colw, ['Anki deck, then 10 min of subnetting (app → Drills).',
                                  'Glance at today\'s spread and answer the cues out loud.',
                                  'Log any misses in the back of the notebook.'], size=9.2)
    yl -= 10
    yl = heading(c, x, yl, 'Sunday, 4 pm weekly review', 12)
    yl = bullets(c, x, yl, colw, ['Cover the notes column on every spread from this week and answer the cues.',
                                  'Redo one lab from memory, without the brief. Check it with the app\'s Check button.',
                                  'Fill one weekly-review row (p.145 backwards).',
                                  'Any cue you missed: rewrite that bit of the notes, or redo the spread.'], size=9.2)

    xr = x + colw + 20
    yr = heading(c, xr, y0, 'Rules of thumb', 12)
    yr = bullets(c, xr, yr, colw, [
        'Facts go in Anki (port numbers, AD values). How things work goes in the notebook.',
        'Cues are questions, not facts: "Why does the frame change at each hop?", not "frames change".',
        'Diagrams beat paragraphs. Draw the topology for every lab.',
        'Commands always get a meaning: "no shutdown → bring the interface up".',
        'Leave a blank page at the end of each domain for later additions.',
        'Book chapters you skip (4, 14, App A) get no spread; their one-page summaries are in the app.',
        'Annotate the book lightly: mark skip/skim, flag ⚠ outdated bits, write the notebook page in the margin.'], size=9.2)

    y = min(yl, yr) - 18
    c.setFillColor(HexColor('#fff8e6'))
    c.setStrokeColor(HexColor('#f0d48a'))
    c.roundRect(x, y - 122, W - 80, 122, 8, stroke=1, fill=1)
    text(c, x + 14, y - 20, 'How the notebook and the app fit together', 'Sans-B', 11)
    yy = bullets(c, x + 14, y - 38, W - 108, [
        'Book tab → chapter: tick the reading guide, set the Book page and the Notebook page, take the chapter quiz.',
        'Book → Notebook: the digital copy of pages 1–2, with page numbers for every chapter and beyond-the-book topic.',
        'Cornell notes in the app = your cue questions, so you can self-test on the phone. Paper keeps the diagrams.',
        'Quiz misses land in Today → Weak topics automatically; copy the ones you need to think about into the mistake log.'], size=8.8, gap=2)
    footer(c, n)


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    c = canvas.Canvas(OUT, pagesize=letter)
    c.setTitle('CCNA Notebook Guide')
    c.setAuthor('CCNA-Q')
    c.setSubject('How to structure a Cornell-style CCNA study notebook')
    pages = [page_overview, page_ruling, page_example,
             page_ref_open1, page_ref_open2, page_ref_open3, page_ref_open4, page_ref_open5,
             page_back, page_routine]
    landscape_pages = {page_ruling, page_example, page_ref_open1, page_ref_open2, page_ref_open3, page_ref_open4, page_ref_open5}
    for i, fn in enumerate(pages, 1):
        if fn in landscape_pages:
            c.setPageSize(landscape(letter))
        else:
            c.setPageSize(letter)
        fn(c, i)
        c.showPage()
    c.save()
    print('wrote', OUT)


if __name__ == '__main__':
    main()
