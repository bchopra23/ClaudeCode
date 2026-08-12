/* Salary Revision Tracker — the calculation engine.
 *
 * The whole point of this module is that an employee may be revised any number
 * of times inside one fiscal year. Everything is derived from an ordered chain
 * of revisions rather than from a single "current / revised" pair of columns,
 * which is what the original spreadsheet could not express.
 *
 * Two conventions, both chosen deliberately:
 *
 *  1. In effect vs proposed. A revision advances the employee's salary chain
 *     only when its approval status is in settings.effectiveStatuses (default:
 *     everything except On Hold and Rejected). A proposal is still costed and
 *     reported — it just never becomes the base for the next revision.
 *
 *  2. Whole-month proration. A revision effective any day in August is paid for
 *     all of August. In-year cost is therefore the sum of twelve monthly
 *     figures, which reconciles against a monthly payroll register.
 */
(function (root, factory) {
  var model = (typeof module !== 'undefined' && module.exports)
    ? require('./model.js')
    : root.SRT.model;
  var api = factory(model);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SRT = Object.assign(root.SRT || {}, { engine: api });
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';

  var MONTHS_PER_YEAR = 12;

  function defaultSettings() {
    return {
      effectiveStatuses: M.DEFAULT_EFFECTIVE_STATUSES.slice(),
      prorationBasis: 'month' // 'month' (payroll-aligned) or 'day'
    };
  }

  function normaliseSettings(settings) {
    var s = Object.assign(defaultSettings(), settings || {});
    s.effectiveStatuses = (s.effectiveStatuses || []).slice();
    return s;
  }

  /* Month index since year 0, so month arithmetic never wraps badly. */
  function monthIndex(dateLike) {
    var d = M.toDate(dateLike);
    if (!d) return null;
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  }

  /* --------------------------------------------------------------- ordering */

  /* Revisions are ordered by effective date. Two revisions on the same date are
   * held in capture order, so a correction entered after a promotion lands
   * after it in the chain and wins. */
  function sortRevisions(revisions) {
    return revisions.slice().sort(function (a, b) {
      if (a.effectiveDate !== b.effectiveDate) {
        if (!a.effectiveDate) return 1;
        if (!b.effectiveDate) return -1;
        return a.effectiveDate < b.effectiveDate ? -1 : 1;
      }
      var ca = a.createdAt || '', cb = b.createdAt || '';
      if (ca !== cb) return ca < cb ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : 1;
    });
  }

  function groupByEmployee(revisions) {
    var byCode = Object.create(null);
    (revisions || []).forEach(function (r) {
      if (!r.empCode) return;
      (byCode[r.empCode] || (byCode[r.empCode] = [])).push(r);
    });
    Object.keys(byCode).forEach(function (code) {
      byCode[code] = sortRevisions(byCode[code]);
    });
    return byCode;
  }

  /* ------------------------------------------------------------- the chain */

  /* Walks one employee's revisions in date order and works out, for each, what
   * pay it replaced and what it produced.
   *
   * Returns augmented copies (the stored records are never mutated) plus a
   * `timeline` of in-effect steps used for all downstream proration. */
  function computeEmployee(employee, revisions, settings) {
    var s = normaliseSettings(settings);
    var effective = {};
    s.effectiveStatuses.forEach(function (st) { effective[st] = true; });

    var ordered = sortRevisions(revisions || []);
    var baseline = employee && employee.baselineCTC !== null && employee.baselineCTC !== undefined
      ? employee.baselineCTC : null;

    // The running chain: what the employee is actually on right now.
    var currentCTC = baseline;
    var currentFixed = employee ? employee.baselineFixed : null;
    var currentVariable = employee ? employee.baselineVariable : null;
    var currentDesignation = employee ? (employee.subDesignation || employee.designation || '') : '';
    var currentGrade = employee ? employee.grade : '';

    var timeline = [{
      from: employee && employee.doj ? employee.doj : null,
      ctc: baseline,
      fixed: currentFixed,
      variable: currentVariable,
      revisionId: null,
      source: 'baseline'
    }];

    var seqByFY = Object.create(null);
    var out = ordered.map(function (rev) {
      var fy = M.fyLabel(rev.effectiveDate);
      seqByFY[fy] = (seqByFY[fy] || 0) + 1;

      var inEffect = !!effective[rev.approvalStatus];
      var previousCTC = currentCTC;
      var amount = (rev.ctc === null || previousCTC === null) ? null : rev.ctc - previousCTC;
      var pct = (amount === null || !previousCTC) ? null : amount / previousCTC;

      var aug = Object.assign({}, rev, {
        fy: fy,
        seqInFY: seqByFY[fy],
        inEffect: inEffect,
        previousCTC: previousCTC,
        previousFixed: currentFixed,
        previousVariable: currentVariable,
        previousDesignation: currentDesignation,
        previousGrade: currentGrade,
        incrementAmount: amount,
        incrementPct: pct
      });

      if (inEffect && rev.ctc !== null) {
        currentCTC = rev.ctc;
        // Carry the previous split forward when a revision records only a total.
        currentFixed = rev.fixed !== null ? rev.fixed : null;
        currentVariable = rev.variable !== null ? rev.variable : null;
        if (rev.newDesignation) currentDesignation = rev.newDesignation;
        if (rev.newGrade) currentGrade = rev.newGrade;
        timeline.push({
          from: rev.effectiveDate,
          ctc: rev.ctc,
          fixed: currentFixed,
          variable: currentVariable,
          revisionId: rev.id,
          source: 'revision'
        });
      }
      return aug;
    });

    // Mark how many revisions share each FY, so the UI can flag the multi-
    // revision cases without recounting.
    out.forEach(function (r) { r.revisionsInFY = seqByFY[r.fy] || 1; });

    return {
      employee: employee,
      revisions: out,
      timeline: timeline,
      baselineCTC: baseline,
      latestCTC: currentCTC,
      latestFixed: currentFixed,
      latestVariable: currentVariable,
      latestDesignation: currentDesignation,
      latestGrade: currentGrade
    };
  }

  /* CTC actually in force on a given date, from an in-effect timeline. */
  function ctcOn(timeline, dateLike) {
    var target = M.toISO(dateLike);
    if (!target) return null;
    var value = null;
    for (var i = 0; i < timeline.length; i++) {
      var step = timeline[i];
      // The baseline step has no start date: it applies from the beginning.
      if (step.from === null || step.from === '' || step.from <= target) value = step.ctc;
      else break;
    }
    return value;
  }

  /* CTC in force during a given calendar month (month index), under the
   * whole-month convention: a revision effective any day in a month applies to
   * the whole of that month. */
  function ctcInMonth(timeline, mIndex) {
    var value = null;
    for (var i = 0; i < timeline.length; i++) {
      var step = timeline[i];
      if (step.from === null || step.from === '') { value = step.ctc; continue; }
      var mi = monthIndex(step.from);
      if (mi !== null && mi <= mIndex) value = step.ctc;
      else break;
    }
    return value;
  }

  /* ------------------------------------------------------------ FY summaries */

  /* Everything a fiscal year says about one employee.
   *
   *   openingCTC       pay in force going into the year, i.e. on 31 March of the
   *                    previous year. Deliberately *not* "on 1 April": the most
   *                    common revision of all is an annual increment effective
   *                    1 April, and measuring from 1 April would swallow it and
   *                    report the year as a zero increase.
   *   closingCTC       pay in force on 31 March
   *   annualisedImpact closing − opening: the run-rate cost carried into the
   *                    next year, and the number people mean by "the increment"
   *   inYearCost       what the year actually costs at these salaries
   *   inYearImpact     inYearCost − opening: the extra cash spent this year,
   *                    which is smaller than the annualised impact whenever a
   *                    revision lands mid-year
   */
  function fySummary(computed, fyLabel, settings) {
    var s = normaliseSettings(settings);
    var bounds = M.fyBounds(fyLabel);
    if (!bounds) return null;

    var opening = ctcOn(computed.timeline, M.toISO(M.addDays(bounds.start, -1)));
    var closing = ctcOn(computed.timeline, bounds.end);

    var inFY = computed.revisions.filter(function (r) { return r.fy === fyLabel; });
    var effectiveInFY = inFY.filter(function (r) { return r.inEffect; });

    var startMonth = monthIndex(bounds.start);
    var monthly = [];
    var inYearCost = 0;
    var costed = opening !== null || effectiveInFY.length > 0;
    for (var i = 0; i < MONTHS_PER_YEAR; i++) {
      var ctc = ctcInMonth(computed.timeline, startMonth + i);
      monthly.push(ctc);
      inYearCost += (ctc || 0) / MONTHS_PER_YEAR;
    }

    if (s.prorationBasis === 'day') {
      inYearCost = dayProratedCost(computed.timeline, bounds);
    }

    var annualisedImpact = (opening === null || closing === null) ? null : closing - opening;
    var pct = (annualisedImpact === null || !opening) ? null : annualisedImpact / opening;

    return {
      fy: fyLabel,
      openingCTC: opening,
      closingCTC: closing,
      annualisedImpact: annualisedImpact,
      incrementPct: pct,
      inYearCost: costed ? M.round2(inYearCost) : null,
      inYearImpact: (costed && opening !== null) ? M.round2(inYearCost - opening) : null,
      monthlyCTC: monthly,
      revisions: inFY,
      revisionCount: inFY.length,
      effectiveRevisionCount: effectiveInFY.length,
      hasMultipleRevisions: effectiveInFY.length > 1,
      // Each revision's own step, so a 2-revision year can be read step by step.
      steps: inFY.map(function (r) {
        return {
          id: r.id,
          seq: r.seqInFY,
          effectiveDate: r.effectiveDate,
          revisionType: r.revisionType,
          approvalStatus: r.approvalStatus,
          inEffect: r.inEffect,
          fromCTC: r.previousCTC,
          toCTC: r.ctc,
          amount: r.incrementAmount,
          pct: r.incrementPct
        };
      })
    };
  }

  /* Day-exact alternative to whole-month proration, kept because finance
   * sometimes wants it even though it will not tie to a payroll register. */
  function dayProratedCost(timeline, bounds) {
    var total = 0;
    var yearDays = M.daysBetween(bounds.start, bounds.end) + 1;
    var cursor = bounds.start;
    var steps = timeline.filter(function (st) {
      return st.from === null || st.from === '' || st.from <= bounds.end;
    });
    for (var i = 0; i < steps.length; i++) {
      var from = (steps[i].from && steps[i].from > bounds.start) ? steps[i].from : bounds.start;
      var next = steps[i + 1];
      var until = (next && next.from && next.from <= bounds.end)
        ? M.toISO(M.addDays(next.from, -1)) : bounds.end;
      if (until < from) continue;
      if (from < cursor) from = cursor;
      var days = M.daysBetween(from, until) + 1;
      if (days > 0) total += (steps[i].ctc || 0) * days / yearDays;
      cursor = M.toISO(M.addDays(until, 1));
    }
    return total;
  }

  /* --------------------------------------------------------------- the book */

  /* Computes every employee once and indexes the result. This is the single
   * entry point the UI and the exporter both use. */
  function computeAll(employees, revisions, settings) {
    var s = normaliseSettings(settings);
    var byCode = groupByEmployee(revisions);
    var results = Object.create(null);
    var all = [];

    (employees || []).forEach(function (emp) {
      var computed = computeEmployee(emp, byCode[emp.code] || [], s);
      results[emp.code] = computed;
      all.push(computed);
    });

    // Revisions whose employee code is not in the master: surfaced rather than
    // silently dropped, because that is nearly always a bad import.
    var orphans = [];
    Object.keys(byCode).forEach(function (code) {
      if (!results[code]) orphans = orphans.concat(byCode[code]);
    });

    return {
      settings: s,
      byCode: results,
      list: all,
      orphanRevisions: orphans,
      fiscalYears: fiscalYearsPresent(revisions)
    };
  }

  /* Fiscal years that actually carry data, oldest first. */
  function fiscalYearsPresent(revisions) {
    var set = Object.create(null);
    (revisions || []).forEach(function (r) {
      var fy = M.fyLabel(r.effectiveDate);
      if (fy) set[fy] = true;
    });
    return Object.keys(set).sort();
  }

  /* Flattens the book into one row per revision — the shape the ledger view and
   * the pivot-ready export both want. */
  function ledgerRows(book) {
    var rows = [];
    book.list.forEach(function (c) {
      c.revisions.forEach(function (r) {
        rows.push(Object.assign({}, r, {
          employeeName: c.employee.name,
          department: c.employee.department,
          subDepartment: c.employee.subDepartment,
          grade: r.previousGrade || c.employee.grade,
          subDesignation: r.previousDesignation || c.employee.subDesignation,
          employmentStatus: c.employee.status
        }));
      });
    });
    return rows.sort(function (a, b) {
      if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate < b.effectiveDate ? -1 : 1;
      return a.empCode < b.empCode ? -1 : 1;
    });
  }

  /* ------------------------------------------------------------- aggregation */

  /* Roll-up for one fiscal year across a set of employees. `filter` receives the
   * employee record and decides membership, so the dashboard, the department
   * breakdown and the bulk tool can all share this. */
  function aggregate(book, fyLabel, filter) {
    var summaries = [];
    book.list.forEach(function (c) {
      if (filter && !filter(c.employee, c)) return;
      var sum = fySummary(c, fyLabel, book.settings);
      if (sum) summaries.push({ computed: c, summary: sum });
    });

    var openingTotal = 0, closingTotal = 0, inYearCostTotal = 0;
    var revisedCount = 0, revisionCount = 0, multiRevisionCount = 0;
    var pcts = [];
    var withOpening = 0;

    summaries.forEach(function (item) {
      var s = item.summary;
      if (s.openingCTC !== null) { openingTotal += s.openingCTC; withOpening++; }
      if (s.closingCTC !== null) closingTotal += s.closingCTC;
      if (s.inYearCost !== null) inYearCostTotal += s.inYearCost;
      revisionCount += s.revisionCount;
      if (s.effectiveRevisionCount > 0) revisedCount++;
      if (s.hasMultipleRevisions) multiRevisionCount++;
      if (s.effectiveRevisionCount > 0 && s.incrementPct !== null) pcts.push(s.incrementPct);
    });

    pcts.sort(function (a, b) { return a - b; });

    return {
      fy: fyLabel,
      headcount: summaries.length,
      headcountWithOpening: withOpening,
      revisedCount: revisedCount,
      unrevisedCount: summaries.length - revisedCount,
      revisionCount: revisionCount,
      multiRevisionCount: multiRevisionCount,
      openingTotal: M.round2(openingTotal),
      closingTotal: M.round2(closingTotal),
      annualisedImpact: M.round2(closingTotal - openingTotal),
      annualisedPct: openingTotal ? (closingTotal - openingTotal) / openingTotal : null,
      inYearCost: M.round2(inYearCostTotal),
      inYearImpact: M.round2(inYearCostTotal - openingTotal),
      avgIncrementPct: pcts.length ? pcts.reduce(function (a, b) { return a + b; }, 0) / pcts.length : null,
      medianIncrementPct: median(pcts),
      maxIncrementPct: pcts.length ? pcts[pcts.length - 1] : null,
      minIncrementPct: pcts.length ? pcts[0] : null,
      summaries: summaries
    };
  }

  function median(sorted) {
    if (!sorted.length) return null;
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /* Same roll-up, split by any employee attribute (department, grade, ...). */
  function breakdown(book, fyLabel, keyFn, filter) {
    var keys = [];
    var seen = Object.create(null);
    book.list.forEach(function (c) {
      if (filter && !filter(c.employee, c)) return;
      var k = keyFn(c.employee, c) || '—';
      if (!seen[k]) { seen[k] = true; keys.push(k); }
    });
    return keys.sort().map(function (k) {
      var agg = aggregate(book, fyLabel, function (emp, c) {
        if (filter && !filter(emp, c)) return false;
        return (keyFn(emp, c) || '—') === k;
      });
      agg.key = k;
      return agg;
    });
  }

  /* Distribution of increment % across revised employees, for the histogram. */
  function incrementHistogram(agg, bucketSize) {
    var size = bucketSize || 0.05;
    var buckets = Object.create(null);
    agg.summaries.forEach(function (item) {
      var s = item.summary;
      if (!s.effectiveRevisionCount || s.incrementPct === null) return;
      var idx = Math.floor(s.incrementPct / size);
      buckets[idx] = (buckets[idx] || 0) + 1;
    });
    var idxs = Object.keys(buckets).map(Number).sort(function (a, b) { return a - b; });
    if (!idxs.length) return [];
    var out = [];
    for (var i = idxs[0]; i <= idxs[idxs.length - 1]; i++) {
      out.push({ from: i * size, to: (i + 1) * size, count: buckets[i] || 0 });
    }
    return out;
  }

  /* ------------------------------------------------------------- bulk changes
   * Builds (but does not commit) a revision per employee, so the UI can show a
   * preview before anything is written. */
  function planBulkRevision(book, empCodes, opts) {
    var plans = [];
    empCodes.forEach(function (code) {
      var c = book.byCode[code];
      if (!c) return;
      var current = ctcOn(c.timeline, opts.effectiveDate) ;
      if (current === null) current = c.latestCTC;
      var target = null;

      if (opts.mode === 'percent') {
        if (current === null) {
          plans.push({ empCode: code, employee: c.employee, skipped: 'No current CTC on record' });
          return;
        }
        target = current * (1 + M.num(opts.value) / 100);
      } else if (opts.mode === 'amount') {
        if (current === null) {
          plans.push({ empCode: code, employee: c.employee, skipped: 'No current CTC on record' });
          return;
        }
        target = current + M.num(opts.value);
      } else { // 'set'
        target = M.num(opts.value);
      }

      if (opts.roundTo) target = Math.round(target / opts.roundTo) * opts.roundTo;

      plans.push({
        empCode: code,
        employee: c.employee,
        currentCTC: current,
        newCTC: M.round2(target),
        amount: current === null ? null : M.round2(target - current),
        pct: current ? (target - current) / current : null,
        revision: M.makeRevision({
          empCode: code,
          effectiveDate: opts.effectiveDate,
          revisionType: opts.revisionType,
          approvalStatus: opts.approvalStatus,
          ctc: M.round2(target),
          approvedBy: opts.approvedBy,
          remarks: opts.remarks
        })
      });
    });
    return plans;
  }

  return {
    defaultSettings: defaultSettings,
    normaliseSettings: normaliseSettings,
    sortRevisions: sortRevisions,
    groupByEmployee: groupByEmployee,
    computeEmployee: computeEmployee,
    computeAll: computeAll,
    ctcOn: ctcOn,
    ctcInMonth: ctcInMonth,
    monthIndex: monthIndex,
    fySummary: fySummary,
    fiscalYearsPresent: fiscalYearsPresent,
    ledgerRows: ledgerRows,
    aggregate: aggregate,
    breakdown: breakdown,
    incrementHistogram: incrementHistogram,
    planBulkRevision: planBulkRevision
  };
});
