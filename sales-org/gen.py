"""Render org.json into the self-contained page.

The page shows one manager at a time — their card, the branches under them,
and the people who report to them directly — so nothing ever needs zooming or
scrolling sideways. The view is built in the browser from the tree below.
"""
import json, base64, html

D = json.load(open('org.json'))
tree, meta = D['tree'], D['meta']
e = lambda s: html.escape(str(s or ''))

FONTS = ['BigShoulders-Bold', 'WorkSans-Regular', 'WorkSans-Bold', 'JetBrainsMono-Regular']

def font_face(k):
    b64 = base64.b64encode(open(f'fonts/{k}.woff2', 'rb').read()).decode()
    return (f'@font-face{{font-family:"{k.split("-")[0]}";'
            f'font-weight:{700 if "Bold" in k else 400};font-style:normal;'
            f'font-display:block;src:url(data:font/woff2;base64,{b64}) format("woff2")}}')

# ── flatten the tree into what the view needs ─────────────────────────────
NODES = {}      # id -> manager record
INDEX = []      # every person, for search

def visit(n, parent=None):
    kids = n.get('children', [])
    team = n.get('team', {})
    NODES[n['id']] = {
        'id': n['id'], 'name': n['name'], 'title': n['title'], 'sub': n['sub'],
        'loc': n['loc'], 'grade': n['grade'], 'emp': n['emp'], 'interns': n['interns'],
        'vacant': n.get('vacant', False), 'note': n.get('note', ''),
        'rm': n.get('rm', False), 'rosterTitle': n.get('rosterTitle', ''),
        'portfolio': n.get('portfolio', ''),
        'zones': n.get('zones', []), 'cities': n.get('cities', []),
        'chan': n.get('chan', 0), 'field': n.get('field', 0),
        'tsm': n.get('tsm', 0), 'tse': n.get('tse', 0),
        'parent': parent,
        'kids': [{'id': c['id'], 'name': c['name'], 'title': c['title'],
                  'loc': c['locs'][0]['name'] if c.get('locs') else c['loc'],
                  'emp': c['emp'], 'interns': c['interns'],
                  'branches': len(c.get('children', [])),
                  'direct': len(c.get('team', {}).get('members', [])),
                  'rm': c.get('rm', False), 'zones': c.get('zones', []),
                  'chan': c.get('chan', 0),
                  'tsm': c.get('tsm', 0), 'tse': c.get('tse', 0),
                  'vacant': c.get('vacant', False)} for c in kids],
        'team': team.get('members', []),
    }
    INDEX.append({'n': n['name'], 't': n['title'], 'l': n['loc'], 'g': n['id'], 'm': 1})
    for m in team.get('members', []):
        INDEX.append({'n': m['name'], 't': m['title'], 'l': m['loc'],
                      'g': n['id'], 'm': 0})
    for c in kids:
        visit(c, n['id'])

visit(tree)

# ── panels ────────────────────────────────────────────────────────────────
def bars(rows, label=lambda k: k):
    mx = max(v for _, v in rows)
    return ''.join(
        f'<li><span class="b-l">{label(k)}</span>'
        f'<span class="b-t"><i style="width:{round(v / mx * 100)}%"></i></span>'
        f'<span class="b-v">{v}</span></li>' for k, v in rows)

GRADE = {'A': 'Field &amp; executive', 'B': 'Managerial', 'C': 'Senior leadership'}

RM_COUNT = sum(1 for n in NODES.values() if n['rm'])
STATS = [(meta['employees'], 'Employees'), (meta['interns'], 'Interns'),
         (meta['total'], 'People in all'), (RM_COUNT, 'Regional managers'),
         (meta['cities'], 'Cities covered')]

tpl = open('template.html', encoding='utf-8').read()
out = (tpl
       .replace('/*FONTS*/', ''.join(font_face(k) for k in FONTS))
       .replace('<!--LOGO-->', open('logo.svg').read())
       .replace('<!--STATS-->', ''.join(
           f'<div class="stat"><b>{v}</b><span>{l}</span></div>' for v, l in STATS))
       .replace('<!--SUBBARS-->', bars(meta['subDepts'], e))
       .replace('<!--GBARS-->', bars(meta['grades'], lambda k: GRADE.get(k, e(k))))
       .replace('<!--LOCBARS-->', bars(meta['locations'], e))
       .replace('<!--ZONEBARS-->', bars(meta['zones'], e))
       .replace('<!--CHANBARS-->', bars(meta['channel'], e))
       .replace('<!--OUTBARS-->', bars(meta['outlets'], e))
       .replace('<!--CITYBARS-->', bars(meta['topCities'], e))
       .replace('__GRADED__', str(sum(v for _, v in meta['grades'])))
       .replace('/*NODES*/', json.dumps(NODES, separators=(',', ':')))
       .replace('/*INDEX*/', json.dumps(INDEX, separators=(',', ':')))
       .replace('__ROOT__', json.dumps(tree['id']))
       .replace('__TOTAL__', str(meta['total'])))

open('sales-org.html', 'w', encoding='utf-8').write(out)

for token in ('/*FONTS*/', '/*NODES*/', '/*INDEX*/', '__ROOT__', '__TOTAL__', '__GRADED__',
              '<!--LOGO-->', '<!--STATS-->', '<!--SUBBARS-->'):
    assert token not in out, token
print('manager views :', len(NODES))
print('searchable    :', len(INDEX))
print('page size     :', round(len(out) / 1024), 'KB')
