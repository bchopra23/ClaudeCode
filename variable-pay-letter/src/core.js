/* ------------------------------------------------------------------ *
 * Shared runtime for the Euler letter generators.                     *
 *                                                                     *
 * Inlined into every app by tools/build.py, so the letterhead geometry,*
 * the signature and seal placement, the employee lookup and the bulk   *
 * grid exist once rather than being copied per generator and drifting. *
 *                                                                     *
 * Anything specific to one letter — its wording, its callout, its UI — *
 * stays in that app's own source.                                     *
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Embedded assets. build.py replaces each placeholder with real data. *
 * ------------------------------------------------------------------ */
const EMPLOYEES = "__EMPLOYEES__";
const FONTS = "__FONTS__";
const LETTERHEAD = "__LETTERHEAD__";
const SIGNATURE = "__SIGNATURE__";
const STAMP = "__STAMP__";
/* height / width of the two overlay assets, measured at build time. */
const ASSET_ASPECTS = "__ASSET_ASPECTS__";

const SIGNATORY = { name: "Priyanka Singh", title: "Vice President – Human Resources" };
const COMPANY = "Euler Motors Pvt. Ltd.";
const COMPANY_SHORT = "Euler Motors";
/* The window this award covers. Stated on the letter in place of a financial
 * year, because the period is 15 months and does not line up with one. */
/* ------------------------------------------------------------------ *
 * Page geometry, in millimetres on A4.                                *
 *                                                                     *
 * The artwork is assets/letterhead_a4.jpg, rebuilt to A4 proportions by *
 * tools/make_a4_letterhead.py, and is laid down full bleed so the blue  *
 * border runs to all four page edges.                                   *
 * ------------------------------------------------------------------ */
const PT = 25.4 / 72;
const ART = { x: 0, y: 0, w: 210, h: 297 };

/* Reported by tools/make_a4_letterhead.py for the artwork above. The white
 * panel spans x 9.82-199.16mm. The blue header band cuts into it from the right
 * down to y 26.58mm, and the blue footer band cuts in from the left above
 * y 270.42mm, so text must stay between those two to clear both notches. */
const SAFE = { top: 26.58, bottom: 270.42 };
const CONTENT_TOP = 44;
const MARGIN = { left: 24, right: 185 };

/* The seal, sized and placed to cross the tail of the signature. STAMP_OVERLAP is
 * how far along the signature it starts, as a fraction of the signature's width:
 * 0.72 clips the last quarter or so, enough to read as one act of signing and
 * stamping without burying the name under it. The width is what lets the ring
 * clear the title line beneath. */
const STAMP_WIDTH = 34;
const STAMP_OVERLAP = 0.72;
const COLUMN = MARGIN.right - MARGIN.left;
const LABEL_WIDTH = 38;

/* Point size of the three figures in the amount callout. Columns sit 58mm apart,
 * and the widest realistic value is about 38mm at this size, so they cannot
 * collide. */
const FIGURE_SIZE = 13;

const COLORS = {
  ink: [22, 32, 42],
  muted: [90, 116, 136],
  rule: [214, 226, 235],
  boxFill: [242, 250, 254],
  accent: [149, 210, 241],
};

/* ------------------------------------------------------------------ *
 * Formatting helpers                                                  *
 * ------------------------------------------------------------------ */

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/** "2018-07-01" -> "01 July 2018". Returns "" for anything unparseable. */
function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${match[3]} ${month} ${match[1]}` : "";
}

const MONTH_PREFIXES = MONTHS.map((month) => month.slice(0, 3).toLowerCase());

function isRealDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(year, month, 0).getDate();
}

function toISO(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Parses a date typed or pasted into the bulk table, returning ISO or null.
 *
 * Day-first throughout, as written in India: 03/04/2026 is 3 April, never
 * 4 March. Two-digit years are read as 20xx.
 */
function parseDateInput(text) {
  const value = String(text || "").trim();
  if (!value) return null;

  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if (match) {
    const [, year, month, day] = match.map(Number);
    return isRealDate(year, month, day) ? toISO(year, month, day) : null;
  }

  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(value);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    return isRealDate(year, month, day) ? toISO(year, month, day) : null;
  }

  // "3 Apr 2026", "03-April-2026", "3 April 26"
  match = /^(\d{1,2})[\s-]+([A-Za-z]+)[\s-]+(\d{2}|\d{4})$/.exec(value);
  if (match) {
    const day = Number(match[1]);
    const month = MONTH_PREFIXES.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    if (month && isRealDate(year, month, day)) return toISO(year, month, day);
  }

  return null;
}

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Indian digit grouping: 2500000 -> "25,00,000". */
function formatINR(value) {
  const [whole, fraction] = value.toFixed(2).split(".");
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest
    ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3
    : last3;
  return fraction === "00" ? grouped : `${grouped}.${fraction}`;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
  "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
  "Eighty", "Ninety"];

function underHundred(n) {
  if (n < 20) return ONES[n];
  const tens = TENS[Math.floor(n / 10)];
  return n % 10 ? `${tens} ${ONES[n % 10]}` : tens;
}

/** Indian numbering: crore / lakh / thousand / hundred. */
function wordsForInteger(n) {
  if (n === 0) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  const hundred = Math.floor(n / 100); n %= 100;

  // Recurse on crores so values above 99 crore still read correctly.
  if (crore) parts.push(`${wordsForInteger(crore)} Crore`);
  if (lakh) parts.push(`${underHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${underHundred(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (n) parts.push(`${parts.length ? "and " : ""}${underHundred(n)}`);
  return parts.join(" ");
}

/**
 * "Rupees Two Lakh Fifty Thousand Only", with paise when present.
 * Paise are written as "and Paise Fifty" rather than "and Fifty Paise" so the
 * figure cannot be misread as part of the rupee amount that precedes it.
 */
function amountInWords(value) {
  const rupees = Math.floor(value + 1e-9);
  const paise = Math.round((value - rupees) * 100);
  let text = `Rupees ${wordsForInteger(rupees)}`;
  if (paise) text += ` and Paise ${underHundred(paise)}`;
  return `${text} Only`;
}

const MAX_AMOUNT = 1e9; // A billion rupees; anything larger is a typo, not a bonus.

/**
 * Reads a rupee figure written any of the ways a spreadsheet might hold it.
 * Returns { value } or { error }.
 */
function parseAmount(text, label = "Variable pay", { allowZero = false } = {}) {
  const raw = String(text || "").trim()
    .replace(/^(?:INR|RS\.?|₹)\s*/i, "")
    .replace(/[,\s]/g, "");
  if (!raw) return { error: `${label} is missing.` };
  if (!/^\d*\.?\d+$/.test(raw)) return { error: `${label} must be a number.` };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { error: `${label} must be a number.` };
  if (allowZero ? value < 0 : value <= 0) {
    return { error: `${label} must be ${allowZero ? "zero or more" : "greater than zero"}.` };
  }
  if (value > MAX_AMOUNT) return { error: `${label} looks too large.` };
  return { value: Math.round(value * 100) / 100 };
}

/**
 * The payout as a percentage of what the employee was eligible for.
 *
 * Trimmed to at most two decimals with trailing zeros dropped, so a full payout
 * reads "100%" rather than "100.00%" and two thirds reads "66.67%". Payouts above
 * the eligible amount are legitimate under most schemes and are not capped.
 */
function formatPercent(awarded, eligible) {
  if (!eligible) return "";
  return `${Number(((awarded / eligible) * 100).toFixed(2))}%`;
}

/* ------------------------------------------------------------------ *
 * Employee lookup                                                     *
 * ------------------------------------------------------------------ */

const BY_CODE = new Map(EMPLOYEES.map((employee) => [employee.code, employee]));

/**
 * Accepts "EUR1796", "eur1796", " EUR1796 " and bare "1796", so a number read
 * off a spreadsheet still resolves without the user retyping the prefix.
 */
function findEmployee(input) {
  const cleaned = String(input || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) return null;
  if (BY_CODE.has(cleaned)) return BY_CODE.get(cleaned);
  if (/^\d+$/.test(cleaned)) {
    return BY_CODE.get("EUR" + cleaned.padStart(4, "0")) || null;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * PDF generation                                                      *
 * ------------------------------------------------------------------ */

const { jsPDF } = window.jspdf;

function newDocument() {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.addFileToVFS("Poppins-Regular.ttf", FONTS.normal);
  doc.addFont("Poppins-Regular.ttf", "Poppins", "normal");
  doc.addFileToVFS("Poppins-SemiBold.ttf", FONTS.semibold);
  doc.addFont("Poppins-SemiBold.ttf", "Poppins", "semibold");
  doc.addFileToVFS("Poppins-Bold.ttf", FONTS.bold);
  doc.addFont("Poppins-Bold.ttf", "Poppins", "bold");
  return doc;
}

/** Millimetre leading for a given point size. */
function leading(points, factor = 1.42) {
  return points * factor * PT;
}

/* ------------------------------------------------------------------ *
 * Letter assembly                                                     *
 *                                                                     *
 * Two letters are produced: the award letter, and the revision letter  *
 * issued when an award is re-decided upward after it has gone out.     *
 * They share everything but the subject, the opening paragraph and the *
 * callout, so the common parts live in the helpers below rather than   *
 * being written twice and drifting apart.                              *
 * ------------------------------------------------------------------ */

/** A new page with the letterhead laid down. */
function startLetter() {
  const doc = newDocument();
  doc.addImage(LETTERHEAD, "JPEG", ART.x, ART.y, ART.w, ART.h, undefined, "FAST");
  return doc;
}

/** Applies a font, size and colour in one call. */
function useFont(doc, style, points, color = COLORS.ink) {
  doc.setFont("Poppins", style);
  doc.setFontSize(points);
  doc.setTextColor(color[0], color[1], color[2]);
}

/** Wraps and writes a body paragraph. Returns the cursor below it. */
function drawParagraph(doc, y, text, gapAfter = 4.6) {
  useFont(doc, "normal", 10);
  const step = leading(10);
  for (const line of doc.splitTextToSize(text, COLUMN)) {
    doc.text(line, MARGIN.left, y);
    y += step;
  }
  return y + gapAfter;
}

/** The date, the seven employee fields, and the rule beneath them. */
function drawDateAndDetails(doc, y, employee, dateISO) {
  useFont(doc, "normal", 9.5, COLORS.muted);
  doc.text(`Date: ${formatDate(dateISO)}`, MARGIN.left, y);
  y += 8;

  const rows = [
    ["Employee ID", employee.code],
    ["Name", employee.name],
    ["Designation", employee.designation],
    ["Department", employee.department],
    ["Sub-department", employee.subDepartment],
    ["Date of Joining", formatDate(employee.doj)],
    ["Location", employee.location],
  ].filter(([, value]) => value);

  const rowStep = leading(9.5, 1.42);
  for (const [label, value] of rows) {
    useFont(doc, "normal", 9.5, COLORS.muted);
    doc.text(label, MARGIN.left, y);
    doc.text(":", MARGIN.left + LABEL_WIDTH - 3, y);
    useFont(doc, "semibold", 9.5);
    // Wrap rather than overrun: the longest designation on file fits on one
    // line, but a longer one added later must not collide with the next row.
    for (const line of doc.splitTextToSize(value, COLUMN - LABEL_WIDTH)) {
      doc.text(line, MARGIN.left + LABEL_WIDTH, y);
      y += rowStep;
    }
  }

  y += 1.5;
  doc.setDrawColor(COLORS.rule[0], COLORS.rule[1], COLORS.rule[2]);
  doc.setLineWidth(0.3);
  doc.line(MARGIN.left, y, MARGIN.right, y);
  return y + 7.5;
}

/** Salutation, subject line and the blue heading. */
function drawSalutation(doc, y, employee, subject, heading) {
  useFont(doc, "normal", 10.5);
  doc.text(`Dear ${employee.name},`, MARGIN.left, y);
  y += 8;

  useFont(doc, "semibold", 10.5);
  doc.text(`Subject: ${subject}`, MARGIN.left, y);
  y += 9;

  useFont(doc, "bold", 13, [43, 127, 174]);
  doc.text(heading, MARGIN.left, y);
  return y + 7.5;
}

/** The confidentiality paragraph both letters close with. */
function drawConfidentiality(doc, y) {
  return drawParagraph(doc, y,
    "This letter and its contents are strictly confidential and are intended solely "
    + "for you. You are requested not to disclose the same to any other person.");
}

/**
 * Closing, signature and company seal.
 *
 * The seal sits at the right of the same band as the signature, centred on it,
 * which is where it goes on a hand-signed letter and which uses up the empty
 * right-hand half of the sign-off. Both are placed from one shared baseline so
 * they stay in line regardless of how the body above happened to wrap.
 */
function drawSignOff(doc, y) {
  doc.setFont("Poppins", "normal");
  doc.setFontSize(10);
  doc.setTextColor(COLORS.ink[0], COLORS.ink[1], COLORS.ink[2]);
  doc.text("Warm regards,", MARGIN.left, y);
  y += leading(10);

  doc.setFont("Poppins", "semibold");
  doc.text(`For ${COMPANY}`, MARGIN.left, y);

  const blockTop = y + 4;
  const signatureWidth = 40;
  const signatureHeight = signatureWidth * ASSET_ASPECTS.signature;

  // Flush with the text column: the asset is cropped tight to the ink, so any
  // offset here shows up as the signature hanging off the margin.
  doc.addImage(SIGNATURE, "PNG", MARGIN.left, blockTop, signatureWidth, signatureHeight);

  // 5.5mm clears the signature's descenders; at 3.5 the ink touched the name.
  const nameY = blockTop + signatureHeight + 5.5;
  doc.setFont("Poppins", "semibold");
  doc.setFontSize(10);
  doc.text(SIGNATORY.name, MARGIN.left, nameY);

  const titleY = nameY + leading(9.5);
  doc.setFont("Poppins", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
  doc.text(SIGNATORY.title, MARGIN.left, titleY);

  // Land the seal across the tail of the signature, the way it falls on a
  // document that is signed and then stamped. It is drawn last so the ink sits
  // over the signature, and it is a ring with an open centre, so the strokes it
  // crosses stay legible. Placed off the signature's own box rather than the
  // page margin, so the two stay related however the block moves.
  const blockBottom = titleY + 2;
  const stampWidth = STAMP_WIDTH;
  const stampHeight = stampWidth * ASSET_ASPECTS.stamp;
  const stampX = MARGIN.left + signatureWidth * STAMP_OVERLAP;
  const stampY = blockTop + signatureHeight / 2 - stampHeight / 2;
  doc.addImage(STAMP, "PNG", stampX, stampY, stampWidth, stampHeight);

  const lowest = Math.max(blockBottom, stampY + stampHeight);
  if (lowest > SAFE.bottom) {
    console.warn(`Letter content ends at ${lowest.toFixed(1)}mm, past the safe area at ${SAFE.bottom}mm.`);
  }
}

/* ------------------------------------------------------------------ *
 * Shared UI helpers                                                   *
 * ------------------------------------------------------------------ */

const el = (id) => document.getElementById(id);

function setError(node, input, message) {
  node.textContent = message || "";
  node.classList.toggle("show", Boolean(message));
  if (input) input.classList.toggle("invalid", Boolean(message));
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * A pane that renders a generated letter onto a canvas, scaled to fit its box.
 *
 * Letters are drawn with PDF.js rather than handed to the browser's own PDF
 * viewer in an iframe: that viewer ignores the view/zoom fragment hints often
 * enough to open the letter at some arbitrary zoom, scrolled away from the page.
 *
 * Both modes get their own pane, so previewing a bulk row does not disturb the
 * letter already on screen in Individual.
 */
function createPreviewPane(viewerId, canvasId, emptyId, filenameId) {
  const box = el(viewerId);
  const canvas = el(canvasId);
  const empty = el(emptyId);
  const filename = el(filenameId);
  let bytes = null;
  let token = 0;

  async function paint() {
    if (!bytes) return;
    const mine = ++token;

    // getDocument takes ownership of the buffer it is given, so pass a copy and
    // keep ours intact for later repaints.
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    const page = await pdf.getPage(1);

    const unscaled = page.getViewport({ scale: 1 });
    const rect = box.getBoundingClientRect();
    const fit = Math.min(rect.width / unscaled.width, rect.height / unscaled.height);
    // Render at device resolution so the letter stays sharp on HiDPI screens.
    const ratio = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: fit * ratio });

    if (mine !== token) return; // superseded while awaiting
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = `${Math.round(unscaled.width * fit)}px`;
    canvas.style.height = `${Math.round(unscaled.height * fit)}px`;

    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  }

  return {
    get hasContent() { return bytes !== null; },

    clear() {
      bytes = null;
      token += 1; // abandon any render still in flight
      canvas.hidden = true;
      empty.hidden = false;
      filename.textContent = "";
    },

    /** @returns true if the letter was rendered. */
    show(doc, name, onError) {
      bytes = doc.output("arraybuffer");
      empty.hidden = true;
      canvas.hidden = false;
      filename.textContent = name;
      paint().catch((error) => {
        console.error(error);
        this.clear();
        if (onError) onError();
      });
      return true;
    },

    repaint() {
      if (bytes) paint().catch(console.error);
    },
  };
}

/* ------------------------------------------------------------------ *
 * Bulk panels                                                         *
 *                                                                     *
 * One factory drives both grids: the award run and the revision run.   *
 * They differ only in their columns, their validation and which letter *
 * they build, so everything else — spreadsheet paste, per-row preview, *
 * duplicate detection, the zip — is written once here.                 *
 * ------------------------------------------------------------------ */

const STARTING_ROWS = 12;
const HEADER_WORDS = ["employee", "emp id", "emp code", "variable", "eligible",
  "amount", "awarded", "revised", "previous", "date"];

/**
 * @param config.ids        element ids for grid, date, summary, zip button
 * @param config.pane       ids for the preview pane
 * @param config.columns    [{ decimal }] one per editable cell
 * @param config.validate   (cells, dateISO) -> { job } | { error }
 * @param config.describe   job -> status cell text
 * @param config.buildDoc   job -> jsPDF document
 * @param config.fileName   job -> pdf filename
 * @param config.zipName    dateISO -> zip filename
 * @param config.zipLabel   count -> button text
 */
function createBulkPanel(config) {
  const grid = el(config.ids.grid);
  const dateInput = el(config.ids.date);
  const summary = el(config.ids.summary);
  const zipButton = el(config.ids.zip);
  const pane = createPreviewPane(config.pane.viewer, config.pane.canvas,
    config.pane.empty, config.pane.filename);

  /* The row currently shown in the preview, and what it said at the time. A
   * preview that no longer matches its row would be quietly misleading, so it is
   * dropped as soon as the row's values change. */
  let previewedRow = null;
  let previewedSignature = "";
  let busy = false;

  function makeRow() {
    const cells = config.columns.map((column, index) =>
      `<td><input type="text" data-col="${index}" autocomplete="off"`
      + (column.decimal ? ' inputmode="decimal"' : ' spellcheck="false"')
      + "></td>").join("");

    const tr = document.createElement("tr");
    tr.innerHTML = '<td class="rownum"></td>' + cells
      + '<td class="status"></td>'
      + '<td class="peek">'
      +   '<button type="button" data-act="preview" disabled>Preview</button>'
      +   '<button type="button" data-act="download" disabled>Download</button>'
      + "</td>"
      + '<td class="drop"><button type="button" title="Remove row" aria-label="Remove row">&times;</button></td>';

    tr.querySelector(".drop button").addEventListener("click", () => {
      if (previewedRow === tr) clearPreview();
      tr.remove();
      ensureTrailingRow();
      refresh();
    });
    tr.querySelector('[data-act="preview"]').addEventListener("click", () => previewRow(tr));
    tr.querySelector('[data-act="download"]').addEventListener("click", () => downloadRow(tr));
    for (const input of tr.querySelectorAll("input")) {
      input.addEventListener("input", refresh);
      input.addEventListener("paste", onPaste);
    }
    return tr;
  }

  const addRows = (count) => {
    for (let i = 0; i < count; i += 1) grid.appendChild(makeRow());
  };
  const rowCells = (tr) => Array.from(tr.querySelectorAll("input"));
  const rowIsBlank = (tr) => rowCells(tr).every((input) => !input.value.trim());

  /** Always leave one empty row at the bottom to type into. */
  function ensureTrailingRow() {
    const rows = Array.from(grid.rows);
    if (!rows.length || !rowIsBlank(rows[rows.length - 1])) addRows(1);
  }

  /**
   * Distributes a spreadsheet paste across the grid.
   *
   * Excel and Sheets put tab-separated rows on the clipboard as text/plain, so a
   * multi-cell paste arrives in a single cell unless it is split out by hand.
   */
  function onPaste(event) {
    const text = (event.clipboardData || window.clipboardData).getData("text");
    if (!text || !/[\t\n\r]/.test(text)) return; // single value: let the browser handle it
    event.preventDefault();

    let lines = text.replace(/\r\n?/g, "\n").split("\n");
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) return;

    // Drop a pasted header row so "Employee ID" does not land in a cell.
    const first = lines[0].toLowerCase();
    if (HEADER_WORDS.some((word) => first.includes(word)) && !/\d/.test(first)) {
      lines.shift();
    }
    if (!lines.length) return;

    const startCol = Number(event.target.dataset.col);
    const startRow = Array.from(grid.rows).indexOf(event.target.closest("tr"));

    lines.forEach((line, rowOffset) => {
      const index = startRow + rowOffset;
      while (grid.rows.length <= index) addRows(1);
      const cells = rowCells(grid.rows[index]);
      line.split("\t").forEach((value, colOffset) => {
        const target = cells[startCol + colOffset];
        if (target) target.value = value.trim();
      });
    });

    ensureTrailingRow();
    refresh();
  }

  /**
   * Validates every non-blank row.
   * Returns the rows that would produce a letter, plus how many are in error.
   */
  function readRows() {
    const dateISO = dateInput.value;
    const jobs = [];
    const seen = new Map();
    let errors = 0;

    for (const tr of Array.from(grid.rows)) {
      const status = tr.querySelector(".status");
      tr.classList.remove("bad");
      status.className = "status";
      status.textContent = "";

      if (rowIsBlank(tr)) continue;

      const fail = (message) => {
        status.textContent = message;
        status.classList.add("bad");
        tr.classList.add("bad");
        errors += 1;
      };

      const cells = rowCells(tr).map((input) => input.value);
      const employee = findEmployee(cells[0]);
      if (!employee) {
        fail(cells[0].trim() ? `No employee with ID "${cells[0].trim()}".` : "Employee ID is missing.");
        continue;
      }
      if (!dateISO) {
        fail("Set the letter date above.");
        continue;
      }

      const result = config.validate(cells, dateISO);
      if (result.error) {
        fail(result.error);
        continue;
      }

      // Two letters for one employee would collide inside the zip.
      const previous = seen.get(employee.code);
      if (previous !== undefined) {
        fail(`${employee.code} is already on row ${previous}.`);
        continue;
      }
      seen.set(employee.code, Array.from(grid.rows).indexOf(tr) + 1);

      const job = Object.assign({ employee, dateISO, row: tr }, result.job);
      status.textContent = config.describe(job);
      status.classList.add("ok");
      jobs.push(job);
    }

    return { jobs, errors };
  }

  /** Identifies what a row would produce, so a stale preview can be spotted. */
  const signatureOf = (job) =>
    JSON.stringify([job.employee.code, job.dateISO, config.describe(job)]);

  function clearPreview() {
    if (previewedRow) previewedRow.classList.remove("previewing");
    previewedRow = null;
    previewedSignature = "";
    pane.clear();
  }

  function previewRow(tr) {
    const job = readRows().jobs.find((candidate) => candidate.row === tr);
    if (!job) return; // the row is not valid, so there is nothing to draw

    if (previewedRow) previewedRow.classList.remove("previewing");
    previewedRow = tr;
    previewedSignature = signatureOf(job);
    tr.classList.add("previewing");

    let doc;
    try {
      doc = config.buildDoc(job);
    } catch (error) {
      console.error(error);
      clearPreview();
      return;
    }
    pane.show(doc, config.fileName(job), clearPreview);
  }

  /** Saves just this row's letter, without touching the preview or the batch. */
  function downloadRow(tr) {
    const job = readRows().jobs.find((candidate) => candidate.row === tr);
    if (!job) return;
    try {
      config.buildDoc(job).save(config.fileName(job));
    } catch (error) {
      console.error(error);
      summary.innerHTML = '<span class="bad">Could not build that letter. See the browser console for details.</span>';
    }
  }

  function refresh() {
    Array.from(grid.rows).forEach((tr, index) => {
      tr.querySelector(".rownum").textContent = index + 1;
    });

    const { jobs, errors } = readRows();

    const byRow = new Map(jobs.map((job) => [job.row, job]));
    let previewStillValid = false;
    for (const tr of Array.from(grid.rows)) {
      const job = byRow.get(tr);
      for (const button of tr.querySelectorAll(".peek button")) button.disabled = !job;
      if (tr === previewedRow && job && signatureOf(job) === previewedSignature) {
        previewStillValid = true;
      }
    }
    if (previewedRow && !previewStillValid) clearPreview();

    if (!jobs.length && !errors) {
      summary.textContent = "Paste or type rows above to get started.";
    } else if (errors) {
      summary.innerHTML = `<strong>${jobs.length}</strong> ready · `
        + `<span class="bad"><strong>${errors}</strong> ${errors === 1 ? "row needs" : "rows need"} attention</span>`;
    } else {
      summary.innerHTML = `<strong>${jobs.length}</strong> ${jobs.length === 1 ? "letter" : "letters"} ready`;
    }

    // Refuse to build a partial batch: silently skipping a row in a payroll run is
    // worse than making someone fix the typo first.
    zipButton.disabled = busy || errors > 0 || jobs.length === 0;
    if (!busy) zipButton.textContent = config.zipLabel(errors ? 0 : jobs.length);
  }

  zipButton.addEventListener("click", async () => {
    const { jobs, errors } = readRows();
    if (errors || !jobs.length) return;

    busy = true;
    zipButton.disabled = true;

    try {
      const zip = new JSZip();
      for (let i = 0; i < jobs.length; i += 1) {
        zipButton.textContent = `Building ${i + 1} of ${jobs.length}…`;
        zip.file(config.fileName(jobs[i]), config.buildDoc(jobs[i]).output("arraybuffer"));
        // Hand the frame back so the label repaints instead of freezing the tab.
        if (i % 5 === 4) await new Promise((resolve) => setTimeout(resolve, 0));
      }

      zipButton.textContent = "Packaging zip…";
      // The PDFs are already deflated internally, so re-compressing them in the
      // zip costs time and saves almost nothing.
      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      saveBlob(blob, config.zipName(dateInput.value || todayISO()));
    } catch (error) {
      console.error(error);
      summary.innerHTML = '<span class="bad">Could not build the letters. See the browser console for details.</span>';
    } finally {
      busy = false;
      refresh();
    }
  });

  el(config.ids.addRows).addEventListener("click", () => { addRows(10); refresh(); });
  el(config.ids.clearRows).addEventListener("click", () => {
    clearPreview();
    grid.textContent = "";
    addRows(STARTING_ROWS);
    refresh();
  });
  dateInput.addEventListener("input", refresh);

  return {
    start() {
      dateInput.value = todayISO();
      addRows(STARTING_ROWS);
      refresh();
    },
    repaint: () => pane.repaint(),
  };
}
