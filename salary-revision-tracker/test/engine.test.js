/* Engine tests. Run with: node test/engine.test.js
 *
 * Expected values here are worked out by hand in the comments, so a failure
 * says which arithmetic broke rather than just "not equal".
 */
'use strict';

var M = require('../js/model.js');
var E = require('../js/engine.js');

var passed = 0, failed = 0;

function eq(actual, expected, label) {
  var ok = (typeof expected === 'number' && typeof actual === 'number')
    ? Math.abs(actual - expected) < 0.51
    : actual === expected;
  if (ok) { passed++; return; }
  failed++;
  console.error('  FAIL ' + label + '\n        expected ' + expected + '\n        actual   ' + actual);
}

function section(name) { console.log('\n' + name); }

function emp(over) {
  return M.makeEmployee(Object.assign({
    code: 'EUR0001', name: 'Test Person', department: 'Sales', grade: 'B',
    subDesignation: 'Manager', doj: '2018-07-01', status: 'Active',
    baselineCTC: 1200000
  }, over));
}

function rev(over) {
  return M.makeRevision(Object.assign({
    empCode: 'EUR0001', revisionType: 'Annual Increment', approvalStatus: 'Approved'
  }, over));
}

function book(employee, revisions, settings) {
  return E.computeAll([employee], revisions, settings);
}

/* ------------------------------------------------------------------ dates */
section('Fiscal year mapping (1 Apr – 31 Mar)');
eq(M.fyLabel('2026-04-01'), 'FY26-27', '1 Apr 2026 opens FY26-27');
eq(M.fyLabel('2027-03-31'), 'FY26-27', '31 Mar 2027 closes FY26-27');
eq(M.fyLabel('2027-04-01'), 'FY27-28', '1 Apr 2027 opens FY27-28');
eq(M.fyLabel('2026-03-31'), 'FY25-26', '31 Mar 2026 is the prior FY');
eq(M.fyBounds('FY26-27').start, '2026-04-01', 'FY26-27 starts 1 Apr 2026');
eq(M.fyBounds('FY26-27').end, '2027-03-31', 'FY26-27 ends 31 Mar 2027');
eq(M.toISO(45748), '2025-04-01', 'Excel serial converts to the right day');
eq(M.toISO('01/10/2026'), '2026-10-01', 'dd/mm/yyyy reads as 1 October');

/* -------------------------------------------------- one mid-year revision */
section('Single mid-year revision');
{
  // Baseline 12,00,000. One revision to 13,20,000 effective 1 Oct 2026.
  // Opening 12,00,000 · closing 13,20,000 · annualised +1,20,000 (10%)
  // In-year: 6 months at 12,00,000 + 6 at 13,20,000 = 12,60,000 → impact 60,000
  var b = book(emp(), [rev({ effectiveDate: '2026-10-01', ctc: 1320000 })]);
  var s = E.fySummary(b.byCode.EUR0001, 'FY26-27', b.settings);
  eq(s.openingCTC, 1200000, 'opening CTC');
  eq(s.closingCTC, 1320000, 'closing CTC');
  eq(s.annualisedImpact, 120000, 'annualised impact');
  eq(Math.round(s.incrementPct * 10000) / 100, 10, 'increment % is 10.00');
  eq(s.inYearCost, 1260000, 'in-year cost with 6 months at each rate');
  eq(s.inYearImpact, 60000, 'in-year impact is half the annualised impact');
  eq(s.revisionCount, 1, 'one revision in the year');
  eq(s.hasMultipleRevisions, false, 'not flagged as multi-revision');
}

/* ------------------------------------------- two revisions in the same FY */
section('Two revisions in one fiscal year');
{
  // Baseline 10,00,000
  //   1 Jul 2026  annual increment  → 11,00,000  (+10% on 10,00,000)
  //   1 Jan 2027  promotion         → 13,20,000  (+20% on 11,00,000)
  // Months: Apr–Jun at 10.0L (3) · Jul–Dec at 11.0L (6) · Jan–Mar at 13.2L (3)
  //   in-year cost = (3×10.0 + 6×11.0 + 3×13.2)/12 lakh = 13.56/12 = 11.30L
  var b = book(emp({ baselineCTC: 1000000 }), [
    rev({ effectiveDate: '2026-07-01', ctc: 1100000 }),
    rev({ effectiveDate: '2027-01-01', ctc: 1320000, revisionType: 'Promotion' })
  ]);
  var c = b.byCode.EUR0001;
  var s = E.fySummary(c, 'FY26-27', b.settings);

  eq(s.revisionCount, 2, 'both revisions land in FY26-27');
  eq(s.hasMultipleRevisions, true, 'flagged as a multi-revision year');
  eq(s.openingCTC, 1000000, 'opening is the baseline');
  eq(s.closingCTC, 1320000, 'closing is the last revision');
  eq(s.annualisedImpact, 320000, 'annualised impact spans both steps');
  eq(s.inYearCost, 1130000, 'in-year cost respects both effective dates');
  eq(s.inYearImpact, 130000, 'in-year impact is well under the annualised 3,20,000');

  // Each step is measured against the pay it actually replaced, not the baseline.
  eq(s.steps[0].fromCTC, 1000000, 'step 1 starts from the baseline');
  eq(s.steps[0].toCTC, 1100000, 'step 1 lands at 11,00,000');
  eq(Math.round(s.steps[0].pct * 10000) / 100, 10, 'step 1 is +10%');
  eq(s.steps[1].fromCTC, 1100000, 'step 2 chains off step 1, not the baseline');
  eq(Math.round(s.steps[1].pct * 10000) / 100, 20, 'step 2 is +20%');
  eq(s.steps[1].seq, 2, 'step 2 is numbered second in the year');

  // Compounding: 10% then 20% is 32% overall, not 30%.
  eq(Math.round(s.incrementPct * 10000) / 100, 32, 'year-on-year is the compounded 32%');
}

/* ------------------------------------------------ three revisions, ordering */
section('Three revisions, entered out of order');
{
  var b = book(emp({ baselineCTC: 600000 }), [
    rev({ effectiveDate: '2027-02-01', ctc: 780000, revisionType: 'Market Correction' }),
    rev({ effectiveDate: '2026-04-01', ctc: 660000 }),
    rev({ effectiveDate: '2026-09-01', ctc: 720000, revisionType: 'Promotion' })
  ]);
  var s = E.fySummary(b.byCode.EUR0001, 'FY26-27', b.settings);
  eq(s.steps.length, 3, 'three steps in the year');
  eq(s.steps[0].effectiveDate, '2026-04-01', 'steps are ordered by effective date');
  eq(s.steps[1].effectiveDate, '2026-09-01', 'second step');
  eq(s.steps[2].effectiveDate, '2027-02-01', 'third step');
  eq(s.steps[1].fromCTC, 660000, 'the September step chains off April');
  eq(s.steps[2].fromCTC, 720000, 'the February step chains off September');
  eq(s.closingCTC, 780000, 'closing is the latest by date, not by entry order');
  // Apr–Aug at 6.6L (5) · Sep–Jan at 7.2L (5) · Feb–Mar at 7.8L (2)
  //   = (5×6.6 + 5×7.2 + 2×7.8)/12 = 84.6/12 = 7.05L
  eq(s.inYearCost, 705000, 'in-year cost across three rates');
}

/* -------------------------------------------------------- proposals vs pay */
section('Rejected and on-hold revisions do not move pay');
{
  var b = book(emp({ baselineCTC: 1000000 }), [
    rev({ effectiveDate: '2026-07-01', ctc: 1100000 }),
    rev({ effectiveDate: '2026-10-01', ctc: 1500000, approvalStatus: 'Rejected' }),
    rev({ effectiveDate: '2027-01-01', ctc: 1210000 })
  ]);
  var c = b.byCode.EUR0001;
  var s = E.fySummary(c, 'FY26-27', b.settings);
  eq(s.closingCTC, 1210000, 'the rejected 15,00,000 never becomes the closing CTC');
  eq(c.revisions[1].inEffect, false, 'rejected revision is not in effect');
  eq(c.revisions[1].previousCTC, 1100000, 'it is still costed against pay at that date');
  eq(c.revisions[2].previousCTC, 1100000, 'the next live revision skips the rejected one');
  eq(s.revisionCount, 3, 'it still appears in the year for audit');
  eq(s.effectiveRevisionCount, 2, 'but only two count as effective');

  var strict = book(emp({ baselineCTC: 1000000 }), [
    rev({ effectiveDate: '2026-07-01', ctc: 1100000, approvalStatus: 'Draft' })
  ], { effectiveStatuses: ['Approved', 'Processed in Payroll'] });
  var ss = E.fySummary(strict.byCode.EUR0001, 'FY26-27', strict.settings);
  eq(ss.closingCTC, 1000000, 'under a strict policy a draft does not move pay');
}

/* --------------------------------------------------------- FY boundaries */
section('Fiscal year boundaries');
{
  var b = book(emp({ baselineCTC: 1000000 }), [
    rev({ effectiveDate: '2027-03-01', ctc: 1120000 }),
    rev({ effectiveDate: '2027-04-01', ctc: 1200000 })
  ]);
  var c = b.byCode.EUR0001;
  var f27 = E.fySummary(c, 'FY26-27', b.settings);
  var f28 = E.fySummary(c, 'FY27-28', b.settings);

  eq(f27.revisionCount, 1, 'the 1 April revision belongs to the next year');
  eq(f27.closingCTC, 1120000, 'FY26-27 closes at the March revision');
  // Only March is paid at the new rate: (11×10.0 + 1×11.2)/12 = 121.2/12 = 10.10L
  eq(f27.inYearCost, 1010000, 'a March revision costs one month of the year');
  // A 1 April revision must count as FY27-28's increase, so the year opens on
  // the pay carried in from 31 March, not on the revision itself.
  eq(f28.openingCTC, 1120000, 'FY27-28 opens on the pay carried in from March');
  eq(f28.closingCTC, 1200000, 'and closes on the 1 April revision');
  eq(f28.annualisedImpact, 80000, 'the 1 April increment is counted in FY27-28');
  eq(f28.inYearCost, 1200000, 'a 1 April revision costs the full next year');
  eq(f28.inYearImpact, 80000, 'in-year and annualised agree for a 1 April revision');
}

/* ------------------------------------------------------------- aggregation */
section('Aggregation across employees');
{
  var employees = [
    M.makeEmployee({ code: 'E1', name: 'A', department: 'Sales', grade: 'A', baselineCTC: 1000000 }),
    M.makeEmployee({ code: 'E2', name: 'B', department: 'Sales', grade: 'B', baselineCTC: 2000000 }),
    M.makeEmployee({ code: 'E3', name: 'C', department: 'Technology', grade: 'A', baselineCTC: 3000000 })
  ];
  var revisions = [
    // E1: two revisions in the year
    M.makeRevision({ empCode: 'E1', effectiveDate: '2026-04-01', ctc: 1100000, approvalStatus: 'Approved' }),
    M.makeRevision({ empCode: 'E1', effectiveDate: '2026-10-01', ctc: 1210000, approvalStatus: 'Approved' }),
    // E2: one revision
    M.makeRevision({ empCode: 'E2', effectiveDate: '2026-04-01', ctc: 2200000, approvalStatus: 'Approved' })
    // E3: none
  ];
  var b = E.computeAll(employees, revisions);
  var agg = E.aggregate(b, 'FY26-27');

  eq(agg.headcount, 3, 'all three employees are in scope');
  eq(agg.revisedCount, 2, 'two of them were revised');
  eq(agg.unrevisedCount, 1, 'one was not');
  eq(agg.revisionCount, 3, 'three revisions in total');
  eq(agg.multiRevisionCount, 1, 'one employee had more than one revision');
  eq(agg.openingTotal, 6000000, 'opening payroll is 60,00,000');
  eq(agg.closingTotal, 6410000, 'closing payroll is 12.1 + 22 + 30 = 64,10,000');
  eq(agg.annualisedImpact, 410000, 'annualised impact');
  // E1 in-year: 6×11.0 + 6×12.1 = 138.6/12 = 11.55L · E2 22L · E3 30L → 63.55L
  eq(agg.inYearCost, 6355000, 'in-year cost is lower than the closing run rate');
  eq(agg.inYearImpact, 355000, 'in-year impact');

  var byDept = E.breakdown(b, 'FY26-27', function (e) { return e.department; });
  eq(byDept.length, 2, 'two departments');
  eq(byDept[0].key, 'Sales', 'departments are sorted');
  eq(byDept[0].headcount, 2, 'Sales has two people');
  eq(byDept[0].annualisedImpact, 410000, 'the whole increase sits in Sales');
  eq(byDept[1].key, 'Technology', 'Technology is second');
  eq(byDept[1].annualisedImpact, 0, 'Technology had no revisions');

  var rows = E.ledgerRows(b);
  eq(rows.length, 3, 'ledger holds one row per revision');
  eq(rows[0].employeeName, 'A', 'ledger rows are denormalised for pivoting');
}

/* ---------------------------------------------------------------- bulk tool */
section('Bulk revision planning');
{
  var employees = [
    M.makeEmployee({ code: 'E1', department: 'Sales', baselineCTC: 1000000 }),
    M.makeEmployee({ code: 'E2', department: 'Sales', baselineCTC: 1234567 }),
    M.makeEmployee({ code: 'E3', department: 'Sales' }) // no CTC on record
  ];
  var b = E.computeAll(employees, []);
  var plans = E.planBulkRevision(b, ['E1', 'E2', 'E3'], {
    mode: 'percent', value: 8, effectiveDate: '2026-04-01',
    revisionType: 'Annual Increment', approvalStatus: 'Draft', roundTo: 1000
  });
  eq(plans[0].newCTC, 1080000, '8% on 10,00,000 with rounding');
  eq(plans[1].newCTC, 1333000, '8% on 12,34,567 rounded to the nearest 1,000');
  eq(plans[2].skipped, 'No current CTC on record', 'employees without a CTC are skipped, not guessed');
}

/* --------------------------------------------------------- baseline absent */
section('Employees with no baseline CTC');
{
  // The uploaded master has an empty baseline column, so the first revision has
  // nothing to compare against. That must read as "unknown", never as a 100% rise.
  var b = book(emp({ baselineCTC: null }), [rev({ effectiveDate: '2026-04-01', ctc: 900000 })]);
  var c = b.byCode.EUR0001;
  var s = E.fySummary(c, 'FY26-27', b.settings);
  eq(c.revisions[0].previousCTC, null, 'previous CTC is unknown');
  eq(c.revisions[0].incrementAmount, null, 'increment amount is unknown, not 9,00,000');
  eq(c.revisions[0].incrementPct, null, 'increment % is unknown, not infinite');
  eq(s.openingCTC, null, 'opening is unknown');
  eq(s.closingCTC, 900000, 'closing is still known');
  eq(s.inYearImpact, null, 'in-year impact cannot be stated');
}

/* -------------------------------------------------------------------------- */
console.log('\n' + (failed ? '✗ ' : '✓ ') + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
