# Euler Variable Pay Letter Generator

Generates a variable pay letter on the Euler Motors letterhead from two inputs:
an Employee ID and a variable pay amount. Everything else — name, designation,
date of joining, department, sub-department and location — is looked up from the
HR master database, and the letter is signed with Priyanka Singh's signature.

## Using it

Open **`dist/Variable_Pay_Letter_Generator.html`** in a browser. That is the whole
application: one file, no install, no server, no network. Double-clicking it works.

1. Enter the Employee ID (`EUR1796`; `eur1796` and a bare `1796` also resolve).
2. Enter the total variable pay in rupees (`250000`, or `2,50,000`).
3. The employee's details appear as soon as the ID matches. An ID that is not in
   the database shows an error and both buttons stay disabled.
4. **Preview Letter** renders the finished letter on screen.
5. **Download Letter PDF** saves it as `Variable_Pay_Letter_<EmployeeID>.pdf`.

Nothing is uploaded anywhere. The database, the fonts and the PDF engine are all
embedded in the file, and the letter is built in the browser.

## What the letter contains

A4, one page, on the supplied letterhead: the date, a block of the seven employee
fields, a subject line, a congratulatory message for **FY 2025-26**, the amount in
figures and in words (Indian numbering — lakh and crore), a confidentiality
paragraph, and the signature block.

Any employee field that is blank in the database is dropped from the block rather
than printed as an empty row.

## Repository layout

```
assets/     Letterhead, signature and logo (see "Assets" below)
data/       employees.json — the seven fields the letter needs, nothing more
src/        index.html — the application source, with placeholders for assets
tools/      The extraction and build scripts
vendor/     jsPDF, PDF.js and Poppins, all vendored for offline use
dist/       The built single-file application. This is the deliverable.
```

`src/index.html` does not run on its own; it carries `"__EMPLOYEES__"`-style
placeholders that the build fills in. Edit `src/`, run the build, ship `dist/`.

## Rebuilding

Requires Python 3 with `openpyxl`, `pillow` and `pypdf`.

```sh
pip install openpyxl pillow pypdf
python tools/build.py
```

`tools/build.py` inlines the employee data, the fonts, the letterhead, the
signature, the logo, jsPDF and PDF.js into `dist/Variable_Pay_Letter_Generator.html`.

### Refreshing the employee database

```sh
python tools/extract_employees.py path/to/Master_Database.xlsx
python tools/build.py
```

`extract_employees.py` reads the `Active Employees List` sheet and writes
`data/employees.json` with **only** `code`, `name`, `designation`, `doj`,
`department`, `subDepartment` and `location`.

This is deliberate. The master workbook also holds PAN numbers, Aadhaar numbers,
bank account numbers, home addresses, personal email addresses and phone numbers.
None of that is needed to print a letter, so none of it is copied out of the
workbook and none of it is committed here. Keep the workbook itself out of this
repository.

### Changing the financial year, signatory or wording

All in `src/index.html`, near the top of the script block:

```js
const SIGNATORY = { name: "Priyanka Singh", title: "Vice President – Human Resources" };
const FINANCIAL_YEAR = "2025-26";
```

The body text is in `buildLetter()`. Re-run `python tools/build.py` after editing.

## Assets

`assets/Euler_Motors_Letterhead_source.pdf` is the file Euler supplied: page 1 is
the blank letterhead, page 2 is the signature. Everything else in `assets/` is
derived from it, and can be regenerated:

```sh
python tools/extract_from_pdf.py assets/Euler_Motors_Letterhead_source.pdf
python tools/make_a4_letterhead.py
python tools/extract_logo.py
python tools/build.py
```

| File | Produced by | Notes |
| --- | --- | --- |
| `letterhead.jpg` | `extract_from_pdf.py` | The artwork as supplied, 1240 x 1604 |
| `signature.png` | `extract_from_pdf.py` | Cropped to the ink, transparent background |
| `letterhead_a4.jpg` | `make_a4_letterhead.py` | Rebuilt at A4 proportions, used in the letter |
| `logo.png` | `extract_logo.py` | Cut from the header band, used in the app header |

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
millimetres, which is what `SAFE`, `MARGIN` and `ART` in `src/index.html` are set
from. It refuses to run if the middle of the new artwork is not uniform.

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
- Editing either input clears an on-screen preview, so a stale letter is never
  left showing figures the inputs no longer agree with.

## Third-party components

| Component | Version | Licence |
| --- | --- | --- |
| [jsPDF](https://github.com/parallax/jsPDF) | 3.0.1 | MIT (`vendor/jspdf-LICENSE.txt`) |
| [PDF.js](https://mozilla.github.io/pdf.js/) | 3.11.174 | Apache-2.0 (`vendor/pdfjs-LICENSE.txt`) |
| [Poppins](https://fonts.google.com/specimen/Poppins) | 5.2.5 subset | SIL OFL 1.1 (`vendor/fonts/Poppins-OFL.txt`) |
