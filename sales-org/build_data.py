import openpyxl, collections, re, json

EMP='/root/.claude/uploads/e357e2b7-101a-5852-81e0-5d4ad216b53a/c71ff813-Sales_Employees.xlsx'
INT='/root/.claude/uploads/e357e2b7-101a-5852-81e0-5d4ad216b53a/c5856b3b-Sales_Interns.xlsx'
norm=lambda n: re.sub(r'[^a-z]','',(n or '').lower())

def clean(s): return (str(s).strip() if s is not None else '')

# ---- employees ----
wb=openpyxl.load_workbook(EMP, data_only=True)
emps=[]
for r in wb.active.iter_rows(min_row=2, values_only=True):
    if not (r[2] and str(r[2]).strip()=='Sales'): continue
    emps.append({'id':clean(r[0]),'name':clean(r[1]),'sub':clean(r[3]),'title':clean(r[4]),
                 'band':clean(r[5]),'grade':clean(r[6]),
                 'doj':r[7].strftime('%Y-%m-%d') if r[7] else '','mgr':clean(r[8]),'intern':False})
# ---- interns ----
wb2=openpyxl.load_workbook(INT, data_only=True)
interns=[]
for r in wb2.active.iter_rows(min_row=2, values_only=True):
    if not r[0]: continue
    interns.append({'id':clean(r[0]),'name':clean(r[1]),'sub':clean(r[3]),'title':clean(r[4]),
                    'band':'Intern','grade':'','doj':'','mgr':clean(r[5]),'intern':True})

people = emps + interns
# manager name -> id  (no manager name is duplicated; verified)
by_name={}
for p in emps: by_name.setdefault(norm(p['name']), p['id'])
ALIAS={'naitiksrivastav':'naitiksrivastava','arupchoudhary':'aruproychowdhury','jaikumarcj':'jaikumarcj'}
EXTERNAL={'sauravkumar':'Saurav Kumar','ashishtandon':'Ashish Tandon','abhishekmalik':'Abhishek Malik'}

VACANT_SOUTH='VACANT-SOUTH-RM'

def resolve(m):
    k=norm(m)
    if k in ALIAS: k=ALIAS[k]
    if k=='amitabhsingh': return VACANT_SOUTH          # resigned South RM -> vacant node
    if k in by_name: return by_name[k]
    if k in EXTERNAL: return None
    toks=set(re.findall(r'[a-z]+', m.lower()))
    c=[p for p in emps if toks and toks <= set(re.findall(r'[a-z]+', p['name'].lower()))]
    if len(c)==1: return c[0]['id']
    return None

for p in people:
    p['mgrId']=resolve(p['mgr']) if p['mgr'] else None

# vacant South RM node, reports to Ratanmani Mohit, interim: Mohit
mohit=by_name[norm('Ratanmani Mohit')]
people.append({'id':VACANT_SOUTH,'name':'Vacant — South Regional Manager','sub':'Retail Sales',
               'title':'Regional Manager','band':'Regional Manager','grade':'','doj':'',
               'mgr':'Ratanmani Mohit','mgrId':mohit,'intern':False,'vacant':True,
               'note':'Position open following Amitabh Singh’s resignation. Team currently overseen directly by Ratanmani Mohit.'})

kids=collections.defaultdict(list)
byid={p['id']:p for p in people}
for p in people:
    if p['mgrId'] and p['mgrId']!=p['id'] and p['mgrId'] in byid:
        kids[p['mgrId']].append(p['id'])

# dotted-line roots: report outside Sales leadership
DOTTED={by_name[norm('Raman Pandey')]:'Ashish Tandon', by_name[norm('Vijay Malik')]:'Ashish Tandon'}
jash=by_name.get(norm('Jashanjot Singh'))
if jash: DOTTED[jash]='Abhishek Malik'

ROOT=by_name[norm('Vani Rikhy Mehra')]

def rollup(i, seen=None):
    seen=seen or set()
    if i in seen: return (0,0)
    seen.add(i)
    e = 0 if byid[i].get('vacant') else (0 if byid[i]['intern'] else 1)
    n = 1 if byid[i]['intern'] else 0
    for c in kids[i]:
        ce,cn = rollup(c, seen); e+=ce; n+=cn
    return e,n

def node(i):
    p=byid[i]; e,n=rollup(i)
    d={'id':i,'name':p['name'],'title':p['title'],'sub':p['sub'],'band':p['band'],
       'grade':p['grade'],'doj':p['doj'],'intern':p['intern'],'emp':e,'interns':n,
       'direct':len(kids[i])}
    if p.get('vacant'): d['vacant']=True; d['note']=p['note']
    if i in DOTTED: d['dotted']=DOTTED[i]
    ch=[node(c) for c in kids[i]]
    ch.sort(key=lambda x:(x['intern'], -(x['emp']+x['interns']), x['name']))
    if ch: d['children']=ch
    return d

tree=[node(ROOT)] + [node(i) for i in DOTTED]
data={'tree':tree,'meta':{
  'employees':len(emps),'interns':len(interns),'total':len(emps)+len(interns),
  'subDepts':dict(collections.Counter(p['sub'] for p in emps)),
  'grades':dict(collections.Counter(p['grade'] for p in emps)),
}}
json.dump(data, open('org.json','w'), indent=1)

covered=set()
def mark(nd):
    covered.add(nd['id'])
    for c in nd.get('children',[]): mark(c)
for t in tree: mark(t)
print('employees',len(emps),'interns',len(interns),'total',len(emps)+len(interns))
print('nodes in tree:',len(covered),'| expected',len(people))
missing=[p['name']+' | mgr='+p['mgr'] for p in people if p['id'] not in covered]
print('MISSING:',missing)
print('Vani rollup:', rollup(ROOT))
print('South vacant rollup:', rollup(VACANT_SOUTH))
for i,src in DOTTED.items(): print('dotted:',byid[i]['name'],'->',src, rollup(i))
