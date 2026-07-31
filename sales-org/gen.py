"""Render org.json into the self-contained page.

The chart is a top-down connector tree of managers. Individual contributors
hang off their manager as a single team node rather than as N sibling nodes,
which is what keeps a 36-person team from becoming a 36-wide row.
"""
import json, base64, html

D = json.load(open('org.json'))
tree, meta = D['tree'], D['meta']
e = lambda s: html.escape(str(s or ''))

FONT_DIR = 'fonts'
FONTS = ['BigShoulders-Bold', 'BigShoulders-Regular',
         'WorkSans-Regular', 'WorkSans-Bold', 'JetBrainsMono-Regular']

def font_face(k):
    b64 = base64.b64encode(open(f'{FONT_DIR}/{k}.woff2', 'rb').read()).decode()
    return (f'@font-face{{font-family:"{k.split("-")[0]}";'
            f'font-weight:{700 if "Bold" in k else 400};font-style:normal;'
            f'font-display:block;src:url(data:font/woff2;base64,{b64}) format("woff2")}}')

LOGO = open('logo.svg').read()

# ── tree markup ───────────────────────────────────────────────────────────
DRAWER = {}          # node id -> detail payload consumed by the drawer
MGRS = [0]

def pills(n):
    out = f'<span class="pill pill-n">{n["emp"]}</span>'
    if n['interns']:
        out += f'<span class="pill pill-i">{n["interns"]}<i>i</i></span>'
    return out


def card(n):
    tier = ('vp' if n['title'].startswith('Vice President') else
            'vacant' if n.get('vacant') else 'mgr')
    loc = n['locs'][0]['name'] if n.get('locs') else ''
    sub = '' if n['sub'] in ('Retail Sales', 'Leadership') else n['sub']
    meta_line = ' · '.join(x for x in (sub, loc) if x)

    DRAWER[n['id']] = {
        'name': n['name'], 'title': n['title'], 'sub': n['sub'], 'grade': n['grade'],
        'doj': n['doj'], 'loc': n['loc'], 'emp': n['emp'], 'interns': n['interns'],
        'direct': n['direct'], 'locs': n.get('locs', []),
        'vacant': n.get('vacant', False), 'note': n.get('note', ''),
        'reports': [{'name': c['name'], 'title': c['title'],
                     'emp': c['emp'], 'interns': c['interns']}
                    for c in n.get('children', [])],
        'team': n.get('team', {}).get('members', []),
    }
    MGRS[0] += 1

    search = f'{n["name"]} {n["title"]} {n["sub"]} {loc}'.lower()
    return (f'<button class="card c-{tier}" type="button" data-id="{e(n["id"])}" '
            f'data-search="{e(search)}">'
            f'<span class="c-name">{e(n["name"])}</span>'
            f'<span class="c-role">{e(n["short"])}</span>'
            + (f'<span class="c-meta">{e(meta_line)}</span>' if meta_line else '')
            + f'<span class="c-pills">{pills(n)}</span></button>')


def team_card(n):
    t = n['team']
    tid = n['id'] + ':team'
    DRAWER[tid] = {'name': n['name'] + '’s team', 'title': 'Direct individual contributors',
                   'sub': n['sub'], 'grade': '', 'doj': '', 'loc': '',
                   'emp': t['emp'], 'interns': t['interns'], 'direct': len(t['members']),
                   'locs': [], 'vacant': False, 'note': '', 'reports': [],
                   'team': t['members']}
    tally = ' <i>·</i> '.join(f'<b>{v}</b> {e(k)}' for k, v in t['titles'][:3])
    if len(t['titles']) > 3:
        tally += f' <i>·</i> <b>+{len(t["titles"]) - 3}</b> more'
    search = ' '.join(m['name'] + ' ' + m['title'] + ' ' + m['loc'] for m in t['members']).lower()
    pl = f'<span class="pill pill-n">{t["emp"]}</span>' if t['emp'] else ''
    if t['interns']:
        pl += f'<span class="pill pill-i">{t["interns"]}<i>i</i></span>'
    return (f'<button class="card c-team" type="button" data-id="{e(tid)}" '
            f'data-search="{e(search)}">'
            f'<span class="c-role">Team</span>'
            f'<span class="c-tally">{tally}</span>'
            f'<span class="c-pills">{pl}</span></button>')


def render(n, depth=0):
    kids = n.get('children', [])
    has_team = 'team' in n
    branches = len(kids) + (1 if has_team else 0)
    # the top three tiers are open on load; deeper tiers start folded
    collapsed = depth >= 2 and branches > 0

    cls = f'lv{min(depth, 4)}'
    if collapsed: cls += ' collapsed'
    if branches: cls += ' has-kids'

    out = [f'<li class="{cls}"><div class="slot">', card(n)]
    if branches:
        out.append(f'<button class="tog" type="button" '
                   f'aria-expanded="{"false" if collapsed else "true"}" '
                   f'aria-label="{e(n["name"])}: {branches} branches">'
                   f'<span class="tog-n">{branches}</span></button>')
    out.append('</div>')

    if branches:
        out.append('<ul>')
        out += [render(c, depth + 1) for c in kids]
        if has_team:
            out.append(f'<li class="lv{min(depth + 1, 4)} is-team"><div class="slot">'
                       f'{team_card(n)}</div></li>')
        out.append('</ul>')
    out.append('</li>')
    return ''.join(out)


tree_html = f'<ul class="root">{render(tree)}</ul>'

# ── panels ────────────────────────────────────────────────────────────────
def bars(rows, label=lambda k: k):
    mx = max(v for _, v in rows)
    return ''.join(
        f'<li><span class="b-l">{label(k)}</span>'
        f'<span class="b-t"><i style="width:{round(v / mx * 100)}%"></i></span>'
        f'<span class="b-v">{v}</span></li>' for k, v in rows)

GRADE = {'A': 'A — field &amp; executive', 'B': 'B — managerial',
         'C': 'C — senior leadership'}

STATS = [(meta['employees'], 'Employees'), (meta['interns'], 'Interns'),
         (meta['total'], 'Total'), (MGRS[0], 'Managers'),
         (len(meta['locations']), 'States'), (1, 'Open seat')]

tpl = open('template.html', encoding='utf-8').read()
out = (tpl
       .replace('/*FONTS*/', ''.join(font_face(k) for k in FONTS))
       .replace('<!--LOGO-->', LOGO)
       .replace('<!--STATS-->', ''.join(
           f'<div class="stat"><b>{v}</b><span>{l}</span></div>' for v, l in STATS))
       .replace('<!--TREE-->', tree_html)
       .replace('<!--SUBBARS-->', bars(meta['subDepts'], e))
       .replace('<!--GBARS-->', bars(meta['grades'], lambda k: GRADE.get(k, e(k))))
       .replace('<!--LOCBARS-->', bars(meta['locations'], e))
       .replace('/*DATA*/', json.dumps(DRAWER, separators=(',', ':')))
       .replace('__TOTAL__', str(meta['total'])))

open('sales-org.html', 'w', encoding='utf-8').write(out)

assert '__TOTAL__' not in out and '/*DATA*/' not in out and '/*FONTS*/' not in out
assert '<!--TREE-->' not in out and '<!--LOGO-->' not in out
print('manager cards :', MGRS[0])
print('drawer entries:', len(DRAWER))
print('page size     :', round(len(out) / 1024), 'KB')
print('placeholders  : all replaced')
