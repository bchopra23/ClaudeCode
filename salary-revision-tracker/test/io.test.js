/* Import / export round-trip tests. Run with: node test/io.test.js
 *
 * Pass a workbook path as argv[2] to additionally exercise a real file:
 *   node test/io.test.js ~/Salary_Revision_Tracker.xlsx
 */
'use strict';

var fs = require('fs');
var M = require('../js/model.js');
var E = require('../js/engine.js');
var IO = require('../js/io.js');
var XLSX = require('../js/vendor/xlsx.full.min.js');

var passed = 0, failed = 0;
function eq(actual, expected, label) {
  var ok = (typeof expected === 'number' && typeof actual === 'number')
    ? Math.abs(actual - expected) < 0.51 : actual === expected;
  if (ok) { passed++; return; }
  failed++;
  console.error('  FAIL ' + label + '\n        expected ' + expected + '\n        actual   ' + actual);
}
function section(n) { console.log('\n' + n); }

/* ------------------------------------------------------- synthetic fixtures */
function sampleBook() {
  var employees = [
    M.makeEmployee({ code: 'EUR0001', name: 'Asha Menon', department: 'Sales', subDepartment: 'Field',
      designation: 'Area Sales Manager', subDesignation: 'Manager', grade: 'B',
      doj: '2019-06-03', baselineCTC: 1000000 }),
    M.makeEmployee({ code: 'EUR0002', name: 'Rohit Verma', department: 'Technology',
      subDesignation: 'Senior Executive', grade: 'A', doj: '2021-01-11', baselineCTC: 800000 }),
    M.makeEmployee({ code: 'EUR0003', name: 'Neha Gupta', department: 'Technology',
      subDesignation: 'Manager', grade: 'B', doj: '2024-08-01', baselineCTC: 1500000 })
  ];
  var revisions = [
    M.makeRevision({ empCode: 'EUR0001', effectiveDate: '2026-04-01', ctc: 1100000,
      approvalStatus: 'Approved', approvedBy: 'CHRO' }),
    M.makeRevision({ empCode: 'EUR0001', effectiveDate: '2026-10-01', ctc: 1320000,
      revisionType: 'Promotion', approvalStatus: 'Approved', newDesignation: 'Senior Manager' }),
    M.makeRevision({ empCode: 'EUR0002', effectiveDate: '2026-04-01', ctc: 880000,
      approvalStatus: 'Processed in Payroll' }),
    M.makeRevision({ empCode: 'EUR0002', effectiveDate: '2026-12-01', ctc: 1100000,
      revisionType: 'Retention', approvalStatus: 'Rejected' })
  ];
  return E.computeAll(employees, revisions);
}

section('Workbook shape');
{
  var book = sampleBook();
  var wb = IO.buildWorkbook(book, { fiscalYears: ['FY26-27'] });
  ['Read Me', 'Employee Master', 'Revision Ledger', 'FY26-27', 'Consolidated', 'Summary', 'Lists']
    .forEach(function (name) {
      eq(wb.SheetNames.indexOf(name) >= 0, true, 'workbook has a "' + name + '" sheet');
    });

  var ledger = XLSX.utils.sheet_to_json(wb.Sheets['Revision Ledger']);
  eq(ledger.length, 4, 'ledger holds one row per revision, not per employee');
  eq(ledger[0]['Emp Code'], 'EUR0001', 'ledger is ordered by effective date');
  eq(ledger.filter(function (r) { return r['Emp Code'] === 'EUR0001'; }).length, 2,
    'an employee revised twice appears twice');
  eq(ledger.filter(function (r) { return r['In Effect'] === 'No'; }).length, 1,
    'the rejected revision is exported and flagged');

  var fy = XLSX.utils.sheet_to_json(wb.Sheets['FY26-27']);
  eq(fy.length, 3, 'the FY sheet keeps the full roster');
  var asha = fy.filter(function (r) { return r['Emp Code'] === 'EUR0001'; })[0];
  eq(asha['Revisions in Year'], 2, 'both of her revisions are on one row');
  eq(asha['Opening Annual CTC (₹)'], 1000000, 'opening excludes the 1 April revision');
  eq(asha['Closing Annual CTC (₹)'], 1320000, 'closing is the October promotion');
  eq(asha['R1 To CTC (₹)'], 1100000, 'R1 block holds the first revision');
  eq(asha['R2 To CTC (₹)'], 1320000, 'R2 block holds the second');
  eq(asha['R2 From CTC (₹)'], 1100000, 'R2 chains off R1');
  eq(Object.keys(fy[0]).indexOf('R3 To CTC (₹)'), -1, 'no empty R3 block is emitted');
}

section('Round-trip: export then re-import');
{
  var book = sampleBook();
  var buf = IO.writeWorkbook(IO.buildWorkbook(book, { fiscalYears: ['FY26-27'] }));
  var back = IO.importWorkbook(buf, { type: 'array' });

  eq(back.employees.length, 3, 'all employees survive the round-trip');
  eq(back.revisions.length, 4, 'all revisions survive the round-trip');

  var reBook = E.computeAll(back.employees, back.revisions);
  var before = E.aggregate(book, 'FY26-27');
  var after = E.aggregate(reBook, 'FY26-27');
  eq(after.openingTotal, before.openingTotal, 'opening payroll is unchanged');
  eq(after.closingTotal, before.closingTotal, 'closing payroll is unchanged');
  eq(after.inYearCost, before.inYearCost, 'in-year cost is unchanged');
  eq(after.multiRevisionCount, before.multiRevisionCount, 'multi-revision count is unchanged');

  var asha = reBook.byCode.EUR0001;
  eq(asha.revisions.length, 2, 'her two revisions come back as two records');
  eq(asha.revisions[1].previousCTC, 1100000, 'and still chain correctly');
  eq(asha.revisions[1].newDesignation, 'Senior Manager', 'designation change survives');
  eq(reBook.byCode.EUR0002.revisions[1].approvalStatus, 'Rejected', 'approval status survives');
  eq(reBook.byCode.EUR0002.latestCTC, 880000, 'the rejected revision still does not apply');
  eq(back.employees[0].doj, '2019-06-03', 'dates survive as dates, not serials');
}

section('Round-trip: CSV ledger');
{
  var book = sampleBook();
  var csv = IO.ledgerCSV(book);
  var back = IO.importWorkbook(csv, { type: 'string' });
  eq(back.revisions.length, 4, 'CSV ledger re-imports every revision');
  eq(back.revisions[0].empCode, 'EUR0001', 'employee codes survive');
  eq(back.revisions[0].effectiveDate, '2026-04-01', 'ISO dates survive');
  eq(back.revisions[1].ctc, 880000, 'CTC values survive');
}

section('Import: the original workbook layout (per-FY sheets)');
{
  // Reproduces the uploaded file's shape: a master with an empty baseline column
  // and per-year sheets carrying Current/Revised pairs.
  var master = [
    ['Emp Code', 'Employee Name', 'Department', 'Sub-Department', 'Designation',
      'Sub-Designation', 'Grade', 'Date of Joining', 'Baseline Annual CTC (₹) 2026',
      'Employment Status', 'Remarks'],
    ['EUR0001', 'Saurav Kumar', "CEO's Office", 'Leadership', 'Chief Executive Officer',
      'Chief Executive Officer', 'C', new Date(Date.UTC(2018, 6, 1)), '', 'Active', ''],
    ['EUR0002', 'Gaurav Kumar', 'Supply Chain Management', 'Leadership', 'Head of SCM',
      'Vice President', 'C', new Date(Date.UTC(2018, 6, 1)), '', 'Active', '']
  ];
  var fy2627 = [
    ['Emp Code', 'Employee Name', 'Department', 'Grade', 'Level', 'Current Annual Fixed (₹)',
      'Current Annual Variable (₹)', 'Current Annual CTC (₹)', 'Revised Annual Fixed (₹)',
      'Revised Annual Variable (₹)', 'Revised Annual CTC (₹)', 'Increment Amount (₹)',
      'Increment %', 'Revision Type', 'New Designation', 'Effective Date', 'Approved By',
      'Approval Status', 'Remarks'],
    ['EUR0001', 'Saurav Kumar', "CEO's Office", 'C', 'Chief Executive Officer',
      4000000, 1000000, 5000000, 4400000, 1100000, 5500000, 500000, 0.1,
      'Annual Increment', '', new Date(Date.UTC(2026, 3, 1)), 'Board', 'Approved', ''],
    // A row left untouched by HR: no revised CTC, so it is not a revision.
    ['EUR0002', 'Gaurav Kumar', 'Supply Chain Management', 'C', 'Vice President',
      '', '', 0, '', '', 0, 0, 0, '', '', '', '', '', '']
  ];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(master, { cellDates: true }), 'Employee Master');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fy2627, { cellDates: true }), 'FY26-27');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Revision Type'], ['Annual Increment']]), 'Lists');

  var res = IO.importWorkbook(XLSX.read(XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellDates: true }),
    { type: 'array', cellDates: true }));

  eq(res.employees.length, 2, 'both employees import');
  eq(res.revisions.length, 1, 'only the filled-in row becomes a revision');
  eq(res.revisions[0].empCode, 'EUR0001', 'the right row was taken');
  eq(res.revisions[0].ctc, 5500000, 'revised CTC imported');
  eq(res.revisions[0].effectiveDate, '2026-04-01', 'effective date imported');

  // The master's baseline column is empty, so the FY sheet's "Current" column is
  // the only record of prior pay and must seed the baseline.
  var seeded = res.employees.filter(function (e) { return e.code === 'EUR0001'; })[0];
  eq(seeded.baselineCTC, 5000000, 'baseline seeded from the Current column');
  eq(seeded.baselineFixed, 4000000, 'fixed component seeded too');

  var book = E.computeAll(res.employees, res.revisions);
  var s = E.fySummary(book.byCode.EUR0001, 'FY26-27', book.settings);
  eq(s.openingCTC, 5000000, 'opening matches the sheet Current CTC');
  eq(s.closingCTC, 5500000, 'closing matches the sheet Revised CTC');
  eq(Math.round(s.incrementPct * 1000) / 10, 10, 'increment % matches the sheet');
}

section('Import: forgiving headers');
{
  var csv = 'Employee Code,Revision Date,Type,New CTC,Status\n' +
            'EUR0001,01/10/2026,Promotion,1500000,Approved\n';
  var res = IO.importWorkbook(csv, { type: 'string' });
  eq(res.revisions.length, 1, 'renamed headers still import');
  eq(res.revisions[0].effectiveDate, '2026-10-01', 'dd/mm/yyyy read as 1 October');
  eq(res.revisions[0].ctc, 1500000, 'CTC read from "New CTC"');
  eq(res.revisions[0].revisionType, 'Promotion', 'type read from "Type"');
}

/* ------------------------------------------- optional: a real workbook file */
var realPath = process.argv[2];
if (realPath && fs.existsSync(realPath)) {
  section('Real workbook: ' + realPath);
  var t0 = Date.now();
  var res = IO.importWorkbook(fs.readFileSync(realPath), { type: 'buffer' });
  var book = E.computeAll(res.employees, res.revisions);
  var out = IO.writeWorkbook(IO.buildWorkbook(book, { fiscalYears: ['FY26-27', 'FY27-28', 'FY28-29'] }));
  var elapsed = Date.now() - t0;

  console.log('  employees      ' + res.employees.length);
  console.log('  revisions      ' + res.revisions.length);
  console.log('  sheets read    ' + res.report.sheets.join(', '));
  res.report.notes.forEach(function (n) { console.log('  note           ' + n); });
  console.log('  skipped        ' + res.report.skipped.length);
  console.log('  export size    ' + (out.byteLength / 1024).toFixed(0) + ' KB');
  console.log('  import+export  ' + elapsed + ' ms');

  eq(res.employees.length > 1000, true, 'the real master imports over a thousand employees');
  eq(res.report.skipped.length, 0, 'no rows are skipped unexpectedly');

  var back = IO.importWorkbook(out, { type: 'array' });
  eq(back.employees.length, res.employees.length, 'employees survive a real round-trip');
  eq(back.revisions.length, res.revisions.length, 'revisions survive a real round-trip');

  /* The uploaded template has no revisions captured yet, so the round-trip above
   * is trivial. Synthesise a realistic three-year cycle over the full roster —
   * including mid-year second and third revisions — and re-run everything at
   * scale, which is also the performance check. */
  section('Real workbook at scale (synthetic revisions over the real roster)');
  var employees = res.employees.map(function (e, i) {
    // Seed a baseline by grade, since the uploaded master leaves the column blank.
    var base = { A: 450000, B: 1100000, C: 3500000 }[e.grade] || 600000;
    e.baselineCTC = base + (i % 37) * 5000;
    return e;
  });

  var seed = 7, revisions = [];
  function rand() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }

  ['FY26-27', 'FY27-28', 'FY28-29'].forEach(function (fy) {
    var start = M.fyBounds(fy).start.slice(0, 4);
    employees.forEach(function (e) {
      if (rand() < 0.06) return; // a few people are not revised at all
      revisions.push(M.makeRevision({
        empCode: e.code, effectiveDate: start + '-04-01', revisionType: 'Annual Increment',
        approvalStatus: 'Approved', ctc: 0 // filled below once chained
      }));
      if (rand() < 0.18) { // mid-year promotion or correction
        var month = 7 + Math.floor(rand() * 6);
        revisions.push(M.makeRevision({
          empCode: e.code, effectiveDate: start + '-' + (month < 10 ? '0' : '') + month + '-01',
          revisionType: rand() < 0.5 ? 'Promotion' : 'Market Correction',
          approvalStatus: 'Approved', ctc: 0
        }));
      }
      if (rand() < 0.03) { // a rare third revision in the same year
        revisions.push(M.makeRevision({
          empCode: e.code, effectiveDate: start + '-02-01', revisionType: 'Retention',
          approvalStatus: rand() < 0.3 ? 'Rejected' : 'Approved', ctc: 0
        }));
      }
    });
  });

  // Walk each employee's chain to turn the placeholder CTCs into real steps.
  var byCode = E.groupByEmployee(revisions);
  employees.forEach(function (e) {
    var running = e.baselineCTC;
    (byCode[e.code] || []).forEach(function (r) {
      running = Math.round(running * (1 + (0.05 + rand() * 0.15)) / 1000) * 1000;
      r.ctc = running;
    });
  });

  var t1 = Date.now();
  var bigBook = E.computeAll(employees, revisions);
  var computeMs = Date.now() - t1;

  var t2 = Date.now();
  var bigOut = IO.writeWorkbook(IO.buildWorkbook(bigBook, { fiscalYears: ['FY26-27', 'FY27-28', 'FY28-29'] }));
  var exportMs = Date.now() - t2;

  var t3 = Date.now();
  var reimported = IO.importWorkbook(bigOut, { type: 'array' });
  var importMs = Date.now() - t3;
  var reBook = E.computeAll(reimported.employees, reimported.revisions);

  var agg = E.aggregate(bigBook, 'FY26-27');
  var reAgg = E.aggregate(reBook, 'FY26-27');

  console.log('  employees      ' + employees.length);
  console.log('  revisions      ' + revisions.length);
  console.log('  multi-revision ' + agg.multiRevisionCount + ' employees in FY26-27');
  console.log('  opening / closing payroll  ₹' + (agg.openingTotal / 10000000).toFixed(2) +
    ' Cr → ₹' + (agg.closingTotal / 10000000).toFixed(2) + ' Cr');
  console.log('  annualised impact          ₹' + (agg.annualisedImpact / 10000000).toFixed(2) +
    ' Cr (' + (agg.annualisedPct * 100).toFixed(1) + '%)');
  console.log('  in-year impact             ₹' + (agg.inYearImpact / 10000000).toFixed(2) + ' Cr');
  console.log('  compute ' + computeMs + ' ms · export ' + exportMs + ' ms · import ' +
    importMs + ' ms · ' + (bigOut.byteLength / 1024 / 1024).toFixed(1) + ' MB');

  eq(agg.multiRevisionCount > 100, true, 'the synthetic cycle really does contain multi-revision years');
  eq(reimported.employees.length, employees.length, 'every employee survives the round-trip');
  eq(reimported.revisions.length, revisions.length, 'every revision survives the round-trip');
  eq(reAgg.openingTotal, agg.openingTotal, 'opening payroll is identical after a round-trip');
  eq(reAgg.closingTotal, agg.closingTotal, 'closing payroll is identical after a round-trip');
  eq(reAgg.inYearCost, agg.inYearCost, 'in-year cost is identical after a round-trip');
  eq(reAgg.multiRevisionCount, agg.multiRevisionCount, 'multi-revision employees survive');
  eq(computeMs < 3000, true, 'computing the whole book stays well under 3 s');

  // In-year impact must be strictly smaller than the annualised impact whenever
  // revisions land mid-year — the core reason both numbers exist.
  eq(agg.inYearImpact < agg.annualisedImpact, true,
    'in-year impact is below the annualised run-rate impact');

  fs.writeFileSync(process.env.OUT_XLSX || '/tmp/srt-export.xlsx', Buffer.from(bigOut));
  console.log('  wrote          ' + (process.env.OUT_XLSX || '/tmp/srt-export.xlsx'));
}

console.log('\n' + (failed ? '✗ ' : '✓ ') + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
