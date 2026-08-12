/* Salary Revision Tracker — spreadsheet and CSV interchange.
 *
 * Import understands both shapes:
 *   · the original Salary_Revision_Tracker.xlsx (Employee Master + one sheet per
 *     FY, one row per employee per year), and
 *   · this tool's own export (Employee Master + a Revision Ledger with one row
 *     per revision), which is what makes an edit-in-Excel round-trip possible.
 *
 * Export writes a workbook that is meant to be *used* in Excel: real columns,
 * frozen headers, autofilters, Indian number formats, and a flat ledger sheet
 * that pivots without any cleaning up.
 */
(function (root, factory) {
  var isNode = typeof module !== 'undefined' && module.exports;
  var M = isNode ? require('./model.js') : root.SRT.model;
  var E = isNode ? require('./engine.js') : root.SRT.engine;
  var XLSXlib = isNode ? require('./vendor/xlsx.full.min.js') : root.XLSX;
  var api = factory(M, E, XLSXlib);
  if (isNode) module.exports = api;
  root.SRT = Object.assign(root.SRT || {}, { io: api });
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M, E, XLSX) {
  'use strict';

  /* Number formats. Indian digit grouping (##,##,###) is what payroll reports
   * use, so a lakh reads as 12,34,567 rather than 1,234,567. */
  var FMT_RUPEE = '[>=10000000]##\\,##\\,##\\,##0;[>=100000]##\\,##\\,##0;##,##0';
  var FMT_PCT = '0.00%';
  var FMT_DATE = 'dd-mmm-yyyy';

  /* ------------------------------------------------------------------ import */

  /* Header matching is forgiving: case, spacing, punctuation and the (₹) suffix
   * are all ignored, so a column renamed "Revised CTC" still lands. */
  function normKey(s) {
    return String(s == null ? '' : s)
      .replace(/\(₹\)/g, '')
      .replace(/[^a-z0-9]+/gi, '')
      .toLowerCase();
  }

  function buildHeaderMap(headerRow) {
    var map = Object.create(null);
    (headerRow || []).forEach(function (h, i) {
      var k = normKey(h);
      if (k && !(k in map)) map[k] = i;
    });
    return map;
  }

  function pick(row, map, names) {
    for (var i = 0; i < names.length; i++) {
      var idx = map[normKey(names[i])];
      if (idx !== undefined && row[idx] !== undefined && row[idx] !== null && row[idx] !== '') {
        return row[idx];
      }
    }
    return '';
  }

  /* xlsx/xlsm are zip containers and start with "PK"; anything else handed to
   * us is treated as delimited text. */
  function isText(data, type) {
    if (type === 'string' || typeof data === 'string') return true;
    var bytes = data instanceof ArrayBuffer ? new Uint8Array(data)
      : (data && data.byteLength !== undefined ? new Uint8Array(data.buffer || data) : null);
    if (!bytes || bytes.length < 2) return false;
    return !(bytes[0] === 0x50 && bytes[1] === 0x4B);
  }

  function toText(data) {
    if (typeof data === 'string') return data;
    var bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer || data);
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    return Buffer.from(bytes).toString('utf8');
  }

  function sheetRows(wb, name) {
    var ws = wb.Sheets[name];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
  }

  /* Finds a sheet by fuzzy name, so "Employee Master", "employee_master" and
   * "Master" all resolve. */
  function findSheet(wb, candidates) {
    var names = wb.SheetNames || [];
    for (var c = 0; c < candidates.length; c++) {
      var want = normKey(candidates[c]);
      for (var i = 0; i < names.length; i++) {
        if (normKey(names[i]) === want) return names[i];
      }
    }
    return null;
  }

  function fySheetNames(wb) {
    return (wb.SheetNames || []).filter(function (n) {
      return M.fyStartYearFromLabel(n.trim()) !== null;
    });
  }

  /* Reads a workbook (or CSV) into { employees, revisions, report }. Nothing is
   * written to storage here — the caller decides what to do with the result. */
  function importWorkbook(data, opts) {
    opts = opts || {};
    var wb;
    if (typeof data === 'object' && data.SheetNames) {
      wb = data;
    } else if (isText(data, opts.type)) {
      // CSV. Read raw: left to itself SheetJS reads "01/10/2026" as 10 January,
      // and Indian HR files mean 1 October. model.toDate does the right thing
      // with the original string.
      wb = XLSX.read(toText(data), { type: 'string', raw: true });
    } else {
      wb = XLSX.read(data, { type: opts.type || 'array', cellDates: true });
    }

    var report = { employees: 0, revisions: 0, skipped: [], notes: [], sheets: [] };
    var employees = [];
    var revisions = [];
    var seenCodes = Object.create(null);

    var masterName = findSheet(wb, ['Employee Master', 'Employees', 'Master']);
    if (masterName) {
      report.sheets.push(masterName);
      readMaster(sheetRows(wb, masterName), employees, seenCodes, report);
    }

    var ledgerName = findSheet(wb, ['Revision Ledger', 'Revisions', 'Ledger']);
    if (ledgerName) {
      report.sheets.push(ledgerName);
      readLedger(sheetRows(wb, ledgerName), revisions, report);
    }

    // Per-FY sheets, as laid out in the original workbook: one row per employee
    // holding that year's single revision. Skipped when a ledger is present,
    // since the ledger is the richer source and would duplicate them.
    if (!ledgerName) {
      fySheetNames(wb).forEach(function (name) {
        report.sheets.push(name);
        readFYSheet(sheetRows(wb, name), name.trim(), revisions, employees, seenCodes, report);
      });
    } else if (fySheetNames(wb).length) {
      report.notes.push('Per-year sheets were ignored because the workbook has a Revision Ledger.');
    }

    // A single-sheet CSV: work out which shape it is from its headers.
    if (!masterName && !ledgerName && !fySheetNames(wb).length && wb.SheetNames.length) {
      var only = wb.SheetNames[0];
      var rows = sheetRows(wb, only);
      var map = buildHeaderMap(rows[0]);
      report.sheets.push(only);
      if (looksLikeLedger(map)) readLedger(rows, revisions, report);
      else readMaster(rows, employees, seenCodes, report);
    }

    report.employees = employees.length;
    report.revisions = revisions.length;
    return { employees: employees, revisions: revisions, report: report };
  }

  /* A lone sheet is a ledger if it carries anything that only a revision has:
   * an effective date, a revision type, or a revised CTC. Otherwise it is read
   * as an employee master. */
  function looksLikeLedger(map) {
    return ['Effective Date', 'Effective From', 'Revision Date', 'Revision Type',
      'Revised Annual CTC', 'Revised CTC', 'New CTC', 'Approval Status'
    ].some(function (name) { return map[normKey(name)] !== undefined; });
  }

  function readMaster(rows, employees, seenCodes, report) {
    if (!rows.length) return;
    var map = buildHeaderMap(rows[0]);
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var code = String(pick(row, map, ['Emp Code', 'Employee Code', 'Code', 'Employee ID']) || '').trim();
      if (!code) continue;
      if (seenCodes[code]) {
        report.skipped.push('Duplicate employee code ' + code + ' (row ' + (i + 1) + ')');
        continue;
      }
      seenCodes[code] = true;
      employees.push(M.makeEmployee({
        code: code,
        name: pick(row, map, ['Employee Name', 'Name']),
        department: pick(row, map, ['Department', 'Dept']),
        subDepartment: pick(row, map, ['Sub-Department', 'Sub Department']),
        designation: pick(row, map, ['Designation']),
        subDesignation: pick(row, map, ['Sub-Designation', 'Sub Designation', 'Level']),
        grade: pick(row, map, ['Grade']),
        doj: pick(row, map, ['Date of Joining', 'DOJ', 'Joining Date']),
        baselineFixed: pick(row, map, ['Baseline Annual Fixed', 'Baseline Fixed']),
        baselineVariable: pick(row, map, ['Baseline Annual Variable', 'Baseline Variable']),
        baselineCTC: pick(row, map, [
          'Baseline Annual CTC 2026', 'Baseline Annual CTC', 'Baseline CTC',
          'Annual CTC', 'Current Annual CTC', 'CTC'
        ]),
        status: pick(row, map, ['Employment Status', 'Status']) || 'Active',
        remarks: pick(row, map, ['Remarks', 'Notes'])
      }));
    }
  }

  function readLedger(rows, revisions, report) {
    if (!rows.length) return;
    var map = buildHeaderMap(rows[0]);
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var code = String(pick(row, map, ['Emp Code', 'Employee Code', 'Code']) || '').trim();
      var eff = pick(row, map, ['Effective Date', 'Effective From', 'Revision Date']);
      var ctc = pick(row, map, ['Revised Annual CTC', 'Revised CTC', 'New CTC', 'Annual CTC', 'CTC']);
      if (!code && !eff && ctc === '') continue;
      if (!code) { report.skipped.push('Ledger row ' + (i + 1) + ' has no employee code'); continue; }
      if (!eff) { report.skipped.push('Ledger row ' + (i + 1) + ' (' + code + ') has no effective date'); continue; }

      revisions.push(M.makeRevision({
        id: pick(row, map, ['Revision ID', 'ID']) || undefined,
        empCode: code,
        effectiveDate: eff,
        revisionType: pick(row, map, ['Revision Type', 'Type']) || 'Annual Increment',
        fixed: pick(row, map, ['Revised Annual Fixed', 'Revised Fixed', 'Fixed']),
        variable: pick(row, map, ['Revised Annual Variable', 'Revised Variable', 'Variable']),
        ctc: ctc,
        newDesignation: pick(row, map, ['New Designation', 'Designation']),
        newGrade: pick(row, map, ['New Grade']),
        approvalStatus: pick(row, map, ['Approval Status', 'Status']) || 'Draft',
        approvedBy: pick(row, map, ['Approved By', 'Approver']),
        payrollMonth: pick(row, map, ['Payroll Month']),
        remarks: pick(row, map, ['Remarks', 'Notes'])
      }));
    }
  }

  /* One of the original per-FY sheets. Rows there are formula-linked to the
   * master and are mostly empty until HR fills in the revised figures, so a row
   * only becomes a revision once it carries a revised CTC. */
  function readFYSheet(rows, fyName, revisions, employees, seenCodes, report) {
    if (!rows.length) return;
    var map = buildHeaderMap(rows[0]);
    var bounds = M.fyBounds(fyName);
    var imported = 0, blank = 0;

    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      var code = String(pick(row, map, ['Emp Code', 'Employee Code', 'Code']) || '').trim();
      if (!code) continue;

      var fixed = M.numOrNull(pick(row, map, ['Revised Annual Fixed', 'Revised Fixed']));
      var variable = M.numOrNull(pick(row, map, ['Revised Annual Variable', 'Revised Variable']));
      var ctc = M.numOrNull(pick(row, map, ['Revised Annual CTC', 'Revised CTC']));
      if (ctc === null && (fixed !== null || variable !== null)) ctc = M.num(fixed) + M.num(variable);
      if (ctc === null || ctc === 0) { blank++; continue; }

      // The old sheets also carry the pay the employee was on before the
      // revision. Where the master has no baseline, that column is the only
      // record of it, so it seeds the baseline rather than being discarded.
      var currentCTC = M.numOrNull(pick(row, map, ['Current Annual CTC', 'Current CTC']));
      var currentFixed = M.numOrNull(pick(row, map, ['Current Annual Fixed', 'Current Fixed']));
      var currentVariable = M.numOrNull(pick(row, map, ['Current Annual Variable', 'Current Variable']));
      if (currentCTC === null && (currentFixed !== null || currentVariable !== null)) {
        currentCTC = M.num(currentFixed) + M.num(currentVariable);
      }
      if (currentCTC) {
        var emp = employees.filter(function (e) { return e.code === code; })[0];
        if (emp && emp.baselineCTC === null && isFirstFYFor(code, revisions, fyName)) {
          emp.baselineCTC = currentCTC;
          if (currentFixed !== null) emp.baselineFixed = currentFixed;
          if (currentVariable !== null) emp.baselineVariable = currentVariable;
        }
      }

      var eff = pick(row, map, ['Effective Date', 'Effective From']);
      revisions.push(M.makeRevision({
        empCode: code,
        // An undated row still belongs to its sheet's year: default to 1 April.
        effectiveDate: eff || bounds.start,
        revisionType: pick(row, map, ['Revision Type', 'Type']) || 'Annual Increment',
        fixed: fixed,
        variable: variable,
        ctc: ctc,
        newDesignation: pick(row, map, ['New Designation']),
        approvalStatus: pick(row, map, ['Approval Status']) || 'Draft',
        approvedBy: pick(row, map, ['Approved By']),
        payrollMonth: pick(row, map, ['Payroll Month']),
        remarks: pick(row, map, ['Remarks'])
      }));
      imported++;
    }
    report.notes.push(fyName + ': ' + imported + ' revision' + (imported === 1 ? '' : 's') +
      ' imported' + (blank ? ', ' + blank + ' row' + (blank === 1 ? '' : 's') + ' with no revised CTC skipped' : ''));
  }

  function isFirstFYFor(code, revisions, fyName) {
    for (var i = 0; i < revisions.length; i++) {
      if (revisions[i].empCode === code && M.fyLabel(revisions[i].effectiveDate) < fyName) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------ export */

  function cell(v, fmt) {
    if (v === null || v === undefined || v === '') return { t: 's', v: '' };
    if (typeof v === 'number') {
      var c = { t: 'n', v: v };
      if (fmt) c.z = fmt;
      return c;
    }
    return { t: 's', v: String(v) };
  }

  function dateCell(iso) {
    if (!iso) return { t: 's', v: '' };
    var d = M.toDate(iso);
    if (!d) return { t: 's', v: String(iso) };
    return { t: 'd', v: d, z: FMT_DATE };
  }

  /* Builds a worksheet from a header list and an array of cell arrays, then
   * adds the things that make a sheet pleasant to work in: frozen header row,
   * autofilter across the used range, and sensible column widths. */
  function makeSheet(headers, rows, widths) {
    var aoa = [headers].concat(rows);
    var ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });

    // aoa_to_sheet flattens our cell objects' formats away for date/number
    // cells, so re-apply them by walking the source rows.
    rows.forEach(function (row, r) {
      row.forEach(function (c, i) {
        if (c && typeof c === 'object' && (c.z || c.t === 'd')) {
          var addr = XLSX.utils.encode_cell({ r: r + 1, c: i });
          if (ws[addr]) {
            if (c.z) ws[addr].z = c.z;
            if (c.t === 'd') ws[addr].t = 'd';
          }
        }
      });
    });

    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: Math.max(headers.length - 1, 0) }
    }) };
    ws['!cols'] = headers.map(function (h, i) {
      return { wch: (widths && widths[i]) || Math.max(10, Math.min(28, String(h).length + 3)) };
    });
    return ws;
  }

  function unwrap(row) {
    return row.map(function (c) {
      return (c && typeof c === 'object' && 'v' in c) ? (c.t === 'd' ? c.v : c.v) : c;
    });
  }

  /* The full workbook. `book` is the computed book from engine.computeAll. */
  function buildWorkbook(book, options) {
    options = options || {};
    var wb = XLSX.utils.book_new();
    var fys = options.fiscalYears && options.fiscalYears.length
      ? options.fiscalYears
      : (book.fiscalYears.length ? book.fiscalYears : [M.fyLabelFromStartYear(M.fyStartYear(new Date()))]);

    addReadme(wb, book, fys);
    addMaster(wb, book);
    addLedger(wb, book);
    fys.forEach(function (fy) { addFYSheet(wb, book, fy); });
    addConsolidated(wb, book, fys);
    addSummary(wb, book, fys);
    addLists(wb);
    return wb;
  }

  function addReadme(wb, book, fys) {
    var rows = [
      ['Euler — Salary Revision Tracker'],
      [''],
      ['Exported', new Date().toISOString().slice(0, 10)],
      ['Employees', book.list.length],
      ['Revisions', E.ledgerRows(book).length],
      ['Fiscal years', fys.join(', ')],
      [''],
      ['How this workbook is put together'],
      ['Revision Ledger', 'One row per revision. This is the source of truth — an employee may appear as many times as they were revised. Edit here and re-import to update the tracker.'],
      ['Employee Master', 'One row per employee, with the baseline CTC each chain starts from.'],
      ['FY sheets', 'One row per employee per year, with each revision of that year spread across R1/R2/R3 columns.'],
      ['Consolidated', 'One row per employee across every year.'],
      ['Summary', 'Roll-ups by department and by grade.'],
      [''],
      ['Definitions'],
      ['Opening CTC', 'Pay in force on 31 March, going into the year. A 1 April increment therefore counts as an increase for that year.'],
      ['Closing CTC', 'Pay in force on 31 March at the end of the year.'],
      ['Annualised impact', 'Closing − Opening. The run-rate cost carried into the next year.'],
      ['In-year cost', 'What the year actually costs, counting each revision from the whole calendar month it takes effect in.'],
      ['In-year impact', 'In-year cost − Opening. Lower than the annualised impact whenever a revision lands mid-year.'],
      ['In effect', 'A revision advances pay only when its approval status is one of: ' +
        book.settings.effectiveStatuses.join(', ') + '. Anything else is costed and reported but never becomes the base for the next revision.']
    ];
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 22 }, { wch: 110 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Read Me');
  }

  function addMaster(wb, book) {
    var headers = ['Emp Code', 'Employee Name', 'Department', 'Sub-Department', 'Designation',
      'Sub-Designation', 'Grade', 'Date of Joining', 'Baseline Annual Fixed (₹)',
      'Baseline Annual Variable (₹)', 'Baseline Annual CTC (₹)', 'Latest Annual CTC (₹)',
      'Revisions', 'Employment Status', 'Remarks'];
    var rows = book.list.map(function (c) {
      var e = c.employee;
      return [
        e.code, e.name, e.department, e.subDepartment, e.designation, e.subDesignation, e.grade,
        dateCell(e.doj),
        cell(e.baselineFixed, FMT_RUPEE), cell(e.baselineVariable, FMT_RUPEE),
        cell(e.baselineCTC, FMT_RUPEE), cell(c.latestCTC, FMT_RUPEE),
        cell(c.revisions.length), e.status, e.remarks
      ];
    });
    XLSX.utils.book_append_sheet(wb, makeSheet(headers, rows,
      [12, 24, 26, 24, 30, 24, 8, 14, 18, 18, 18, 18, 10, 18, 30]), 'Employee Master');
  }

  /* The flat, pivot-ready sheet: one row per revision, fully denormalised. */
  function addLedger(wb, book) {
    var headers = ['Revision ID', 'Emp Code', 'Employee Name', 'Department', 'Sub-Department',
      'Grade', 'Sub-Designation', 'Employment Status', 'Fiscal Year', 'Revision No. in Year',
      'Revisions in Year', 'Effective Date', 'Payroll Month', 'Revision Type',
      'Previous Annual CTC (₹)', 'Revised Annual Fixed (₹)', 'Revised Annual Variable (₹)',
      'Revised Annual CTC (₹)', 'Increment Amount (₹)', 'Increment %', 'New Designation',
      'New Grade', 'Approval Status', 'In Effect', 'Approved By', 'Remarks'];

    var rows = E.ledgerRows(book).map(function (r) {
      return [
        r.id, r.empCode, r.employeeName, r.department, r.subDepartment, r.grade,
        r.subDesignation, r.employmentStatus, r.fy, cell(r.seqInFY), cell(r.revisionsInFY),
        dateCell(r.effectiveDate), r.payrollMonth, r.revisionType,
        cell(r.previousCTC, FMT_RUPEE), cell(r.fixed, FMT_RUPEE), cell(r.variable, FMT_RUPEE),
        cell(r.ctc, FMT_RUPEE), cell(r.incrementAmount, FMT_RUPEE), cell(r.incrementPct, FMT_PCT),
        r.newDesignation, r.newGrade, r.approvalStatus, r.inEffect ? 'Yes' : 'No',
        r.approvedBy, r.remarks
      ];
    });
    XLSX.utils.book_append_sheet(wb, makeSheet(headers, rows,
      [22, 12, 24, 26, 24, 8, 24, 16, 12, 10, 10, 14, 14, 20, 20, 20, 20, 20, 20, 12, 26, 10, 18, 10, 18, 30]),
      'Revision Ledger');
  }

  /* Per-year sheet. Keeps the original workbook's column vocabulary, and adds
   * R1/R2/R3 blocks so a year with several revisions stays on one row. */
  function addFYSheet(wb, book, fy) {
    var maxRevisions = 1;
    book.list.forEach(function (c) {
      var s = E.fySummary(c, fy, book.settings);
      if (s && s.revisionCount > maxRevisions) maxRevisions = s.revisionCount;
    });

    var headers = ['Emp Code', 'Employee Name', 'Department', 'Grade', 'Level',
      'Opening Annual CTC (₹)', 'Closing Annual CTC (₹)', 'Revisions in Year',
      'Annualised Increase (₹)', 'Annualised %', 'In-Year Cost (₹)', 'In-Year Impact (₹)'];
    var widths = [12, 24, 26, 8, 24, 20, 20, 12, 20, 12, 20, 20];

    for (var i = 1; i <= maxRevisions; i++) {
      headers.push('R' + i + ' Effective Date', 'R' + i + ' Type', 'R' + i + ' From CTC (₹)',
        'R' + i + ' To CTC (₹)', 'R' + i + ' Increment (₹)', 'R' + i + ' %',
        'R' + i + ' Approval Status');
      widths.push(16, 20, 18, 18, 18, 10, 18);
    }

    var rows = [];
    book.list.forEach(function (c) {
      var s = E.fySummary(c, fy, book.settings);
      if (!s) return;
      // Employees untouched this year are kept, so the sheet stays a full roster.
      var e = c.employee;
      var row = [
        e.code, e.name, e.department, e.grade, e.subDesignation,
        cell(s.openingCTC, FMT_RUPEE), cell(s.closingCTC, FMT_RUPEE), cell(s.revisionCount),
        cell(s.annualisedImpact, FMT_RUPEE), cell(s.incrementPct, FMT_PCT),
        cell(s.inYearCost, FMT_RUPEE), cell(s.inYearImpact, FMT_RUPEE)
      ];
      for (var i = 0; i < maxRevisions; i++) {
        var st = s.steps[i];
        if (st) {
          row.push(dateCell(st.effectiveDate), st.revisionType, cell(st.fromCTC, FMT_RUPEE),
            cell(st.toCTC, FMT_RUPEE), cell(st.amount, FMT_RUPEE), cell(st.pct, FMT_PCT),
            st.approvalStatus);
        } else {
          row.push('', '', '', '', '', '', '');
        }
      }
      rows.push(row);
    });
    XLSX.utils.book_append_sheet(wb, makeSheet(headers, rows, widths), fy);
  }

  function addConsolidated(wb, book, fys) {
    var headers = ['Emp Code', 'Employee Name', 'Department', 'Grade', 'Level', 'Status',
      'Baseline CTC (₹)'];
    var widths = [12, 24, 26, 8, 24, 14, 18];
    fys.forEach(function (fy) {
      headers.push(fy + ' Closing (₹)', fy + ' %', fy + ' Revisions');
      widths.push(18, 10, 12);
    });
    headers.push('Latest CTC (₹)', 'Total Increase (₹)', 'Total Increase %', 'Total Revisions');
    widths.push(18, 20, 16, 14);

    var rows = book.list.map(function (c) {
      var e = c.employee;
      var row = [e.code, e.name, e.department, e.grade, e.subDesignation, e.status,
        cell(e.baselineCTC, FMT_RUPEE)];
      fys.forEach(function (fy) {
        var s = E.fySummary(c, fy, book.settings);
        row.push(cell(s.closingCTC, FMT_RUPEE), cell(s.incrementPct, FMT_PCT), cell(s.revisionCount));
      });
      var total = (c.latestCTC === null || e.baselineCTC === null) ? null : c.latestCTC - e.baselineCTC;
      row.push(cell(c.latestCTC, FMT_RUPEE), cell(total, FMT_RUPEE),
        cell(e.baselineCTC ? total / e.baselineCTC : null, FMT_PCT), cell(c.revisions.length));
      return row;
    });
    XLSX.utils.book_append_sheet(wb, makeSheet(headers, rows, widths), 'Consolidated');
  }

  function addSummary(wb, book, fys) {
    var rows = [];
    var headers = ['Fiscal Year', 'Grouping', 'Group', 'Headcount', 'Employees Revised',
      'Revisions', 'Multi-Revision Employees', 'Opening Payroll (₹)', 'Closing Payroll (₹)',
      'Annualised Increase (₹)', 'Annualised %', 'In-Year Cost (₹)', 'In-Year Impact (₹)',
      'Average Increment %', 'Median Increment %'];

    fys.forEach(function (fy) {
      var overall = E.aggregate(book, fy);
      rows.push(summaryRow(fy, 'All', 'All employees', overall));
      E.breakdown(book, fy, function (e) { return e.department; }).forEach(function (b) {
        rows.push(summaryRow(fy, 'Department', b.key, b));
      });
      E.breakdown(book, fy, function (e) { return e.grade; }).forEach(function (b) {
        rows.push(summaryRow(fy, 'Grade', b.key, b));
      });
    });

    XLSX.utils.book_append_sheet(wb, makeSheet(headers, rows,
      [12, 14, 32, 12, 18, 12, 22, 20, 20, 20, 14, 20, 20, 18, 18]), 'Summary');
  }

  function summaryRow(fy, grouping, key, a) {
    return [fy, grouping, key, cell(a.headcount), cell(a.revisedCount), cell(a.revisionCount),
      cell(a.multiRevisionCount), cell(a.openingTotal, FMT_RUPEE), cell(a.closingTotal, FMT_RUPEE),
      cell(a.annualisedImpact, FMT_RUPEE), cell(a.annualisedPct, FMT_PCT),
      cell(a.inYearCost, FMT_RUPEE), cell(a.inYearImpact, FMT_RUPEE),
      cell(a.avgIncrementPct, FMT_PCT), cell(a.medianIncrementPct, FMT_PCT)];
  }

  /* Vocabulary sheet, so the exported workbook can carry its own dropdowns. */
  function addLists(wb) {
    var cols = [
      ['Revision Type'].concat(M.REVISION_TYPES),
      ['Approval Status'].concat(M.APPROVAL_STATUSES),
      ['Department'].concat(M.DEPARTMENTS),
      ['Grade'].concat(M.GRADES),
      ['Employment Status'].concat(M.EMPLOYMENT_STATUSES),
      ['Sub-Designation'].concat(M.SUB_DESIGNATIONS)
    ];
    var height = Math.max.apply(null, cols.map(function (c) { return c.length; }));
    var rows = [];
    for (var r = 0; r < height; r++) {
      rows.push(cols.map(function (c) { return c[r] === undefined ? '' : c[r]; }));
    }
    var ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = cols.map(function () { return { wch: 34 }; });
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Lists');
  }

  /* ------------------------------------------------------------------- CSV */

  function toCSV(headers, rows) {
    var aoa = [headers].concat(rows.map(unwrap));
    return XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(aoa));
  }

  function ledgerCSV(book) {
    var headers = ['Revision ID', 'Emp Code', 'Employee Name', 'Department', 'Grade',
      'Fiscal Year', 'Revision No. in Year', 'Effective Date', 'Payroll Month', 'Revision Type',
      'Previous Annual CTC', 'Revised Annual Fixed', 'Revised Annual Variable',
      'Revised Annual CTC', 'Increment Amount', 'Increment %', 'New Designation', 'New Grade',
      'Approval Status', 'In Effect', 'Approved By', 'Remarks'];
    var rows = E.ledgerRows(book).map(function (r) {
      return [r.id, r.empCode, r.employeeName, r.department, r.grade, r.fy, r.seqInFY,
        r.effectiveDate, r.payrollMonth, r.revisionType, r.previousCTC, r.fixed, r.variable,
        r.ctc, r.incrementAmount,
        r.incrementPct === null ? '' : M.round2(r.incrementPct * 100),
        r.newDesignation, r.newGrade, r.approvalStatus, r.inEffect ? 'Yes' : 'No',
        r.approvedBy, r.remarks];
    });
    return toCSV(headers, rows);
  }

  function masterCSV(book) {
    var headers = ['Emp Code', 'Employee Name', 'Department', 'Sub-Department', 'Designation',
      'Sub-Designation', 'Grade', 'Date of Joining', 'Baseline Annual CTC', 'Latest Annual CTC',
      'Revisions', 'Employment Status', 'Remarks'];
    var rows = book.list.map(function (c) {
      var e = c.employee;
      return [e.code, e.name, e.department, e.subDepartment, e.designation, e.subDesignation,
        e.grade, e.doj, e.baselineCTC, c.latestCTC, c.revisions.length, e.status, e.remarks];
    });
    return toCSV(headers, rows);
  }

  /* An empty ledger with one worked example row — the sheet to hand someone who
   * needs to collect revisions offline and send them back. */
  function blankLedgerCSV() {
    var headers = ['Emp Code', 'Effective Date', 'Revision Type', 'Revised Annual Fixed',
      'Revised Annual Variable', 'Revised Annual CTC', 'New Designation', 'New Grade',
      'Approval Status', 'Approved By', 'Remarks'];
    var example = ['EUR0001', '2026-04-01', 'Annual Increment', 900000, 100000, 1000000,
      '', '', 'Draft', '', 'Example row — delete before importing'];
    return toCSV(headers, [example]);
  }

  function writeWorkbook(wb) {
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true });
  }

  return {
    importWorkbook: importWorkbook,
    buildWorkbook: buildWorkbook,
    writeWorkbook: writeWorkbook,
    ledgerCSV: ledgerCSV,
    masterCSV: masterCSV,
    blankLedgerCSV: blankLedgerCSV,
    toCSV: toCSV,
    FMT_RUPEE: FMT_RUPEE,
    FMT_PCT: FMT_PCT
  };
});
