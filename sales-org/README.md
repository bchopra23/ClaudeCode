# Euler Sales — Org Structure

An interactive org chart for the Sales department: 343 employees and 54 interns,
drawn as a top-down connector tree. Every reporting line is rebuilt from the
roster's Reporting Manager column.

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

The chart is a tree of managers. A manager's individual contributors do not
become sibling nodes — they hang off that manager as a single team card, which
is what stops a 36-person team from rendering as a 36-wide row. Opening a team
card lists every member with their role and state.

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

## Structural notes

- **South Regional Manager is vacant.** 37 people listed `Amitabh Singh` as their
  manager; he has resigned and does not appear in the roster. The line is kept
  intact under an explicit vacant node reporting to Ratanmani Mohit, who is
  covering it directly until a replacement joins.
- **Headcount on a card counts the whole line including the person named.**
  Interns are counted separately and never fold into the employee figure.
