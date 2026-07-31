import json, base64, html, collections, re

D = json.load(open('org.json'))
tree, meta = D['tree'], D['meta']

FONT_DIR = 'fonts'

def font(f):
    return base64.b64encode(open(f'{FONT_DIR}/{f}.woff2', 'rb').read()).decode()

FONTS = {k: font(k) for k in
         ['BigShoulders-Bold', 'BigShoulders-Regular',
          'WorkSans-Regular', 'WorkSans-Bold', 'JetBrainsMono-Regular']}

e = lambda s: html.escape(str(s or ''))

# ---- title abbreviations for roll-up strips -------------------------------
ABBR = [
    ('Assistant Vice President', 'AVP'), ('Vice President', 'VP'),
    ('Senior Territory Sales Manager', 'Sr TSM'), ('Territory Sales Manager', 'TSM'),
    ('Territory Sales Executive', 'TSE'), ('Senior Area Sales Manager', 'Sr ASM'),
    ('Area Sales Manager', 'ASM'), ('Key Accounts Manager', 'KAM'),
    ('Key Account Manager', 'KAM'), ('Assistant General Manager', 'AGM'),
    ('General Manager', 'GM'), ('Regional Manager', 'RM'),
    ('Senior Sales Executive', 'Sr Sales Exec'), ('Sales Executive', 'Sales Exec'),
    ('Senior Executive- Accounts', 'Sr Exec (Accts)'), ('Senior Executive', 'Sr Exec'),
    ('Senior Manager- Inside Sales', 'Sr Mgr'), ('Senior Manager', 'Sr Mgr'),
    ('Assistant Manager - New Product Sales', 'Asst Mgr'),
    ('Assistant Manager', 'Asst Mgr'), ('Program Manager', 'Program Mgr'),
    ('Data Analyst Executive', 'Data Analyst'), ('State Head-Sales', 'State Head'),
    ('Regional Trainer', 'Trainer'), ('Manager-Network Expansion', 'Mgr'),
    ('Manager- BTL Marketing', 'Mgr'), ('Intern', 'Intern'),
]
def abbr(t):
    t = (t or '').strip()
    for long, short in ABBR:
        if t.startswith(long):
            return short
    return t

# tier controls type size / weight of a row
def tier(n, depth):
    if depth == 0: return 'vp'
    if n.get('children'): return 'lead' if depth <= 2 else 'mgr'
    return 'ic'

def counts(n):
    # a leaf is always exactly itself — the chip would say nothing
    if not n.get('children'):
        return ''
    out = []
    if n['emp']:
        out.append(f'<span class="chip chip-n" title="Employees in this line, including {e(n["name"])}">{n["emp"]}</span>')
    if n['interns']:
        out.append(f'<span class="chip chip-i" title="Interns in this line">{n["interns"]}<span class="u">i</span></span>')
    return ''.join(out)

nid = [0]

def render(n, depth=0):
    nid[0] += 1
    me = f'n{nid[0]}'
    kids = n.get('children', [])
    leaf_only = bool(kids) and all(not c.get('children') for c in kids)
    collapsed = leaf_only and len(kids) >= 3
    t = tier(n, depth)

    search = ' '.join([n['name'], n['title'], n['sub']]).lower()
    cls = ['node', f't-{t}']
    if n.get('vacant'): cls.append('is-vacant')
    if n.get('dotted'): cls.append('is-dotted')
    if n['intern']: cls.append('is-intern')

    # ---- row -------------------------------------------------------------
    if kids:
        tw = (f'<button class="twist" type="button" aria-expanded="{"false" if collapsed else "true"}" '
              f'aria-controls="{me}k" aria-label="{e(n["name"])}’s team, {len(kids)} direct reports">'
              f'<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 1.5 L7 5 L2.5 8.5"/></svg></button>')
    else:
        tw = '<span class="twist twist-none" aria-hidden="true"></span>'

    flags = ''
    if n.get('vacant'):
        flags += '<span class="flag flag-vac">Position open</span>'
    if n.get('dotted'):
        flags += f'<span class="flag flag-dot">Reports to {e(n["dotted"])}</span>'

    sub = f'<span class="chip chip-s">{e(n["sub"])}</span>' if n['sub'] else ''

    row = (f'<div class="row">{tw}'
           f'<span class="who"><span class="nm">{e(n["name"])}</span>'
           f'<span class="ttl">{e(n["title"])}</span></span>'
           f'<span class="tags">{flags}{sub}{counts(n)}</span></div>')

    note = f'<p class="note">{e(n["note"])}</p>' if n.get('note') else ''

    # ---- children --------------------------------------------------------
    # the tally stands in for the team while it is folded, so it lives
    # outside .kids and swaps with it
    inner = ''
    if kids:
        tally = collections.Counter(abbr(c['title']) for c in kids)
        strip = ' <span class="sep">·</span> '.join(
            f'<b>{v}</b> {e(k)}' for k, v in tally.most_common())
        inner += (f'<button class="rollup" type="button" aria-controls="{me}k" tabindex="-1">'
                  f'{strip}<span class="more">Show</span></button>')
        inner += (f'<div class="kids" id="{me}k">'
                  + ''.join(render(c, depth + 1) for c in kids) + '</div>')

    openattr = ' data-open="false"' if collapsed else ' data-open="true"'
    return (f'<div class="{" ".join(cls)}" data-search="{e(search)}" '
            f'data-depth="{depth}"{openattr}>{row}{note}{inner}</div>')


root = tree[0]
dotted = tree[1:]
body = render(root) + ''.join(render(d) for d in dotted)

# ---- leadership band ------------------------------------------------------
directs = root.get('children', [])
mx = max((d['emp'] + d['interns']) for d in directs + dotted)

def card(d, kind='solid'):
    tot = d['emp'] + d['interns']
    pct = round(tot / mx * 100)
    vac = '<span class="flag flag-vac">1 open</span>' if any(
        c.get('vacant') for c in d.get('children', [])) else ''
    line = (f'<span class="c-line">reports to {e(d["dotted"])}</span>'
            if d.get('dotted') else '')
    ints = f'<span class="c-i">+{d["interns"]} interns</span>' if d['interns'] else ''
    return (f'<article class="card card-{kind}" tabindex="0" data-goto="{e(d["name"])}">'
            f'<h3>{e(d["name"])}</h3>'
            f'<p class="c-t">{e(d["title"])}</p>'
            f'<p class="c-s">{e(d["sub"])}{vac}</p>'
            f'<p class="c-n"><b>{d["emp"]}</b><span>people</span>{ints}</p>'
            f'<div class="meter"><i style="width:{pct}%"></i></div>{line}</article>')

band = ''.join(card(d) for d in directs)
band_dotted = ''.join(card(d, 'dotted') for d in dotted)

# ---- distribution ---------------------------------------------------------
subs = sorted(meta['subDepts'].items(), key=lambda x: -x[1])
smax = subs[0][1]
subbars = ''.join(
    f'<li><span class="b-l">{e(k)}</span>'
    f'<span class="b-t"><i style="width:{round(v / smax * 100)}%"></i></span>'
    f'<span class="b-v">{v}</span></li>' for k, v in subs)

GRADE = {'A': 'Grade A — field &amp; executive',
         'B': 'Grade B — managerial',
         'C': 'Grade C — senior leadership'}
gr = sorted(meta['grades'].items())
gtot = sum(v for _, v in gr)
gbars = ''.join(
    f'<li><span class="b-l">{GRADE.get(k, e(k))}</span>'
    f'<span class="b-t"><i style="width:{round(v / gtot * 100)}%"></i></span>'
    f'<span class="b-v">{v}</span></li>' for k, v in gr)

# widest spans of control — direct reports, deepest-first
spans = []
def collect(n):
    if n.get('children'):
        spans.append((n['name'], n['title'], len(n['children'])))
        for c in n['children']: collect(c)
for t in tree: collect(t)
spans.sort(key=lambda x: -x[2])
smx = spans[0][2]
spanbars = ''.join(
    f'<li><span class="b-l">{e(nm)}<em>{e(abbr(ti))}</em></span>'
    f'<span class="b-t"><i style="width:{round(c / smx * 100)}%"></i></span>'
    f'<span class="b-v">{c}</span></li>' for nm, ti, c in spans[:8])

STATS = [(meta['employees'], 'Employees'), (meta['interns'], 'Interns'),
         (meta['total'], 'Total headcount'), (len(directs), 'VP direct reports'),
         (1, 'Open position')]
stats = ''.join(f'<div class="stat"><b>{v}</b><span>{l}</span></div>' for v, l in STATS)

tpl = open('template.html', encoding='utf-8').read()
out = (tpl.replace('/*FONTS*/', ''.join(
        f'@font-face{{font-family:"{k.split("-")[0]}";'
        f'font-weight:{700 if "Bold" in k else 400};font-style:normal;font-display:block;'
        f'src:url(data:font/woff2;base64,{v}) format("woff2")}}'
        for k, v in FONTS.items()))
       .replace('<!--STATS-->', stats)
       .replace('<!--BAND-->', band)
       .replace('<!--BANDDOTTED-->', band_dotted)
       .replace('<!--TREE-->', body)
       .replace('<!--SUBBARS-->', subbars)
       .replace('<!--GBARS-->', gbars)
       .replace('<!--SPANBARS-->', spanbars)
       .replace('__TOTAL__', str(meta['total'])))
open('sales-org.html', 'w', encoding='utf-8').write(out)
print('wrote sales-org.html', round(len(out) / 1024), 'KB')
