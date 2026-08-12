# Euler — Salary Revision Tracker

A salary revision tracker built to replace the `Salary_Revision_Tracker.xlsx` workbook,
with one thing the spreadsheet could not do: **an employee can be revised any number of
times within a fiscal year**, and every revision is measured against the pay it actually
replaced.

It is a static web app. No server, no build step, no accounts, no network calls — data
lives in the browser's local storage on one device, and Excel is how data comes in and
goes out.

```
salary-revision-tracker/
  Salary-Revision-Tracker.html   ← the built app: one file, download and open it
  build.js            rebuilds that file from the sources below
  index.html          the app, unbundled (for development)
  css/app.css         styling, light + dark
  js/model.js         vocabulary, fiscal years, date parsing, validation
  js/engine.js        the calculation engine (also runs under Node, for tests)
  js/io.js            xlsx / csv import and export
  js/store.js         local storage and application state
  js/ui.js            formatting, tables, charts
  js/views/           dashboard · employees · revisions · bulk · import-export
  js/vendor/          SheetJS 0.18.5 (Apache-2.0), vendored — nothing is fetched at runtime
  assets/             Euler logo and mark, as SVG
  test/               engine and round-trip tests
```

## Running it

**Download `Salary-Revision-Tracker.html` and double-click it.** That is the whole setup.

It is one self-contained file — the app, its styling and its spreadsheet library are all
inside it. Put it anywhere: Desktop, a shared drive, an email attachment. Nothing to
install, no folder to keep together, and it makes no network requests at all.

If you have edited the sources in this folder, rebuild that file with:

```sh
node build.js
```

Serving the folder works too, if you prefer it (`python3 -m http.server 8765`), but it
buys you nothing — the data still lives in each person's own browser either way.

## Getting your data in

Open **Import & export** and drop in a file. Three shapes are understood:

| File | What happens |
|---|---|
| The original `Salary_Revision_Tracker.xlsx` | Reads `Employee Master`, then each `FY26-27` / `FY27-28` / `FY28-29` sheet. A per-year row becomes a revision only when it carries a revised CTC, so untouched rows are not imported as fake revisions. Where the master's baseline column is blank, the year sheet's *Current Annual CTC* seeds the baseline. |
| A workbook exported from this app | Reads `Employee Master` and the flat `Revision Ledger`. This is the round-trip: export, edit in Excel, import back. |
| A CSV | Detected as employees or revisions from its headers. Column names are matched loosely — `Emp Code`, `Employee Code` and `Code` all work, as do `Revised Annual CTC`, `Revised CTC` and `New CTC`. |

Import runs in **merge** mode by default (matching records are updated, the rest added) or
**replace** mode. The last import can be undone from the report that appears after it.

Dates are read as `dd/mm/yyyy` — 01/10/2026 is 1 October, not 10 January.

## How the numbers work

### The chain

An employee's pay is a chain: a baseline, then each revision in effective-date order. Every
revision is measured against **whatever the employee was on at that date**, not against the
start of the year. So an employee who gets 10% in April and 20% in October is up 32% on the
year, not 30% — the second raise compounds on the first.

Revisions can be entered in any order; the chain always re-sorts by effective date.

### In effect vs proposed

A revision moves pay only when its approval status is one you have marked as effective.
The default is everything except **On Hold** and **Rejected** — configurable under
Import & export → Policy.

A revision that is not in effect is still stored, still shown, and still costed against the
pay in force at its date. It simply never becomes the base for the next revision. This is
what lets you keep a rejected 15,00,000 proposal on the record without it silently becoming
someone's salary.

### The five numbers per employee per year

| Term | Meaning |
|---|---|
| **Opening CTC** | Pay in force on 31 March, going into the year. Deliberately *not* "on 1 April" — the commonest revision of all is effective 1 April, and measuring from 1 April would swallow it and report the year as a zero increase. |
| **Closing CTC** | Pay in force on 31 March at the end of the year. |
| **Annualised increase** | Closing − Opening. The run-rate cost carried into next year. This is what people usually mean by "the increment". |
| **In-year cost** | What the year actually costs, counting each revision from the whole calendar month it takes effect in. A revision effective any day in August is paid for all of August, which is how payroll works and means the figure reconciles against a monthly payroll register. |
| **In-year impact** | In-year cost − Opening. The extra cash spent *this* year. Always smaller than the annualised increase when a revision lands mid-year — that gap is next year's committed cost. |

Both numbers are reported everywhere because budgeting needs the first and cash forecasting
needs the second, and they differ by a lot in a year with mid-year revisions.

### Unknowns stay unknown

The uploaded master has an empty baseline CTC column. Where no prior pay is on record, the
increment reads `—`, never 0% and never 100%. Fill in a baseline and the figures appear.

## What's in the app

- **Dashboard** — one fiscal year: annualised increase, in-year cost, closing payroll,
  employees revised, average and median increment; a dedicated *revised more than once*
  table; monthly payroll run rate as a step chart; increment distribution; department and
  grade breakdowns with a table view behind each chart.
- **Employees** — the full roster, filterable, including a "revised more than once" filter.
  Selecting anyone opens their year-by-year summary and full revision timeline.
- **Revisions** — the ledger: one row per revision, with the `2/3` marker showing which
  revision of the year it is. Filter and export any view as CSV.
- **Bulk revision** — filter to a set (say Grade A in Sales), apply a percentage, a fixed
  amount or a target CTC, round to the nearest ₹1,000, preview every affected employee and
  the total payroll impact, then commit. Employees with no CTC on record are skipped and
  listed rather than guessed at.
- **Import & export** — described above, plus policy settings and a full JSON backup.

## Saving

Every change is written to this device's local storage the moment you make it — adding a
revision, editing one, running a bulk cycle, importing a file. There is no unsaved state to
lose, and closing the tab is safe.

The **Save** button in the header (or `Ctrl`/`Cmd`+`S`) forces a write and confirms it,
showing when the last save actually landed — `saved just now`, `saved 12m ago`. It is there
for two reasons: reassurance before closing a tab, and as the retry if a write ever fails.

If a write does fail — the only realistic cause is local storage being full — the button
turns red and reads **Retry save · not saved**, the app warns you before you close the tab,
and the failure is explained rather than swallowed. Export a workbook at that point: an
export is a real file and does not depend on this device.

Saving and exporting are different things. Saving keeps your work on this machine; exporting
produces a file you can share, back up or open in Excel.

## Getting your data out

Everything is exportable, and the workbook is built to be *used* in Excel — frozen headers,
autofilters, Indian digit grouping (₹12,34,567), real date cells and column widths already set.

**Download spreadsheet** gives you three plain sheets, and is what you want almost always:

| Sheet | One row per | Columns |
|---|---|---|
| `Salary Revisions` | revision | code, name, department, grade, year, which revision of the year, effective date, reason, salary before, salary after, increase, increase %, status |
| `Employees` | employee | code, name, department, designation, grade, starting salary, current salary, total increase, %, number of revisions, status |
| `Summary` | department, per year | employees, how many revised, revisions, salary bill before and after, increase, %, average increase % |

Under **Other formats**:

| Export | Contents |
|---|---|
| **Detailed workbook (.xlsx)** | Adds a `Read Me` with the definitions, a sheet per year spreading each revision across `R1`/`R2`/`R3` blocks, `Consolidated` and `Lists`. The full audit trail. |
| **Employee list (.csv)** | One row per employee |
| **Backup (.json)** | Everything exactly as stored, for archiving |
| **Blank template (.csv)** | Empty sheet with one example row, to collect revisions offline |

The per-year sheets keep the original workbook's column vocabulary and add `R1`/`R2`/`R3`
blocks, so a year with three revisions stays on one row with each step visible. Only as many
R-blocks as the data needs are emitted.

The `Revision Ledger` sheet is the source of truth and is re-importable: export it, edit it
in Excel, import it back, and rows are matched on revision ID (falling back to employee +
effective date + type) so edits update rather than duplicate.

## Tests

```sh
cd salary-revision-tracker
node test/engine.test.js
node test/io.test.js                                    # synthetic fixtures only
node test/io.test.js /path/to/Salary_Revision_Tracker.xlsx   # also exercises a real file
```

`engine.test.js` covers fiscal-year boundaries, single and multiple mid-year revisions,
compounding, out-of-order entry, rejected revisions, aggregation and the bulk planner —
with the expected figures worked out by hand in the comments.

`io.test.js` covers workbook shape, the export→import round-trip, CSV round-trip, the
original per-FY sheet layout and loose header matching. Given a real workbook it also
synthesises a three-year cycle across the full roster — 1,160 employees, ~3,900 revisions,
~200 of them multi-revision years — and checks that every total survives a round-trip.

Current status: 80 engine assertions and 62 I/O assertions pass. At that scale computing
the whole book takes about 25 ms; exporting the workbook takes a few seconds.

## Notes and limits

- **One device.** Local storage is per-browser and per-origin. Two people cannot edit the
  same data; export a workbook to hand it over. Clearing site data clears the tracker, so
  take a backup before doing that.
- **Capacity.** 1,160 employees with ~3,900 revisions sits comfortably inside the ~5 MB
  local-storage budget. If a write ever fails the app says so and tells you to export.
- **Fiscal year** is fixed to the Indian 1 April – 31 March convention, labelled to match
  the original workbook's tabs.
- The Euler logo is reproduced as SVG from the supplied artwork and tracks the theme
  through `currentColor`.
