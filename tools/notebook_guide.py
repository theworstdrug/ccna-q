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

def notebook_page(c, x, y, w, h, holes='left', lines=28):
    """A college-ruled page with its printed pink margin. Returns line positions (top→bottom)."""
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
    mx = x + w * 0.11 if holes == 'left' else x + w * 0.11
    c.setStrokeColor(MARGIN)
    c.setLineWidth(0.6)
    c.line(mx, y + 2, mx, y + h - 2)
    # punched holes
    hx = x + w * 0.045
    c.setFillColor(HexColor('#e9edf2'))
    c.setStrokeColor(HexColor('#b8c1cc'))
    for f in (0.15, 0.5, 0.85):
        c.circle(hx, y + h * f, w * 0.018, stroke=1, fill=1)
    return ys, sp


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
    text(c, x, y, 'How to set up and fill the pen+GEAR 1-subject notebook (80 sheets = 160 pages, college ruled)', 'Sans', 10.5, MUTED)
    y -= 14
    text(c, x, y, 'Method: Cornell notes · one topic per two-page spread · cues are questions · summary after the lab', 'Sans', 10.5, MUTED)

    # page map
    y -= 34
    y = heading(c, x, y, '1  Page map: decide where everything goes before you write')
    bx, bw, bh = x, W - 80, 34
    segs = [(1, 2, 'Index', HexColor('#ffd166')), (3, 8, 'Reference', HexColor('#ef8354')),
            (9, 70, 'Book chapters  (ch 1–20, in order)', HexColor('#4f9dde')),
            (71, 140, 'Beyond the book  (JITL topics)', HexColor('#43aa8b')),
            (141, 160, 'Back section', HexColor('#b07bd6'))]
    for a, b, label, col in segs:
        sx = bx + (a - 1) / 160 * bw
        sw = (b - a + 1) / 160 * bw
        c.setFillColor(col)
        c.rect(sx, y - bh, sw, bh, stroke=0, fill=1)
        c.setStrokeColor(white)
        c.setLineWidth(1.5)
        c.line(sx, y - bh, sx, y)
        if sw > 60:
            text(c, sx + sw / 2, y - bh / 2 - 3.5, label, 'Sans-B', 8.5, white, 'c')
    for p in (9, 71, 141):
        text(c, bx + (p - 1) / 160 * bw, y - bh - 11, f'p.{p}', 'Sans', 7.5, MUTED, 'c')
    text(c, bx + bw, y - bh - 11, 'p.160', 'Sans', 7.5, MUTED, 'r')
    # the two thin segments get a key instead of a label
    ky = y - bh - 25
    for i, (lab, col) in enumerate([('Index p.1–2', HexColor('#ffd166')), ('Reference p.3–8', HexColor('#ef8354'))]):
        kx = bx + i * 92
        c.setFillColor(col)
        c.rect(kx, ky - 1, 8, 8, stroke=0, fill=1)
        text(c, kx + 12, ky, lab, 'Sans', 7.5, MUTED)
    y -= bh + 42
    rows = [['Pages', 'Section', 'What goes there'],
            ['1–2', 'Index', 'Topic → page number. Fill it in as you go. (Mirror in the app: Book → Notebook.)'],
            ['3–8', 'Reference', 'Subnetting table, ports, AD/route codes, IOS modes, "the book is outdated" list, OSI chart (page 5 of this guide)'],
            ['9–70', 'Book chapters', 'One spread (2–4 pages) per chapter you read or skim. Skip chapters 4, 14 and Appendix A.'],
            ['71–140', 'Beyond the book', 'VLANs, STP, EtherChannel, OSPF, IPv6, FHRP, NAT, services, QoS, security, wireless, automation'],
            ['141–160', 'Back section', 'Start on p.160 and work backwards: mistake log, weekly review log (page 6)']]
    y = table(c, x, y, W - 80, rows, [0.11, 0.17, 0.72], size=8.8)

    # setup checklist + tabs
    y -= 26
    colw = (W - 80 - 20) / 2
    y0 = y
    yy = heading(c, x, y, '2  Setup tonight (≈20 min)')
    steps = ['Number every page in the bottom outer corner, 1–160.',
             'Pages 1–2: write INDEX at the top. Draw 3 columns: Topic | Page | Tab.',
             'Pages 3–8: write the reference titles at the top of each (see page 5).',
             'Rule the first chapter spread (pages 9–10) as shown on page 2.',
             'Page 160: write MISTAKE LOG. Page 150: WEEKLY REVIEW.',
             'Stick a tab on p.3 (Reference) and p.160 (Mistakes).',
             'Don\'t use the perforations. Torn-out pages break the index.']
    for i, s in enumerate(steps, 1):
        badge(c, x + 8, yy + 3.5, i, 7)
        yy = para(c, x + 22, yy, colw - 22, s, size=9.3) - 4

    tx = x + colw + 20
    ty = heading(c, tx, y, '3  Sticky-tab colour key')
    ty = para(c, tx, ty, colw, 'One colour per exam domain. Tab the first spread of each domain. Colour each box with the tab you choose:', size=9, color=MUTED) - 4
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

def draw_spread_frame(c, X, Y, PW, PH):
    """Two notebook pages side by side with the Cornell lines drawn in. Returns geometry."""
    gap = 10
    L = (X, Y)
    R = (X + PW + gap, Y)
    ysL, sp = notebook_page(c, L[0], L[1], PW, PH)
    ysR, _ = notebook_page(c, R[0], R[1], PW, PH)
    cue = PW * 0.30   # ≈2.5" on an 8" page
    head_y = ysL[0] + sp * 0.2
    sum_top = ysR[-7]  # last 6 lines
    return dict(L=L, R=R, ys=ysL, sp=sp, cue=cue, head_y=head_y, sum_top=sum_top, gap=gap)


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
    text(c, lx + 12, top + 9, 'Topic · Ch # · week', 'Sans-B', 8.5, INK)
    text(c, lx + PW - 8, top + 9, 'book p.__', 'Sans', 8, MUTED, 'r')
    text(c, rx + 12, top + 9, 'Lab · diagram · commands', 'Sans-B', 8.5, INK)

    # zone labels
    def zl(xc, yc, num, title, sub):
        badge(c, xc, yc + 12, num, 9)
        text(c, xc, yc - 4, title, 'Sans-B', 9.5, INK, 'c')
        for i, s in enumerate(sub):
            text(c, xc, yc - 16 - i * 10, s, 'Sans', 7.6, MUTED, 'c')

    badge(c, lx + PW / 2 + 30, top + 12, 1, 8)
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
        ('header', 1, 'Header line', 'Topic, chapter, week, book page. Lets the index point here.'),
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
    g = draw_spread_frame(c, X, Y, PW, PH)
    (lx, ly), (rx, ry) = g['L'], g['R']
    ys, cue, top = g['ys'], g['cue'], g['ys'][0]
    pencil(c, lx + cue, ly + 2, lx + cue, top)
    pencil(c, rx + cue, g['sum_top'], rx + cue, top)
    pencil(c, rx + 2, g['sum_top'], rx + PW - 2, g['sum_top'])
    pencil(c, lx + 2, top, lx + PW - 2, top, 1.1)
    pencil(c, rx + 2, top, rx + PW - 2, top, 1.1)

    text(c, lx + 40, top + 8, 'Ch 2 · Encapsulation · wk 1', 'Sans-B', 9, PEN)
    text(c, lx + PW - 8, top + 8, 'book p.__   nb p.12', 'Sans-I', 8, PEN, 'r')
    text(c, rx + 40, top + 8, 'Lab: watch encapsulation hop by hop', 'Sans-B', 9, PEN)
    text(c, rx + PW - 8, top + 8, 'p.13', 'Sans-I', 8, PEN, 'r')

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


# ================================================================= PAGE 4 · reference pages 3-8

def page_reference(c, n):
    W, H = letter
    c.setPageSize((W, H))
    x, y = 40, H - 46
    text(c, x, y, 'Reference pages (notebook pp. 3–8)', 'Sans-B', 20)
    y -= 18
    text(c, x, y, 'Copy these in once, then add to them as you go. They are the pages you will flip to most.', 'Sans', 10, MUTED)
    y -= 22
    colw = (W - 80 - 16) / 2

    # p.3 subnetting
    yl = y
    text(c, x, yl, 'p.3  Subnetting', 'Sans-B', 12, ACCENT)
    yl -= 14
    text(c, x, yl, 'Bits   128  64  32  16   8   4   2   1', 'Mono-B', 8.6)
    yl -= 11
    text(c, x, yl, 'Mask   128 192 224 240 248 252 254 255', 'Mono-B', 8.6)
    yl -= 8
    rows = [['/', 'Mask', 'Block (octet)', 'Hosts']]
    for p in range(16, 31):
        m = (0xffffffff << (32 - p)) & 0xffffffff
        octs = [(m >> s) & 255 for s in (24, 16, 8, 0)]
        k = (p - 1) // 8
        blk = 256 - octs[k]
        rows.append([f'/{p}', '.'.join(map(str, octs)), f'{blk} ({k + 1}{"st nd rd th".split()[k]})', f'{2 ** (32 - p) - 2:,}'])
    yl = table(c, x, yl, colw, rows, [0.12, 0.38, 0.27, 0.23], size=7.8)
    yl -= 6
    yl = para(c, x, yl, colw, 'Block = 256 − mask octet. Network = multiple of the block ≤ host octet. Broadcast = next multiple − 1. Wildcard = 255 − mask octet.', size=7.8, color=MUTED)

    # p.4 ports
    yr = y
    xr = x + colw + 16
    text(c, xr, yr, 'p.4  Ports', 'Sans-B', 12, ACCENT)
    yr -= 8
    ports = [['TCP', 'Port', 'UDP', 'Port'],
             ['FTP data / control', '20 / 21', 'DNS (queries)', '53'],
             ['SSH', '22', 'DHCP server / client', '67 / 68'],
             ['Telnet', '23', 'TFTP', '69'],
             ['SMTP', '25', 'NTP', '123'],
             ['DNS (zone transfer)', '53', 'SNMP / traps', '161 / 162'],
             ['HTTP', '80', 'Syslog', '514'],
             ['POP3 / IMAP', '110 / 143', 'RIP', '520'],
             ['BGP', '179', 'CAPWAP ctrl / data', '5246 / 5247'],
             ['HTTPS', '443', 'RADIUS', '1812 / 1813'],
             ['TACACS+', '49', '', '']]
    yr = table(c, xr, yr, colw, ports, [0.31, 0.19, 0.31, 0.19], size=7.6)
    yr -= 16
    text(c, xr, yr, 'p.5  AD values & route codes', 'Sans-B', 12, ACCENT)
    yr -= 8
    ad = [['Source', 'AD', 'Code', 'Meaning'],
          ['Connected', '0', 'C', 'connected subnet'],
          ['Static', '1', 'L', 'local /32 (own IP)'],
          ['eBGP', '20', 'S / S*', 'static / default'],
          ['EIGRP', '90', 'O', 'OSPF'],
          ['OSPF', '110', 'D', 'EIGRP'],
          ['RIP', '120', 'R', 'RIP'],
          ['iBGP', '200', 'B', 'BGP'],
          ['Unusable', '255', '[110/2]', '[AD / metric]']]
    yr = table(c, xr, yr, colw, ad, [0.28, 0.14, 0.2, 0.38], size=7.8)
    yr -= 6
    yr = para(c, xr, yr, colw, 'Route choice: 1) longest prefix  2) lowest AD  3) lowest metric (ties = load-balance).', size=7.8, color=MUTED)

    # p.6 IOS modes (full width)
    y2 = min(yl, yr) - 18
    text(c, x, y2, 'p.6  IOS modes & first commands', 'Sans-B', 12, ACCENT)
    y2 -= 8
    modes = [['Prompt', 'Mode', 'Get in', 'Get out', 'Typical commands'],
             ['R1>', 'User EXEC', '(login)', 'exit', 'ping, traceroute, show (limited)'],
             ['R1#', 'Privileged EXEC', 'enable', 'disable', 'show …, copy run start, debug, reload'],
             ['R1(config)#', 'Global config', 'configure terminal', 'exit / end / Ctrl-Z', 'hostname, enable secret, ip route, vlan, router ospf'],
             ['R1(config-if)#', 'Interface', 'interface g0/0', 'exit / end', 'ip address, no shutdown, description, switchport'],
             ['R1(config-line)#', 'Line', 'line vty 0 4', 'exit / end', 'password, login (local), transport input ssh'],
             ['R1(config-router)#', 'Routing protocol', 'router ospf 1', 'exit / end', 'network … area 0, router-id, passive-interface']]
    y2 = table(c, x, y2, W - 80, modes, [0.17, 0.15, 0.17, 0.15, 0.36], size=7.8)
    y2 -= 6
    para(c, x, y2, W - 80, 'Must-know show commands: show ip interface brief · show running-config · show ip route · show vlan brief · show interfaces trunk · show mac address-table · show cdp neighbors · show ip ospf neighbor · show access-lists', size=7.8, color=MUTED)
    footer(c, n)


def page_reference2(c, n):
    W, H = letter
    x, y = 40, H - 46
    text(c, x, y, 'Reference pages (continued)', 'Sans-B', 20)
    y -= 26
    text(c, x, y, 'p.7  "The book is out of date" list', 'Sans-B', 12, ACCENT)
    y -= 13
    y = para(c, x, y, W - 80, 'The Companion Guide is from 2003. Each time you hit a ⚠ in the app\'s chapter page, add a line here so you don\'t learn the old version.', size=8.5, color=MUTED) - 2
    rows = [['Ch', 'The book says…', 'Today / the exam says…'],
            ['3', 'WEP, LEAP for wireless security', 'Broken. WPA2 (AES) and WPA3 (SAE)'],
            ['3', 'Pick straight-through vs crossover carefully', 'Auto-MDIX fixes it; still know the rule'],
            ['6', '10BASE5 / 10BASE2 coax, 802.1D STP', 'Gone. Rapid STP (802.1w / Rapid PVST+)'],
            ['7', 'RARP and BOOTP; classful A/B/C networks', 'DHCP; CIDR (any prefix length)'],
            ['8', 'Subnets = 2ⁿ − 2 (no subnet zero / all-ones)', 'Subnets = 2ⁿ (ip subnet-zero default). Hosts still 2ʰ − 2'],
            ['10', 'ISDN, Frame Relay, dial-up WANs', 'Ethernet WAN, MPLS, broadband VPN, SD-WAN'],
            ['11', 'HyperTerminal, setup mode', 'screen/minicom/PuTTY; answer "no" to setup'],
            ['12', 'enable password, Telnet on VTY, serial clock rate', 'enable secret, SSH, no serial on v1.1'],
            ['15–16', 'IGRP, RIP in depth, classful routing', 'IGRP gone; OSPF is what v1.1 tests'],
            ['17', 'ICMP source quench', 'Deprecated'],
            ['', '', ''], ['', '', '']]
    y = table(c, x, y, W - 80, rows, [0.08, 0.44, 0.48], size=8.2)

    y -= 22
    text(c, x, y, 'p.8  OSI ↔ TCP/IP chart', 'Sans-B', 12, ACCENT)
    y -= 8
    osi = [['#', 'OSI layer', 'TCP/IP', 'PDU', 'Devices', 'Protocols / addresses'],
           ['7', 'Application', 'Application', 'Data', '', 'HTTP, DNS, FTP, SMTP, SNMP, SSH'],
           ['6', 'Presentation', '', 'Data', '', 'encryption, compression, formats'],
           ['5', 'Session', '', 'Data', '', 'session setup / teardown'],
           ['4', 'Transport', 'Transport', 'Segment', '(firewall)', 'TCP, UDP, port numbers'],
           ['3', 'Network', 'Internet', 'Packet', 'Router, L3 switch', 'IP, ICMP, OSPF, IP addresses'],
           ['2', 'Data Link', 'Link', 'Frame', 'Switch, bridge, AP', 'Ethernet, 802.1Q, MAC addresses'],
           ['1', 'Physical', 'Link', 'Bits', 'Hub, repeater, cable', 'UTP, fiber, radio']]
    y = table(c, x, y, W - 80, osi, [0.05, 0.15, 0.14, 0.11, 0.2, 0.35], size=8.2)
    y -= 8
    para(c, x, y, W - 80, 'Mnemonics: top-down "All People Seem To Need Data Processing"; PDUs "Don\'t Some People Fear Birthdays" (Data, Segment, Packet, Frame, Bits).', size=8.3, color=MUTED)
    footer(c, n)


# ================================================================= PAGE 6 · index + back section

def page_back(c, n):
    W, H = letter
    x, y = 40, H - 46
    text(c, x, y, 'The index (pp. 1–2) and the back section (pp. 141–160)', 'Sans-B', 18)
    y -= 30
    y = heading(c, x, y, 'Index: what pages 1–2 look like', 12.5)
    idx = [['Topic', 'Page', 'Tab', 'Topic', 'Page', 'Tab'],
           ['Ch 1 Binary, hex, IP & masks', '9', 'Fund.', 'VLANs & trunks', '71', 'Access'],
           ['Ch 2 OSI, TCP/IP, encapsulation', '12', 'Fund.', 'Spanning Tree / RSTP', '75', 'Access'],
           ['Ch 3 Media (skim)', '16', 'Fund.', 'OSPF', '83', 'IP Conn.'],
           ['Ch 5 Ethernet frames', '18', 'Fund.', 'IPv6', '89', 'IP Conn.'],
           ['…', '', '', '…', '', '']]
    y = table(c, x, y, W - 80, idx, [0.3, 0.07, 0.11, 0.3, 0.07, 0.15], size=8.2)
    y -= 6
    y = para(c, x, y, W - 80, 'Write the entry as soon as you start a spread, not at the end. Enter the same page number in the app (Book → chapter → Notebook page, or Book → Notebook for everything); it suggests the next free page.', size=8.5, color=MUTED)

    y -= 18
    y = heading(c, x, y, 'Mistake log: start on p.160 and work backwards', 12.5)
    y = para(c, x, y, W - 80, 'One line per missed question from Boson, the app\'s chapter quizzes or Anki. The app keeps its own Weak topics list automatically; this log is for the misses you want to think through. Three misses on the same topic → redo that spread from memory.', size=8.5, color=MUTED) - 2
    ml = [['Date', 'Source', 'Topic', 'What I got wrong', 'The right idea', 'Spread'],
          ['11/14', 'Quiz ch 8', 'Subnetting', 'Said 6 subnets for 3 borrowed bits', '2³ = 8 (subnet zero is allowed)', 'p.24'],
          ['11/16', 'Anki', 'Ports', 'TFTP = TCP 69', 'TFTP = UDP 69 (no handshake)', 'p.4'],
          ['', '', '', '', '', ''], ['', '', '', '', '', '']]
    y = table(c, x, y, W - 80, ml, [0.08, 0.11, 0.14, 0.27, 0.3, 0.1], size=8.2)

    y -= 18
    y = heading(c, x, y, 'Weekly review log: start on p.150 and work backwards', 12.5)
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
                                  'Fill one weekly-review row (p.150 backwards).',
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
    pages = [page_overview, page_ruling, page_example, page_reference, page_reference2, page_back, page_routine]
    for i, fn in enumerate(pages, 1):
        if fn in (page_ruling, page_example):
            c.setPageSize(landscape(letter))
        else:
            c.setPageSize(letter)
        fn(c, i)
        c.showPage()
    c.save()
    print('wrote', OUT)


if __name__ == '__main__':
    main()
