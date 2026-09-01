# Euler Letter Generators

Generates letters on the Euler Motors letterhead from an Employee ID and a few
figures. Everything else — name, designation, date of joining, department,
sub-department and location — is looked up from the HR master database, and every
letter carries Priyanka Singh's signature and the company seal.

There are two applications in `dist/`:

| File | Produces |
| --- | --- |
| `Variable_Pay_Letter_Generator.html` | Variable pay awards and revisions |
| `Increment_Letter_Generator.html` | Salary increments, with or without a promotion |

Each is one self-contained file: no install, no server, no network. Double-clicking
it works. They share their letterhead geometry, employee lookup and bulk grid
through `src/core.js`, which the build inlines into both, so the two can never
drift apart on layout or roster.

# Variable Pay Letter Generator

Open **`dist/Variable_Pay_Letter_Generator.html`**. It has three modes.

## Individual

One letter at a time, with an on-screen preview.

1. Enter the Employee ID (`EUR1796`; `eur1796` and a bare `1796` also resolve).
2. Enter the **Total Eligible Variable Pay** and the **Variable Pay Awarded**, in
   rupees (`250000`, or `2,50,000`). The letter prints both and works out the
   payout percentage between them.
3. Set the letter date. It starts on today's date and can be changed.
4. The employee's details appear as soon as the ID matches. An ID that is not in
   the database shows an error and both buttons stay disabled.
5. **Preview Letter** renders the finished letter on screen.
6. **Download Letter PDF** saves it as `Variable_Pay_Letter_<EmployeeID>.pdf`.
7. **Download Word Template (.docx)** saves a blank, editable copy of the letter.
   It is always available, including with the form empty — it exists for people
   the master database does not have.

## Bulk Letters

A whole payout run in one zip.

1. Set the letter date. It applies to every letter in the batch.
2. Copy the Employee ID, Eligible Variable Pay and Variable Pay Awarded columns
   out of your spreadsheet and paste them anywhere in the table. Rows are added as
   needed and a pasted header row is ignored, so selecting the headings too is
   harmless.
3. Each row shows the resolved employee, the payout against the eligible amount
   and the percentage, or what is wrong with it.
4. **Preview** on any valid row draws that letter in the pane beside the table,
   and **Download** saves that one letter on its own.
5. **Download all Letters (Zip)** produces `Variable_Pay_Letters_<date>.zip`
   containing one `Variable_Pay_Letter_<EmployeeID>.pdf` per row.

A preview is tied to the row that produced it. Change that row's ID or amount, or
the batch date, and the preview is dropped rather than left showing figures the
table no longer agrees with; editing any other row leaves it alone.

The zip download stays disabled until every row is valid. A batch is refused rather
than quietly built minus the broken rows — silently dropping someone from a payout
run is worse than making the typo obvious first. Rows are flagged for an unknown
ID, a non-numeric or non-positive figure in either amount column, or an employee
listed twice (two letters for one person would collide inside the zip).

Reckon on roughly a quarter of a megabyte per letter and about a tenth of a second
to build each one: 200 letters is a 50 MB zip that takes around 20 seconds. Very
large runs are better split into a few batches.

Nothing is uploaded anywhere, in any mode. The database, the fonts and the PDF
engine are all embedded in the file, and every letter is built in the browser.

## Revision Letters

For an award re-decided after the first letter has already gone out — someone paid
80% whose manager then agrees 100%. The original letter stands; this one records
the revision and names the differential now due, and reads on its own without the
first letter to hand.

Enter the Employee ID, the **Total Eligible**, what was **Previously Awarded** and
the **Revised Award**. The differential is derived. The callout carries all three:

| PREVIOUSLY AWARDED | REVISED AWARD | DIFFERENTIAL PAYABLE |
| --- | --- | --- |
| INR 2,40,000 | INR 3,00,000 | **INR 60,000** |
| 80% of eligible | 100% of eligible | |

The panel has a single-letter form at the top and a four-column bulk grid beneath,
each with its own preview. Files are named
`Variable_Pay_Revision_Letter_<EmployeeID>.pdf` and the batch
`Variable_Pay_Revision_Letters_<date>.zip`, deliberately distinct from the award
letter names so a revision can never overwrite the letter it supersedes.

**Upward revisions only.** A revised award equal to what was already paid means
there is no differential, and one lower than it is a recovery — a different letter
with different weight. Both are rejected with a readable message rather than
quietly produced under a congratulatory heading. `Previously Awarded` accepts zero,
for someone paid nothing who is now awarded something.

## What the letter contains

A4, one page, on the supplied letterhead: the date, a block of the seven employee
fields, a subject line, a congratulatory message for the award period, the amount in
figures and in words (Indian numbering — lakh and crore), a confidentiality
paragraph, and the signature block with the company seal struck across it.

### Award period

The award covers **01 April 2025 to 30 June 2026**, and every letter names that
full period. Anyone who joined partway through has the clause rewritten to start from their
joining date:

> **from your Date of Joining - 19 January 2026** to 30 June 2026

`PERIOD` at the top of the script holds the two dates.

`PERIOD_WORDING` selects how that clause is phrased for a mid-period joiner:

| Value | Mid-period joiner reads |
| --- | --- |
| `"fromDoj"` (default) | from your Date of Joining - 19 January 2026 to 30 June 2026 |
| `"bracket"` | during the period 01 April 2025 (Date of Joining - 19 January 2026) to 30 June 2026 |

Anyone employed for the whole window reads the same either way. Flip the constant
and rebuild to switch; `awardPeriodPhrase()` returns the finished clause.

A joining date *after* the period ends is treated as a full-period employee. On
the current roster that is **140 people**, who were not employed during the window
at all — a letter for any of them deserves a second look whatever it says.

### Word template

*Download Word Template (.docx)* produces an editable letter with the letterhead,
signature and seal already placed and every detail left as a marked placeholder
(`[Employee Name]`, `[Variable Pay Awarded]`, and so on). Page size and margins
are driven off the same constants as the PDF, so a typed letter lines up with a
generated one. Word substitutes another face if Poppins is not installed on the
machine; the PDF is unaffected, because it embeds the font.

### The amount callout

The amount callout carries three figures side by side: the total the employee was
eligible for, what has been awarded, and the award as a percentage of the two, all
three set at one size. The payout reads as the focal point through the accent
colour on the percentage rather than through a larger number.

Payouts above 100% are legitimate under most schemes, so they are shown as-is
rather than capped. The percentage is trimmed to at most two decimals with
trailing zeros dropped, so a full payout reads `100%`, not `100.00%`.

Any employee field that is blank in the database is dropped from the block rather
than printed as an empty row.

# Increment Letter Generator

Open **`dist/Increment_Letter_Generator.html`**. It records a salary revision: the
current package set against the revised one, the increase between them, the date it
takes effect, and — when a revised designation is given — the promotion alongside
it.

The callout is a comparison table:

|  | FIXED CTC | VARIABLE PAY | TOTAL CTC |
| --- | --- | --- | --- |
| **CURRENT** | INR 12,00,000 | INR 2,00,000 | INR 14,00,000 |
| **REVISED** | INR 15,00,000 | INR 3,00,000 | INR 18,00,000 |
| **TOTAL INCREMENT** | | | **28.57%** |

**Variable pay is optional on both sides.** Left blank — or entered as zero — that
side reads as a dash. The column stays either way: dropping it would leave two
letters with different tables, and an `INR 0` states a component that does not
exist.

|  | FIXED CTC | VARIABLE PAY | TOTAL CTC |
| --- | --- | --- | --- |
| **CURRENT** | INR 14,00,000 | — | INR 14,00,000 |
| **REVISED** | INR 18,00,000 | — | INR 18,00,000 |
| **TOTAL INCREMENT** | | | **28.57%** |

Filled on one side only, the dash sits on the other, which is the point: it shows a
variable component being introduced or withdrawn.

**It is a ruled table, not a tinted callout.** This is reference matter someone
will be asked to check against a payslip, so it is set as a table: a tinted header
row, a ruled grid, and figures **right-aligned in their columns**, which is what
makes them comparable down a column and is how money is set in any ledger. The last
row merges its first three cells the way a totals row does, which is also what gives
`TOTAL INCREMENT` the width it needs. Headings are bold and centred in their cells:
a heading names its column, while the figures under it are what have to line up
with each other.

The rules carry two weights, as a ruled table does: a heavy frame, with the header
and totals rules at that same weight, and a lighter grid inside dividing the cells.
One weight throughout reads as a wireframe rather than a table. The current row is
set a shade back from the revised row so the two are told apart by tone as well as
position — a shade, not a fade: a row of the table is not secondary matter.

Four columns is what this page width holds at one figure size; it is the labels,
not the figures, that run out of room. So the increase is a row beneath the totals
it comes from rather than a fifth column, and the effective date sits at the end of
the line under the table. The paragraph above the table states that date too. That
line is kept short enough to hold one line at every amount the roster can produce,
crore-scale packages included — a second line there is height spent before the
paragraphs get any.

**Each total is derived, not entered:** fixed plus variable, on each side, so a
total and its parts can never disagree on the letter. The increment percentage is
derived in turn, from the two totals. Amounts are always typed or pasted — the
master workbook holds no salary data, all 52 columns checked.

**Increases only.** A revised total equal to the current one means there is nothing
to state, and one below it is a reduction — a different letter with different
weight. Both are rejected with a readable message rather than issued under a
heading that says *Congratulations*.

Beneath the table, the amount in words, then *All other terms and conditions of
your employment remain unchanged*, and a confidentiality paragraph firmer than the
award letter's: disclosure is named as a breach of policy that will attract action.

Two modes, laid out like the variable pay app:

- **Individual** — Employee ID, Current Fixed CTC, Current Variable Pay (optional),
  Revised Fixed CTC, Revised Variable Pay (optional), Effective Date, Revised
  Designation (leave blank for an increment with no promotion), and the letter
  date. Preview and Download.
- **Bulk** — one letter date for the batch, then a seven-column paste of
  Employee ID / Current Fixed / Current Variable / Revised Fixed / Revised Variable
  / Effective From / Revised Designation. Per-row Preview and Download, and
  **Download all Increment Letters (Zip)**.

The effective date is per employee and separate from the date on the letter, so the
grid takes free text: `15/07/2026`, `2026-07-15` and `15 Jul 2026` all resolve to
the same day. Dates are read **day-first** — `03/04/2026` is 3 April — and an
impossible one such as `31/02/2026` is rejected rather than rolled forward.

Files are `Increment_Letter_<EmployeeID>.pdf` and the batch
`Increment_Letters_<date>.zip`, distinct from every variable pay filename, so the
three letter types cannot overwrite one another for the same employee.

The promotion is recorded in a sentence rather than a table column: the longest
designation on file is 59 characters, which would not fit a column and would push
the heading to three lines of 13pt bold. The sentence is written as a replacement —
the designation on record is named, then superseded by the new one **in bold** —
so it reads as the promotion it is rather than as a note appended to a pay
revision:

> We are also delighted to confirm your promotion. Your designation stands revised
> from Vice President to **Senior Vice President** with effect from the same date.

A revised designation identical to the one already on record is rejected: the
sentence would name the same title twice, and there is no promotion to state.
Leaving it blank is how an increment with no promotion is issued.

The table costs the page height that a single-figure callout did not, and naming
two long titles in one sentence costs more, so the letter lays itself out again
whenever a pass would run past the safe area, down a ladder of five settings from
4.6mm paragraph gaps to 2.2mm. The table tightens with the prose rather than
keeping a roomy callout above squeezed paragraphs. The floor is 2.2mm because
below that the paragraphs run together and the letter looks worse than it reads;
the worst case on file — a bifurcated increment promoting between the two longest
designations — needs exactly that step and clears the safe line on it. Only the
letters that need it pay for the extra passes.

# Repository and rebuilding

## Repository layout

```
assets/     Letterhead, signature, seal and logo (see "Assets" below)
data/       employees.json — the seven fields the letters need, nothing more
src/        core.js — the shared runtime inlined into both applications
            index.html — the variable pay app
            increment.html — the increment app
tools/      The extraction and build scripts
vendor/     jsPDF, PDF.js, JSZip and Poppins, all vendored for offline use
dist/       The two built single-file applications. These are the deliverables.
```

Neither source HTML runs on its own; each carries `"__EMPLOYEES__"`-style
placeholders that the build fills in, `/*__CORE__*/` among them. Edit `src/`, run
the build, ship `dist/`.

`core.js` holds everything both letters need — page geometry, the letterhead and
safe-area constants, `startLetter`, `drawDateAndDetails`, `drawSalutation`,
`drawConfidentiality`, `drawSignOff`, `formatINR`, `amountInWords`, `parseAmount`,
`parseDateInput`, `findEmployee`, and the `createPreviewPane` / `createBulkPanel`
UI factories. What is specific to one letter stays in its own file. Anything that
changes how a letter sits on the page belongs in `core.js`, so that a change to the
signature placement or the safe area reaches both applications in one build.

## Rebuilding

Requires Python 3 with `openpyxl`, `pillow` and `pypdf`.

```sh
pip install openpyxl pillow pypdf
python tools/build.py
```

`tools/build.py` inlines `src/core.js`, the employee data, the fonts, the
letterhead, the signature, the seal, the logo, jsPDF, PDF.js and JSZip into **both**
applications in one run. It also measures the signature and seal and injects their
proportions, so regenerating those assets at a different size cannot leave a stale
aspect ratio behind in the source.

Adding a third generator means adding one line to the `APPS` list at the top of
`build.py`.

### Refreshing the employee database

```sh
python tools/extract_employees.py path/to/Master_Database.xlsx
python tools/build.py
```

`extract_employees.py` finds the employee sheet by name (`Active EM`, or the older
`Active Employees List`), falling back to whichever sheet carries an `Emp Code`
header — the sheet has been renamed once already. It writes
`data/employees.json` with **only** `code`, `name`, `designation`, `doj`,
`department`, `subDepartment` and `location`.

This is deliberate. The master workbook also holds PAN numbers, Aadhaar numbers,
bank account numbers, home addresses, email addresses and phone numbers.
None of that is needed to print a letter, so none of it is copied out of the
workbook and none of it is committed here. Keep the workbook itself out of this
repository.

### Changing the period, signatory or wording

The signatory is shared, near the top of `src/core.js`:

```js
const SIGNATORY = { name: "Priyanka Singh", title: "Vice President – Human Resources" };
```

The award period is specific to the variable pay letters, near the top of the
script block in `src/index.html`:

```js
const PERIOD = { start: "2025-04-01", end: "2026-06-30" };
```

Body text lives with its letter: `buildLetter()` and `buildRevisionLetter()` in
`src/index.html`, `buildIncrementLetter()` in `src/increment.html`. Re-run
`python tools/build.py` after editing.

## Assets

Euler supplied two PDFs, both kept here: `Euler_Motors_Letterhead_source.pdf`
(page 1 the blank letterhead, page 2 the signature) and
`Euler_Motors_Stamp_source.pdf` (the company seal). Everything else in `assets/`
is derived from them, and can be regenerated:

```sh
python tools/extract_from_pdf.py assets/Euler_Motors_Letterhead_source.pdf
python tools/extract_stamp.py assets/Euler_Motors_Stamp_source.pdf
python tools/make_a4_letterhead.py
python tools/extract_logo.py
python tools/build.py
```

| File | Produced by | Notes |
| --- | --- | --- |
| `letterhead.jpg` | `extract_from_pdf.py` | The artwork as supplied, 1240 x 1604 |
| `signature.png` | `extract_from_pdf.py` | Cropped to the ink, transparent background |
| `stamp.png` | `extract_stamp.py` | The seal in its own ink colour, transparent |
| `letterhead_a4.jpg` | `make_a4_letterhead.py` | Rebuilt at A4 proportions, used in the letter |
| `logo.png` | `extract_logo.py` | Cut from the header band, used in the app header |

The seal's ink colour is not sampled or guessed. Its PDF stores a 1x1 pixel
holding just that colour with the artwork in a soft mask, so `extract_stamp.py`
reads `#212B7D` straight out of that pixel and uses the mask as the alpha channel.

The signature and the seal are each a single flat colour whose only real content
is the alpha channel, so both are stored as indexed PNGs whose palette is that one
colour at 64 opacities. That is a third to a fifth of the size of the equivalent
RGBA files, which matters because a copy of each is embedded in every letter a
bulk run produces.

### Why the letterhead is rebuilt

The supplied artwork is Letter-shaped (ratio 0.773), and its source PDF centres it
on an A4 page, which leaves a white band above and below the blue border. Scaling
it to fill A4 would stretch it 9% vertically and visibly distort the logo.

`make_a4_letterhead.py` instead grows only the middle of the image. Between the
header band and the footer band every row is identical — flat blue border, white
panel, flat blue border — so that section can be stretched to any height without
touching a pixel of the logo or the footer block. The result is full bleed on A4
with the blue running to all four edges and no distortion anywhere.

If you replace the letterhead, re-run the script: it prints the panel geometry in
millimetres, which is what `SAFE`, `MARGIN` and `ART` in `src/core.js` are set
from, for both applications at once. It refuses to run if the middle of the new artwork is not uniform.

## Implementation notes

- **The letter is drawn, not converted.** `buildLetter()` composes the page
  directly with jsPDF, so the text is real vector text — selectable, searchable
  and sharp at any zoom — over the letterhead image.
- **The preview is rendered with PDF.js**, not handed to the browser's built-in
  PDF viewer in an `<iframe>`. That viewer ignores the `#view=Fit` / `#zoom=`
  fragment hints often enough to open the letter at an arbitrary zoom scrolled
  away from the page, and pairing those hints with `toolbar=0` or `navpanes=0`
  breaks them outright. Rendering to a canvas is predictable and matches the
  downloaded file exactly, because it *is* the downloaded file.
- **PDF.js runs without a Worker.** `pdf.worker.min.js` is inlined ahead of
  `pdf.min.js`, which registers `window.pdfjsWorker` and lets PDF.js parse on the
  main thread. Browsers refuse to spawn a Worker from a `file://` page, and this
  app is meant to be opened by double-clicking.
- **Poppins is embedded** as a subset TTF so the letter matches the letterhead's
  own typeface without depending on the machine having the font installed.
- Editing any input clears an on-screen preview, so a stale letter is never left
  showing figures the inputs no longer agree with.
- **The bulk table takes a real spreadsheet paste.** Excel and Sheets put
  tab-separated rows on the clipboard as `text/plain`, which would otherwise land
  entirely in one cell, so the paste is intercepted and spread across the grid.
- The signature and the seal are placed from one shared baseline in `drawSignOff()`,
  so they stay in line with each other whatever the body above did. The signature
  sits flush to the text margin, and the seal is positioned off the signature's own
  box rather than the page margin, landing across the last quarter of it the way a
  seal falls on a document that is signed and then stamped. It is drawn last so the
  ink sits over the signature, and it is a ring with an open centre, so the strokes
  it crosses stay legible. `STAMP_WIDTH` and `STAMP_OVERLAP` control the size and
  how far along the signature it starts.

## Third-party components

| Component | Version | Licence |
| --- | --- | --- |
| [jsPDF](https://github.com/parallax/jsPDF) | 3.0.1 | MIT (`vendor/jspdf-LICENSE.txt`) |
| [PDF.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Apache-2.0 (`vendor/pdfjs-LICENSE.txt`) |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | MIT (`vendor/jszip-LICENSE.txt`) |
| [Poppins](https://fonts.google.com/specimen/Poppins) | 5.2.5 subset | SIL OFL 1.1 (`vendor/fonts/Poppins-OFL.txt`) |
