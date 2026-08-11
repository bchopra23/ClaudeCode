# Sales Org Structure

An interactive org chart for the Sales department: 361 employees and 54 interns.
Every reporting line is rebuilt from the roster's Reporting Manager column.

The page is **one continuous tree**. Selecting a manager opens their branch in
place — the lines above and around it stay exactly where they were, so the
whole hierarchy remains in view. Individual contributors are listed by name
under the manager they report to. Nothing zooms and nothing scrolls sideways,
so it reads the same on a phone as on a desktop.

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

Search covers all 397 people. Picking a result opens whatever branches are
needed to reach that person and highlights them, without closing anything
already open.

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

## The South seat

Rohit Madhavan (EUR2236) has joined as South Regional Manager. `SOUTH_RM` in
`build_data.py` names him; everyone the roster still records against Amitabh
Singh is repointed to him, and Ravi Prakash — parked under the AVP while the
seat was open — moves back under him with his own line. Ratanmani Mohit no
longer oversees the South directly. The seat carries 40 people and 16 cities.

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

## Function heads

`PORTFOLIOS` in `build_data.py` names what each of the VP's function heads owns.
The roster designation alone ("General Manager") does not say which part of
Sales that is, so the portfolio is shown as the primary line on the card, with
the roster designation kept underneath:

| Person | Owns |
| --- | --- |
| Ratanmani Mohit | Retail Sales & Brands |
| Gaurav Bhardwaj | Regional Management · Sales Central · Special Projects |
| Ritesh Roy | Sales Expansion |
| Shashank | Sales Operations |

## Territory map

`territory.xlsx` maps 102 cities to a zone and a Regional Manager. Each RM's
card shows their city count and zones, and their branch lists every city they
cover. `TERRITORY_OWNER` in `build_data.py` resolves the sheet's first-name
column onto roster people.

Two things the sheet settles:

- **The South cities belong to Rohit Madhavan**, who now holds the seat.
- **Gaurav Bhardwaj holds no cities.** He is a Regional Manager by title but
  owns Sales Central and Special Projects rather than a geography, which is
  why he reports to the VP rather than through the AVP.

The sheet's Zone column mixes true zones (North, South, East, West) with state
codes (UP, RJ, MP, CG, JK) and individual states (Punjab, Haryana,
Chandigarh). Zones are shown as recorded rather than normalised.

## Sources

| File | What it carries |
| --- | --- |
| `roster.xlsx` | Current roster — reporting lines, designation, state and city for all 393 Sales records |
| `territory.xlsx` | 102 cities mapped to a zone and a Regional Manager |
| `masterfile.xlsx` | 224 validated field-force records — channel vs field, outlet type |

The current roster dropped the Grade column, so grades are carried over from the
previous extract by employee code; the 26 people who joined since are ungraded,
and the panel says how many it covers.

## Field-force masterfile

`masterfile.xlsx` holds 224 validated, active Retail Sales records at TSM /
Sr TSM / TSE level — the bottom two layers. It carries three things the roster
does not: whether someone sells **Field** or **Channel**, the **city** they
work, and the **outlet** they work from. 218 of the 224 join to the roster by
employee code.

It also carries an explicit Regional Sales Manager column, which was used to
check the tree rather than rebuild it. At ASM level **26 of 35 links match
exactly**; of the 9 that differ, 5 are not real conflicts (the ASM cell holds
an RM's own name for people who report to them directly, so the RSM column
simply names that RM's own boss) and one is a spelling variant. That leaves
three genuine gaps, listed below.

Not applied to the tree, and worth resolving at source:

- **Three ASMs have reports here but appear as individual contributors in the
  roster** — Arpit Raj (4 people, under Vikas Singh Bisht), Swatantra Kumar
  Mishra (3, under Subesh Mukherjee) and Pankaj Kumar Gautam (2, under Rachit
  Sharma).
- **22 rows are flagged `Incorrect Mapping`** by the Sales PM, with the
  correction written in free text in the last column.
- **Siddhartha Sharma is a Regional Manager.** The masterfile never lists him as
  an RSM, but the current roster shows four Area Sales Managers reporting to him
  (Naveen Gaur, Arpit Raj, Akhil Gupta, Hemant Kumar Dilliwar), which settles it
  in favour of the RM list. The note below is kept for context.
- **Siddhartha Sharma never appears as an RSM in the masterfile** — his people are
  attributed to Ratanmani Mohit, and he is named as an ASM correction. That
  contradicts the RM list, so the RM list was kept.

## Display notes

The page renders light by default and only goes dark if the viewer explicitly
toggles it — `prefers-color-scheme` is deliberately not consulted.

`HIDE_LOCATION` in `build_data.py` suppresses the state shown for Vani Rikhy
Mehra and Ratanmani Mohit — both sit across the whole department, so pinning
either to one state would mislead. They are still counted in the By state
totals, which is why those totals sum to all 343 employees.

## Structural notes

- **South Regional Manager is vacant.** 37 people listed `Amitabh Singh` as their
  manager; he has resigned and does not appear in the roster. The line is kept
  intact under an explicit vacant node reporting to Ratanmani Mohit, who is
  covering it directly until a replacement joins.
- **Headcount on a card counts the whole line including the person named.**
  Interns are counted separately and never fold into the employee figure.
