/* Salary Revision Tracker — domain model, vocabulary and shared helpers.
 *
 * Loads as a plain script in the browser (attaches to window.SRT) and as a
 * CommonJS module under Node, so the engine can be unit-tested headlessly.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SRT = Object.assign(root.SRT || {}, { model: api });
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- vocabulary
   * Mirrors the "Lists" sheet of the source workbook so imports and exports
   * round-trip against the spreadsheet HR already uses.
   */
  var REVISION_TYPES = [
    'Annual Increment',
    'Promotion',
    'Market Correction',
    'Retention',
    'Role Change',
    'Probation Confirmation',
    'Off-cycle Correction',
    'No Revision'
  ];

  var APPROVAL_STATUSES = [
    'Draft',
    'Pending Approval',
    'Approved',
    'Processed in Payroll',
    'On Hold',
    'Rejected'
  ];

  var EMPLOYMENT_STATUSES = ['Active', 'Exited', 'On Notice', 'LOP / Sabbatical'];

  var GRADES = ['A', 'B', 'C'];

  var DEPARTMENTS = [
    'Admin & Infra', "CEO's Office", 'Customer Excellence',
    'Customer Relationship Management', 'Engineering', 'Factory Support Function',
    'Finance & Accounts', 'Human Resources', 'IT', 'Manufacturing', 'Marketing',
    'Sales', 'Service & Maintenance', 'Supply Chain Management', 'Technology',
    'Vehicle Financing'
  ];

  var SUB_DESIGNATIONS = [
    'Assistant General Manager', 'Assistant Manager', 'Assistant Vice President',
    'Chief Executive Officer', 'Chief Financial Officer', 'Deputy General Manager',
    'Deputy Manager', 'Executive', 'Finance Controller', 'General Manager',
    'Manager', 'Senior Executive', 'Senior General Manager', 'Senior Manager',
    'Senior Technician', 'Supervisor', 'Vice President'
  ];

  /* Statuses that move an employee's actual pay. Anything outside this set is a
   * proposal: it is costed and reported, but never advances the salary chain.
   * Configurable per deployment — see settings.effectiveStatuses. */
  var DEFAULT_EFFECTIVE_STATUSES = [
    'Draft', 'Pending Approval', 'Approved', 'Processed in Payroll'
  ];

  /* ------------------------------------------------------------- fiscal years
   * Indian fiscal year: 1 April → 31 March, labelled the way the source
   * workbook labels its tabs ("FY26-27" = 1 Apr 2026 → 31 Mar 2027).
   */
  var FY_START_MONTH = 4; // April

  function fyStartYear(date) {
    var d = toDate(date);
    if (!d) return null;
    return d.getUTCMonth() + 1 >= FY_START_MONTH ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  }

  function fyLabel(date) {
    var y = fyStartYear(date);
    return y === null ? '' : fyLabelFromStartYear(y);
  }

  function fyLabelFromStartYear(startYear) {
    return 'FY' + pad2(startYear % 100) + '-' + pad2((startYear + 1) % 100);
  }

  function fyStartYearFromLabel(label) {
    var m = /^FY(\d{2})-(\d{2})$/.exec(String(label || '').trim());
    if (!m) return null;
    // Two-digit years are read in the 2000s; this tracker starts at FY26-27.
    return 2000 + parseInt(m[1], 10);
  }

  function fyBounds(label) {
    var y = typeof label === 'number' ? label : fyStartYearFromLabel(label);
    if (y === null) return null;
    return { start: isoDate(y, FY_START_MONTH, 1), end: isoDate(y + 1, FY_START_MONTH - 1, 31) };
  }

  function fyRange(fromLabel, toLabel) {
    var a = fyStartYearFromLabel(fromLabel), b = fyStartYearFromLabel(toLabel);
    var out = [];
    for (var y = a; y <= b; y++) out.push(fyLabelFromStartYear(y));
    return out;
  }

  /* ------------------------------------------------------------------- dates */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function isoDate(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }

  /* Accepts ISO strings, Date objects and Excel serial numbers. Returns a Date
   * in UTC, or null. All internal dates are UTC to keep day arithmetic exact
   * regardless of the user's timezone. */
  function toDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) {
      return isNaN(v.getTime()) ? null
        : new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
    }
    if (typeof v === 'number') return excelSerialToDate(v);
    var s = String(v).trim();
    if (!s) return null;

    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return utc(+m[1], +m[2], +m[3]);

    // dd/mm/yyyy and dd-mm-yyyy — the conventional Indian ordering.
    m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
    if (m) return utc(+m[3], +m[2], +m[1]);

    // dd-MMM-yyyy / d MMM yyyy
    m = /^(\d{1,2})[\-\s]([A-Za-z]{3,})[\-\s](\d{4})$/.exec(s);
    if (m) {
      var mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
      if (mi >= 0) return utc(+m[3], mi + 1, +m[1]);
    }
    if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToDate(parseFloat(s));

    var parsed = new Date(s);
    return isNaN(parsed.getTime()) ? null
      : utc(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function utc(y, m, d) {
    var dt = new Date(Date.UTC(y, m - 1, d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  /* Excel's day 1 is 1900-01-01, with a phantom 1900-02-29 to stay bug-for-bug
   * compatible with Lotus 1-2-3; serial 61 onward is offset by that extra day. */
  function excelSerialToDate(serial) {
    if (!isFinite(serial) || serial <= 0) return null;
    var days = Math.floor(serial);
    var epoch = Date.UTC(1899, 11, 31);
    if (days >= 61) days -= 1;
    return new Date(epoch + days * 86400000);
  }

  function toISO(v) {
    var d = toDate(v);
    if (!d) return '';
    return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  function daysBetween(a, b) {
    var da = toDate(a), db = toDate(b);
    if (!da || !db) return 0;
    return Math.round((db.getTime() - da.getTime()) / 86400000);
  }

  function addDays(v, n) {
    var d = toDate(v);
    if (!d) return null;
    return new Date(d.getTime() + n * 86400000);
  }

  /* Payroll month label, e.g. "Apr 2026" — the month a revision first shows up
   * in payroll. Defaults to the month of the effective date. */
  function payrollMonthOf(dateLike) {
    var d = toDate(dateLike);
    if (!d) return '';
    var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  /* ------------------------------------------------------------------ numbers */

  function num(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v).replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  /* null when genuinely blank, so "not yet captured" stays distinct from zero. */
  function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).replace(/[₹,\s]/g, '');
    if (!s) return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  /* ----------------------------------------------------------------- records */

  function makeEmployee(raw) {
    raw = raw || {};
    var fixed = numOrNull(raw.baselineFixed);
    var variable = numOrNull(raw.baselineVariable);
    var ctc = numOrNull(raw.baselineCTC);
    if (ctc === null && (fixed !== null || variable !== null)) ctc = num(fixed) + num(variable);

    return {
      code: String(raw.code || '').trim(),
      name: String(raw.name || '').trim(),
      department: String(raw.department || '').trim(),
      subDepartment: String(raw.subDepartment || '').trim(),
      designation: String(raw.designation || '').trim(),
      subDesignation: String(raw.subDesignation || '').trim(),
      grade: String(raw.grade || '').trim(),
      doj: toISO(raw.doj),
      baselineFixed: fixed,
      baselineVariable: variable,
      baselineCTC: ctc,
      status: String(raw.status || 'Active').trim() || 'Active',
      remarks: String(raw.remarks || '').trim()
    };
  }

  function makeRevision(raw) {
    raw = raw || {};
    var fixed = numOrNull(raw.fixed);
    var variable = numOrNull(raw.variable);
    var ctc = numOrNull(raw.ctc);

    // A revision is defined by its revised CTC. Fixed/variable are captured when
    // known; if only the split is given the CTC follows from it, and if only the
    // CTC is given the split is left unknown rather than invented.
    if (ctc === null && (fixed !== null || variable !== null)) ctc = num(fixed) + num(variable);

    var effectiveDate = toISO(raw.effectiveDate);
    return {
      id: raw.id || uid(),
      empCode: String(raw.empCode || '').trim(),
      effectiveDate: effectiveDate,
      revisionType: String(raw.revisionType || 'Annual Increment').trim(),
      fixed: fixed,
      variable: variable,
      ctc: ctc,
      newDesignation: String(raw.newDesignation || '').trim(),
      newGrade: String(raw.newGrade || '').trim(),
      approvalStatus: String(raw.approvalStatus || 'Draft').trim(),
      approvedBy: String(raw.approvedBy || '').trim(),
      payrollMonth: String(raw.payrollMonth || '').trim() || payrollMonthOf(effectiveDate),
      remarks: String(raw.remarks || '').trim(),
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString()
    };
  }

  var uidCounter = 0;
  function uid() {
    uidCounter += 1;
    return 'rev_' + Date.now().toString(36) + '_' + uidCounter.toString(36) +
      Math.random().toString(36).slice(2, 6);
  }

  /* --------------------------------------------------------------- validation
   * Returns a list of {field, level, message}. `error` blocks the save,
   * `warning` is advisory — HR can knowingly record an unusual revision.
   */
  function validateRevision(rev, employee, siblingRevisions) {
    var out = [];
    if (!rev.empCode) out.push(err('empCode', 'Employee code is required.'));
    if (!rev.effectiveDate) out.push(err('effectiveDate', 'Effective date is required.'));
    if (rev.ctc === null) out.push(err('ctc', 'Revised CTC is required.'));
    else if (rev.ctc < 0) out.push(err('ctc', 'Revised CTC cannot be negative.'));

    if (rev.fixed !== null && rev.variable !== null && rev.ctc !== null &&
        Math.abs(num(rev.fixed) + num(rev.variable) - rev.ctc) > 1) {
      out.push(err('ctc', 'Fixed + variable does not equal the revised CTC.'));
    }
    if (REVISION_TYPES.indexOf(rev.revisionType) === -1) {
      out.push(warn('revisionType', 'Unrecognised revision type "' + rev.revisionType + '".'));
    }
    if (APPROVAL_STATUSES.indexOf(rev.approvalStatus) === -1) {
      out.push(warn('approvalStatus', 'Unrecognised approval status "' + rev.approvalStatus + '".'));
    }
    if (employee && employee.doj && rev.effectiveDate &&
        daysBetween(employee.doj, rev.effectiveDate) < 0) {
      out.push(err('effectiveDate', 'Effective date is before the date of joining (' + employee.doj + ').'));
    }
    if (employee && employee.status === 'Exited') {
      out.push(warn('empCode', 'This employee is marked Exited.'));
    }
    (siblingRevisions || []).forEach(function (other) {
      if (other.id !== rev.id && other.effectiveDate === rev.effectiveDate) {
        out.push(warn('effectiveDate',
          'Another revision for this employee already carries the same effective date.'));
      }
    });
    return out;
  }

  function err(field, message) { return { field: field, level: 'error', message: message }; }
  function warn(field, message) { return { field: field, level: 'warning', message: message }; }

  return {
    REVISION_TYPES: REVISION_TYPES,
    APPROVAL_STATUSES: APPROVAL_STATUSES,
    EMPLOYMENT_STATUSES: EMPLOYMENT_STATUSES,
    GRADES: GRADES,
    DEPARTMENTS: DEPARTMENTS,
    SUB_DESIGNATIONS: SUB_DESIGNATIONS,
    DEFAULT_EFFECTIVE_STATUSES: DEFAULT_EFFECTIVE_STATUSES,
    FY_START_MONTH: FY_START_MONTH,
    fyStartYear: fyStartYear,
    fyLabel: fyLabel,
    fyLabelFromStartYear: fyLabelFromStartYear,
    fyStartYearFromLabel: fyStartYearFromLabel,
    fyBounds: fyBounds,
    fyRange: fyRange,
    toDate: toDate,
    toISO: toISO,
    isoDate: isoDate,
    daysBetween: daysBetween,
    addDays: addDays,
    payrollMonthOf: payrollMonthOf,
    num: num,
    numOrNull: numOrNull,
    round2: round2,
    makeEmployee: makeEmployee,
    makeRevision: makeRevision,
    validateRevision: validateRevision,
    uid: uid
  };
});
