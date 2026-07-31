# Euler Sales — Org Structure

An interactive org chart for the Sales department: 367 employees and 54 interns,
every reporting line rebuilt from the roster's Reporting Manager column.

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
| `template.html` | Markup, styling, and the expand/search behaviour |
| `gen.py` | Renders the tree into the template |
| `fonts/` | Subsetted Big Shoulders, Work Sans, JetBrains Mono (~27 KB total) |

## How the tree was resolved

Reporting lines come from the roster's Reporting Manager column, which holds
names rather than employee codes. Resolution keys each person by employee code
and matches managers by normalised name, with token-subset fallback for spelling
variants (`Naitik Srivastav` → `Naitik Srivastava`, `Arup Choudhary` →
`Arup Roy Chowdhury`, `Vikas singh bisht` → `Vikas Singh Bisht`). All 421 people
resolve into the tree with none orphaned.

Seven employees share a name with a colleague. None of them is a manager, so
name-based manager lookup stays unambiguous; each is still a distinct node keyed
by employee code.

## Structural notes

- **South Regional Manager is vacant.** 37 people listed `Amitabh Singh` as their
  manager; he has resigned and does not appear in the roster. The line is kept
  intact under an explicit vacant node reporting to Ratanmani Mohit, who is
  covering it directly until a replacement joins.
- **Three lines report outside Sales leadership** and are drawn dashed rather
  than folded into the VP's tree: Euler Assured (19) and Institutional Sales (4)
  report to Ashish Tandon, and one 3W Retail Sales role reports to Abhishek Malik.
- **Headcount on a row counts the whole line including the person named.**
  Interns are counted separately and never fold into the employee figure.
