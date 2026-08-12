/* Salary Revision Tracker — persistence and application state.
 *
 * Everything lives in localStorage on this device. There is no server and no
 * network call anywhere in this app; the export is how data leaves.
 */
(function (root) {
  'use strict';

  var M = root.SRT.model;
  var E = root.SRT.engine;

  var KEYS = {
    employees: 'srt_employees_v1',
    revisions: 'srt_revisions_v1',
    settings: 'srt_settings_v1',
    ui: 'srt_ui_v1'
  };

  var state = {
    employees: [],
    revisions: [],
    settings: E.defaultSettings(),
    ui: { fy: null, theme: 'system' },
    book: null
  };

  var listeners = [];
  var undoSnapshot = null;

  /* ------------------------------------------------------------------ load */

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('Could not read ' + key, e);
      return fallback;
    }
  }

  function load() {
    state.employees = (read(KEYS.employees, []) || []).map(M.makeEmployee);
    state.revisions = (read(KEYS.revisions, []) || []).map(M.makeRevision);
    state.settings = E.normaliseSettings(read(KEYS.settings, null));
    state.ui = Object.assign({ fy: null, theme: 'system' }, read(KEYS.ui, {}));
    recompute();
    applyTheme();
    return state;
  }

  /* Writes are wrapped because localStorage throws when the quota is exceeded,
   * and losing an afternoon of edits silently would be much worse than a toast. */
  function persist() {
    try {
      localStorage.setItem(KEYS.employees, JSON.stringify(state.employees));
      localStorage.setItem(KEYS.revisions, JSON.stringify(state.revisions));
      localStorage.setItem(KEYS.settings, JSON.stringify(state.settings));
      localStorage.setItem(KEYS.ui, JSON.stringify(state.ui));
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: 'This device ran out of local storage, so the last change was not saved. ' +
               'Export a workbook now to be safe, then remove some data.'
      };
    }
  }

  function recompute() {
    state.book = E.computeAll(state.employees, state.revisions, state.settings);
    if (!state.ui.fy || state.book.fiscalYears.indexOf(state.ui.fy) === -1) {
      state.ui.fy = state.book.fiscalYears[state.book.fiscalYears.length - 1] ||
        M.fyLabelFromStartYear(M.fyStartYear(new Date()));
    }
  }

  function commit(note) {
    recompute();
    var res = persist();
    listeners.forEach(function (fn) { fn(state, note); });
    return res;
  }

  function subscribe(fn) { listeners.push(fn); return function () {
    listeners = listeners.filter(function (f) { return f !== fn; });
  }; }

  /* ------------------------------------------------------------------ reads */

  function employees() { return state.employees; }
  function revisions() { return state.revisions; }
  function book() { return state.book; }
  function settings() { return state.settings; }
  function ui() { return state.ui; }

  function employee(code) {
    return state.employees.filter(function (e) { return e.code === code; })[0] || null;
  }

  function revisionsFor(code) {
    return E.sortRevisions(state.revisions.filter(function (r) { return r.empCode === code; }));
  }

  function revision(id) {
    return state.revisions.filter(function (r) { return r.id === id; })[0] || null;
  }

  function fiscalYears() {
    var present = state.book ? state.book.fiscalYears.slice() : [];
    var current = M.fyLabelFromStartYear(M.fyStartYear(new Date()));
    // Always offer the current year and the next one, so a fresh install can be
    // used before any data exists.
    [current, M.fyLabelFromStartYear(M.fyStartYear(new Date()) + 1)].forEach(function (fy) {
      if (present.indexOf(fy) === -1) present.push(fy);
    });
    return present.sort();
  }

  /* ----------------------------------------------------------------- writes */

  function saveRevision(raw) {
    var rev = M.makeRevision(raw);
    rev.updatedAt = new Date().toISOString();
    var idx = state.revisions.findIndex(function (r) { return r.id === rev.id; });
    if (idx >= 0) {
      rev.createdAt = state.revisions[idx].createdAt;
      state.revisions[idx] = rev;
    } else {
      state.revisions.push(rev);
    }
    return commit('revision-saved');
  }

  function saveRevisions(list) {
    list.forEach(function (raw) {
      var rev = M.makeRevision(raw);
      var idx = state.revisions.findIndex(function (r) { return r.id === rev.id; });
      if (idx >= 0) state.revisions[idx] = rev;
      else state.revisions.push(rev);
    });
    return commit('revisions-saved');
  }

  function deleteRevision(id) {
    state.revisions = state.revisions.filter(function (r) { return r.id !== id; });
    return commit('revision-deleted');
  }

  function saveEmployee(raw) {
    var emp = M.makeEmployee(raw);
    var idx = state.employees.findIndex(function (e) { return e.code === emp.code; });
    if (idx >= 0) state.employees[idx] = emp;
    else state.employees.push(emp);
    return commit('employee-saved');
  }

  function updateSettings(patch) {
    state.settings = E.normaliseSettings(Object.assign({}, state.settings, patch));
    return commit('settings-changed');
  }

  function setUI(patch) {
    Object.assign(state.ui, patch);
    if (patch && patch.theme) applyTheme();
    return commit('ui-changed');
  }

  function applyTheme() {
    var t = state.ui.theme || 'system';
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  /* --------------------------------------------------------------- importing
   * `mode` is 'replace' (start clean) or 'merge' (update matching records and
   * add the rest). Merging matches employees on code, and revisions on id when
   * present, otherwise on employee + effective date + type, so re-importing an
   * edited export updates rows instead of duplicating them.
   */
  function applyImport(result, mode) {
    undoSnapshot = {
      employees: state.employees.slice(),
      revisions: state.revisions.slice()
    };

    var stats = { employeesAdded: 0, employeesUpdated: 0, revisionsAdded: 0, revisionsUpdated: 0 };

    if (mode === 'replace') {
      state.employees = result.employees.slice();
      state.revisions = result.revisions.slice();
      stats.employeesAdded = result.employees.length;
      stats.revisionsAdded = result.revisions.length;
      commit('imported');
      return stats;
    }

    result.employees.forEach(function (incoming) {
      var idx = state.employees.findIndex(function (e) { return e.code === incoming.code; });
      if (idx >= 0) {
        // Keep an existing baseline when the incoming file leaves it blank.
        var existing = state.employees[idx];
        var merged = Object.assign({}, existing, incoming);
        if (incoming.baselineCTC === null) merged.baselineCTC = existing.baselineCTC;
        if (incoming.baselineFixed === null) merged.baselineFixed = existing.baselineFixed;
        if (incoming.baselineVariable === null) merged.baselineVariable = existing.baselineVariable;
        state.employees[idx] = M.makeEmployee(merged);
        stats.employeesUpdated++;
      } else {
        state.employees.push(incoming);
        stats.employeesAdded++;
      }
    });

    result.revisions.forEach(function (incoming) {
      var idx = state.revisions.findIndex(function (r) { return r.id === incoming.id; });
      if (idx < 0) {
        idx = state.revisions.findIndex(function (r) {
          return r.empCode === incoming.empCode &&
                 r.effectiveDate === incoming.effectiveDate &&
                 r.revisionType === incoming.revisionType;
        });
      }
      if (idx >= 0) {
        incoming.id = state.revisions[idx].id;
        incoming.createdAt = state.revisions[idx].createdAt;
        state.revisions[idx] = incoming;
        stats.revisionsUpdated++;
      } else {
        state.revisions.push(incoming);
        stats.revisionsAdded++;
      }
    });

    commit('imported');
    return stats;
  }

  function canUndoImport() { return undoSnapshot !== null; }

  function undoImport() {
    if (!undoSnapshot) return false;
    state.employees = undoSnapshot.employees;
    state.revisions = undoSnapshot.revisions;
    undoSnapshot = null;
    commit('import-undone');
    return true;
  }

  function clearAll() {
    undoSnapshot = { employees: state.employees.slice(), revisions: state.revisions.slice() };
    state.employees = [];
    state.revisions = [];
    return commit('cleared');
  }

  /* A full JSON backup — everything, exactly as held, for archiving. */
  function toJSON() {
    return JSON.stringify({
      format: 'euler-salary-revision-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      employees: state.employees,
      revisions: state.revisions
    }, null, 2);
  }

  function fromJSON(text, mode) {
    var data = JSON.parse(text);
    if (!data || data.format !== 'euler-salary-revision-tracker') {
      throw new Error('This file is not a Salary Revision Tracker backup.');
    }
    if (data.settings) state.settings = E.normaliseSettings(data.settings);
    return applyImport({
      employees: (data.employees || []).map(M.makeEmployee),
      revisions: (data.revisions || []).map(M.makeRevision)
    }, mode || 'replace');
  }

  root.SRT.store = {
    load: load,
    subscribe: subscribe,
    commit: commit,
    employees: employees,
    revisions: revisions,
    book: book,
    settings: settings,
    ui: ui,
    employee: employee,
    revision: revision,
    revisionsFor: revisionsFor,
    fiscalYears: fiscalYears,
    saveRevision: saveRevision,
    saveRevisions: saveRevisions,
    deleteRevision: deleteRevision,
    saveEmployee: saveEmployee,
    updateSettings: updateSettings,
    setUI: setUI,
    applyImport: applyImport,
    canUndoImport: canUndoImport,
    undoImport: undoImport,
    clearAll: clearAll,
    toJSON: toJSON,
    fromJSON: fromJSON
  };
})(window);
