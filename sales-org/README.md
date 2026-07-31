# Euler Sales — Org Structure

An interactive org chart for the Sales department: 343 employees and 54 interns.
Every reporting line is rebuilt from the roster's Reporting Manager column.

The page shows **one manager at a time** — their card, the branches beneath
them on a tree rail, and everyone reporting to them directly, listed by name.
A breadcrumb tracks the path back up. Nothing zooms and nothing scrolls
sideways, so it reads the same on a phone as on a desktop.

## Build

```
pip install openpyxl
python3 build_data.py   # roster .xlsx -> org.json
python3 gen.py          # org.json + template.html -> sales-org.html
```

`sales-org.html` is fully self-contained — fonts are inlined as base64 woff2 and
there are no external requests, so it opens straight from disk.

## Files

| File | Purpose |
| --- | --- |
| `build_data.py` | Reads the two roster workbooks, resolves manager names to IDs, emits `org.json` |
| `org.json` | The resolved tree plus headcount roll-ups |
| `template.html` | Markup, styling, and the tree/zoom/drawer behaviour |
| `gen.py` | Renders the tree into the template |
| `logo.svg` | The Euler lockup, drawn as geometry so it needs no font |
| `fonts/` | Subsetted Big Shoulders, Work Sans, JetBrains Mono (~27 KB total) |

## How the tree was resolved

Reporting lines come from the roster's Reporting Manager column, which holds
names rather than employee codes. Resolution keys each person by employee code
and matches managers by normalised name, with token-subset fallback for spelling
variants (`Naitik Srivastav` → `Naitik Srivastava`, `Arup Choudhary` →
`Arup Roy Chowdhury`, `Vikas singh bisht` → `Vikas Singh Bisht`). All 397 people
resolve into the tree with none orphaned.

Search covers all 397 people. Picking a manager opens their view; picking
anyone else opens their manager's view with that person highlighted in the
list.

Seven employees share a name with a colleague. None of them is a manager, so
name-based manager lookup stays unambiguous; each is still a distinct node keyed
by employee code.

## Scope and labelling

- **Retail is one function.** The roster splits it into `3W Retail Sales` and
  `4W Retail Sales`; both are folded into `Retail Sales`.
- **Three lines are excluded** as out of scope, whole subtree each: Euler
  Assured (Raman Pandey, 19), Institutional Sales (Vijay Malik, 4), and one
  Retail Sales role under Abhishek Malik. All three report outside Sales
  leadership. That is the 24-person gap between the roster's 367 Sales
  employees and this chart's 343.

## Regional Managers

Seven people are recorded on the roster by grade — mostly General Manager —
while the role they actually hold is Regional Manager. `REGIONAL_MANAGERS` in
`build_data.py` carries that list; those people are shown as Regional Managers
with their roster designation noted alongside. The vacant South seat is the
eighth RM position.

Each RM shows the number of territory sales managers and territory sales
executives anywhere in their line. TSM counts include Senior TSM.

Note that Gaurav Bhardwaj is a Regional Manager but reports to the VP directly
rather than through the AVP, so he appears one level up from the other seven.

## Structural notes

- **South Regional Manager is vacant.** 37 people listed `Amitabh Singh` as their
  manager; he has resigned and does not appear in the roster. The line is kept
  intact under an explicit vacant node reporting to Ratanmani Mohit, who is
  covering it directly until a replacement joins.
- **Headcount on a card counts the whole line including the person named.**
  Interns are counted separately and never fold into the employee figure.
