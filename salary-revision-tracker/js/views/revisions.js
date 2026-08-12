/* Revisions — the ledger, and the add/edit form. */
(function (root) {
  'use strict';

  var U = root.SRT.ui, E = root.SRT.engine, M = root.SRT.model, store = root.SRT.store;
  var el = U.el;

  var filters = { q: '', fy: '', type: '', status: '', department: '' };

  function render(mount) {
    var book = store.book();
    var all = E.ledgerRows(book);

    mount.appendChild(el('div', { class: 'view-head' }, [
      el('div', {}, [
        el('h1', { class: 'view-title', text: 'Revision ledger' }),
        el('p', { class: 'view-sub', text:
          'One row per revision. An employee revised three times appears three times — ' +
          'each measured against the pay it replaced.' })
      ]),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn', onclick: function () { root.SRT.app.go('bulk'); } },
          'Bulk revision'),
        el('button', { class: 'btn btn-primary', onclick: function () { root.SRT.app.addRevision(); } },
          'Add revision')
      ])
    ]));

    if (!all.length) {
      mount.appendChild(U.emptyState('No revisions recorded',
        book.list.length
          ? 'Add a revision, or use the bulk tool to apply an increment across a whole department.'
          : 'Import your workbook first, then record revisions here.',
        el('div', { class: 'btn-row', style: 'margin-top:12px; justify-content:center' }, [
          book.list.length
            ? el('button', { class: 'btn btn-primary', onclick: function () { root.SRT.app.addRevision(); } }, 'Add revision')
            : el('button', { class: 'btn btn-primary', onclick: function () { root.SRT.app.go('data'); } }, 'Import data')
        ])));
      return;
    }

    var card = el('section', { class: 'card' });
    var table = null;

    var departments = unique(all.map(function (r) { return r.department; }));
    var years = unique(all.map(function (r) { return r.fy; }));

    function rows() {
      return all.filter(function (r) {
        if (filters.fy && r.fy !== filters.fy) return false;
        if (filters.type && r.revisionType !== filters.type) return false;
        if (filters.status && r.approvalStatus !== filters.status) return false;
        if (filters.department && r.department !== filters.department) return false;
        if (filters.q) {
          var q = filters.q.toLowerCase();
          if ((r.empCode + ' ' + r.employeeName + ' ' + r.remarks + ' ' + r.approvedBy)
              .toLowerCase().indexOf(q) === -1) return false;
        }
        return true;
      });
    }

    function refresh() { if (table) table.update(rows()); }

    card.appendChild(el('div', { class: 'filters' }, [
      field('Search', el('input', {
        type: 'search', placeholder: 'Employee, code, remarks…', value: filters.q,
        oninput: function (ev) { filters.q = ev.target.value; refresh(); }
      }), 'grow'),
      field('Fiscal year', select(['All years'].concat(years), filters.fy, function (v) { filters.fy = v; refresh(); })),
      field('Type', select(['All types'].concat(M.REVISION_TYPES), filters.type, function (v) { filters.type = v; refresh(); })),
      field('Approval', select(['All statuses'].concat(M.APPROVAL_STATUSES), filters.status, function (v) { filters.status = v; refresh(); })),
      field('Department', select(['All departments'].concat(departments), filters.department, function (v) { filters.department = v; refresh(); })),
      el('div', { class: 'field' }, [
        el('label', { text: ' ' }),
        el('button', { class: 'btn', onclick: function () {
          var data = rows();
          U.download('revision-ledger.csv', toCSV(data), 'text/csv;charset=utf-8');
          U.toast('Exported ' + data.length + ' rows');
        } }, 'Export view as CSV')
      ])
    ]));

    table = U.dataTable({
      pageSize: 60,
      sortKey: 'eff', sortDir: -1,
      onRowClick: function (r) { root.SRT.app.editRevision(r.id); },
      columns: [
        { key: 'eff', label: 'Effective', value: function (r) { return r.effectiveDate; },
          render: function (r) { return U.dateLong(r.effectiveDate); } },
        { key: 'fy', label: 'FY', value: function (r) { return r.fy; } },
        { key: 'seq', label: '#', numeric: true, title: 'Which revision this is within the year',
          value: function (r) { return r.seqInFY; },
          render: function (r) {
            if (r.revisionsInFY <= 1) return el('span', { class: 'muted', text: '1' });
            return el('span', { class: 'chip chip-count chip-plain',
              title: 'Revision ' + r.seqInFY + ' of ' + r.revisionsInFY + ' in ' + r.fy,
              text: r.seqInFY + '/' + r.revisionsInFY });
          } },
        { key: 'code', label: 'Code', value: function (r) { return r.empCode; } },
        { key: 'name', label: 'Employee', value: function (r) { return r.employeeName; } },
        { key: 'dept', label: 'Department', value: function (r) { return r.department; } },
        { key: 'type', label: 'Type', value: function (r) { return r.revisionType; } },
        { key: 'prev', label: 'From', numeric: true, value: function (r) { return r.previousCTC; },
          render: function (r) { return U.money(r.previousCTC); } },
        { key: 'ctc', label: 'To', numeric: true, value: function (r) { return r.ctc; },
          render: function (r) { return U.money(r.ctc); } },
        { key: 'amt', label: 'Increment', numeric: true, value: function (r) { return r.incrementAmount; },
          render: function (r) {
            if (r.incrementAmount === null) return '—';
            return el('span', { class: r.incrementAmount < 0 ? 'delta-down' : 'delta-up',
              text: U.signed(r.incrementAmount) });
          } },
        { key: 'pct', label: '%', numeric: true, value: function (r) { return r.incrementPct; },
          render: function (r) { return U.pct(r.incrementPct); } },
        { key: 'status', label: 'Approval', value: function (r) { return r.approvalStatus; },
          render: function (r) {
            return el('div', { class: 'row', style: 'gap:6px' }, [
              U.statusChip(r.approvalStatus),
              r.inEffect ? null : el('span', { class: 'pill-muted', title:
                'This revision does not move pay under the current policy', text: 'not applied' })
            ]);
          } },
        { key: 'act', label: '', sortable: false, render: function (r) {
          return el('div', { class: 'btn-row' }, [
            el('button', { class: 'btn btn-sm', onclick: function () { root.SRT.app.editRevision(r.id); } }, 'Edit'),
            el('button', { class: 'btn btn-sm btn-danger', onclick: function () {
              if (confirm('Delete this revision for ' + r.employeeName + '?')) {
                store.deleteRevision(r.id);
                U.toast('Revision deleted');
                root.SRT.app.refresh();
              }
            } }, 'Delete')
          ]);
        } }
      ],
      rows: rows()
    });
    card.appendChild(table);
    mount.appendChild(card);
  }

  /* ----------------------------------------------------------------- form */

  function openForm(seed, existingId) {
    var book = store.book();
    var existing = existingId ? store.revision(existingId) : null;
    var draft = M.makeRevision(Object.assign({
      effectiveDate: M.fyBounds(store.ui().fy).start,
      approvalStatus: 'Draft'
    }, existing || {}, seed || {}));

    var form = el('form', { onsubmit: function (ev) { ev.preventDefault(); save(); } });
    var messages = el('ul', { class: 'messages' });
    var preview = el('div', { class: 'card', style: 'margin-top:14px; background:var(--surface-sunken)' });

    form.appendChild(el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', { text: existing ? 'Edit revision' : 'Add revision' }),
        el('p', { text: 'The increment is measured against whatever this employee is on at the ' +
          'effective date — including an earlier revision in the same year.' })
      ]),
      el('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close',
        onclick: function () { root.SRT.app.closeOverlay(); } }, '✕')
    ]));

    var grid = el('div', { class: 'form-grid' });

    /* Employee picker: a datalist over 1,160 people is fast and needs no
     * dependency, and typing a code or a name both work. */
    var empInput = el('input', {
      type: 'text', list: 'srt-employee-list', value: draft.empCode,
      placeholder: 'Code or name', required: true, autocomplete: 'off',
      oninput: function (ev) {
        draft.empCode = resolveEmployeeCode(ev.target.value);
        updatePreview();
      }
    });
    grid.appendChild(field('Employee', empInput, 'span-2',
      'Start typing a name or an employee code.'));

    var dl = el('datalist', { id: 'srt-employee-list' });
    book.list.slice(0, 4000).forEach(function (c) {
      dl.appendChild(el('option', { value: c.employee.code },
        c.employee.name + ' — ' + (c.employee.department || '')));
    });
    form.appendChild(dl);

    var dateInput = el('input', {
      type: 'date', value: draft.effectiveDate, required: true,
      oninput: function (ev) { draft.effectiveDate = ev.target.value; updatePreview(); }
    });
    grid.appendChild(field('Effective date', dateInput, '', 'Fiscal year is derived from this date.'));

    grid.appendChild(field('Revision type', selectOf(M.REVISION_TYPES, draft.revisionType, function (v) {
      draft.revisionType = v;
    })));

    var fixedInput = el('input', { type: 'number', step: '1', min: '0', value: draft.fixed === null ? '' : draft.fixed,
      oninput: function (ev) { draft.fixed = M.numOrNull(ev.target.value); syncCTC(); } });
    var variableInput = el('input', { type: 'number', step: '1', min: '0', value: draft.variable === null ? '' : draft.variable,
      oninput: function (ev) { draft.variable = M.numOrNull(ev.target.value); syncCTC(); } });
    var ctcInput = el('input', { type: 'number', step: '1', min: '0', required: true,
      value: draft.ctc === null ? '' : draft.ctc,
      oninput: function (ev) { draft.ctc = M.numOrNull(ev.target.value); updatePreview(); } });

    grid.appendChild(field('Revised annual fixed (₹)', fixedInput, '', 'Optional'));
    grid.appendChild(field('Revised annual variable (₹)', variableInput, '', 'Optional'));
    grid.appendChild(field('Revised annual CTC (₹)', ctcInput, '', 'Fixed + variable, or enter directly'));

    /* A quick way to express the intent as a percentage. */
    var pctInput = el('input', { type: 'number', step: '0.1', placeholder: 'e.g. 10',
      oninput: function (ev) {
        var base = currentCTCAtDate();
        var v = M.numOrNull(ev.target.value);
        if (base !== null && v !== null) {
          draft.ctc = Math.round(base * (1 + v / 100));
          ctcInput.value = draft.ctc;
          draft.fixed = null; draft.variable = null;
          fixedInput.value = ''; variableInput.value = '';
          updatePreview();
        }
      } });
    grid.appendChild(field('…or set by %', pctInput, '', 'Fills the CTC from the current pay'));

    grid.appendChild(field('New designation', el('input', {
      type: 'text', value: draft.newDesignation,
      oninput: function (ev) { draft.newDesignation = ev.target.value; }
    }), '', 'Only for promotions and role changes'));

    grid.appendChild(field('New grade', selectOf([''].concat(M.GRADES), draft.newGrade, function (v) {
      draft.newGrade = v;
    })));

    grid.appendChild(field('Approval status', selectOf(M.APPROVAL_STATUSES, draft.approvalStatus, function (v) {
      draft.approvalStatus = v; updatePreview();
    })));

    grid.appendChild(field('Approved by', el('input', {
      type: 'text', value: draft.approvedBy,
      oninput: function (ev) { draft.approvedBy = ev.target.value; }
    })));

    grid.appendChild(field('Payroll month', el('input', {
      type: 'text', value: draft.payrollMonth, placeholder: 'Apr 2026',
      oninput: function (ev) { draft.payrollMonth = ev.target.value; }
    }), '', 'Defaults to the effective month'));

    grid.appendChild(field('Remarks', el('textarea', {
      rows: 2, oninput: function (ev) { draft.remarks = ev.target.value; }
    }, draft.remarks), 'span-2'));

    form.appendChild(grid);
    form.appendChild(preview);
    form.appendChild(messages);

    form.appendChild(el('div', { class: 'form-actions' }, [
      existing ? el('button', { type: 'button', class: 'btn btn-danger', onclick: function () {
        if (confirm('Delete this revision?')) {
          store.deleteRevision(existing.id);
          root.SRT.app.closeOverlay();
          U.toast('Revision deleted');
          root.SRT.app.refresh();
        }
      } }, 'Delete') : null,
      el('div', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn',
        onclick: function () { root.SRT.app.closeOverlay(); } }, 'Cancel'),
      el('button', { type: 'submit', class: 'btn btn-primary' }, existing ? 'Save changes' : 'Add revision')
    ]));

    function syncCTC() {
      if (draft.fixed !== null || draft.variable !== null) {
        draft.ctc = M.num(draft.fixed) + M.num(draft.variable);
        ctcInput.value = draft.ctc;
      }
      updatePreview();
    }

    function currentCTCAtDate() {
      var c = store.book().byCode[draft.empCode];
      if (!c) return null;
      // Exclude the revision being edited, so editing does not chain off itself.
      var others = c.timeline.filter(function (s) { return s.revisionId !== draft.id; });
      return E.ctcOn(others, draft.effectiveDate);
    }

    function updatePreview() {
      U.clear(preview);
      var c = store.book().byCode[draft.empCode];
      if (!c) {
        preview.appendChild(el('p', { class: 'muted', style: 'margin:0',
          text: 'Choose an employee to see how this revision chains.' }));
        return;
      }
      var base = currentCTCAtDate();
      var fy = M.fyLabel(draft.effectiveDate);
      var priorThisYear = c.revisions.filter(function (r) {
        return r.fy === fy && r.id !== draft.id;
      });
      var amount = (base === null || draft.ctc === null) ? null : draft.ctc - base;

      preview.appendChild(el('div', { class: 'row', style: 'gap:10px; margin-bottom:8px' }, [
        el('strong', { text: c.employee.name }),
        el('span', { class: 'pill-muted', text: c.employee.department || '—' }),
        el('span', { class: 'pill-muted', text: fy || 'No date' })
      ]));

      preview.appendChild(el('div', {}, [
        el('span', { class: 'timeline-jump', text: U.money(base) + ' → ' + U.money(draft.ctc) }),
        amount === null ? null : el('span', {
          class: amount < 0 ? 'delta-down' : 'delta-up', style: 'margin-left:8px',
          text: U.signed(amount) + (base ? ' (' + U.pct(amount / base) + ')' : '')
        })
      ]));

      if (base === null) {
        preview.appendChild(el('p', { class: 'muted', style: 'margin:6px 0 0', text:
          'No pay on record before this date, so the increment cannot be calculated. ' +
          'Set a baseline CTC on the employee to fix that.' }));
      }

      if (priorThisYear.length) {
        preview.appendChild(el('p', { style: 'margin:8px 0 0; font-size:12.5px' }, [
          el('strong', { text: 'This is revision ' + (priorThisYear.length + 1) + ' for ' + fy + '. ' }),
          document.createTextNode('Earlier this year: ' + priorThisYear.map(function (r) {
            return U.dateLong(r.effectiveDate) + ' ' + U.money(r.ctc) +
              (r.inEffect ? '' : ' (' + r.approvalStatus.toLowerCase() + ')');
          }).join(' · '))
        ]));
      }
    }

    function save() {
      U.clear(messages);
      var emp = store.employee(draft.empCode);
      var issues = M.validateRevision(draft, emp, store.revisionsFor(draft.empCode));
      if (!emp) issues.unshift({ field: 'empCode', level: 'error',
        message: 'No employee found with code "' + draft.empCode + '".' });

      issues.forEach(function (i) {
        messages.appendChild(el('li', { class: 'level-' + i.level, text: i.message }));
      });
      if (issues.some(function (i) { return i.level === 'error'; })) return;

      var res = store.saveRevision(draft);
      if (!res.ok) { U.toast(res.error, true); return; }
      root.SRT.app.closeOverlay();
      U.toast(existing ? 'Revision updated' : 'Revision added for ' + emp.name);
      root.SRT.app.refresh();
    }

    updatePreview();
    root.SRT.app.openModal(form);
    setTimeout(function () { (draft.empCode ? dateInput : empInput).focus(); }, 30);
  }

  /* Accepts "EUR0123", or a name that matches exactly one employee. */
  function resolveEmployeeCode(input) {
    var v = String(input || '').trim();
    if (!v) return '';
    if (store.employee(v)) return v;
    var matches = store.employees().filter(function (e) {
      return e.name.toLowerCase() === v.toLowerCase();
    });
    if (matches.length === 1) return matches[0].code;
    var partial = store.employees().filter(function (e) {
      return e.name.toLowerCase().indexOf(v.toLowerCase()) === 0;
    });
    return partial.length === 1 ? partial[0].code : v;
  }

  /* ------------------------------------------------------------- utilities */

  function toCSV(rows) {
    var headers = ['Emp Code', 'Employee Name', 'Department', 'Grade', 'Fiscal Year',
      'Revision No. in Year', 'Revisions in Year', 'Effective Date', 'Payroll Month',
      'Revision Type', 'Previous Annual CTC', 'Revised Annual CTC', 'Increment Amount',
      'Increment %', 'Approval Status', 'In Effect', 'Approved By', 'Remarks'];
    var lines = [headers.join(',')];
    rows.forEach(function (r) {
      lines.push([r.empCode, r.employeeName, r.department, r.grade, r.fy, r.seqInFY,
        r.revisionsInFY, r.effectiveDate, r.payrollMonth, r.revisionType,
        r.previousCTC === null ? '' : r.previousCTC, r.ctc === null ? '' : r.ctc,
        r.incrementAmount === null ? '' : r.incrementAmount,
        r.incrementPct === null ? '' : (r.incrementPct * 100).toFixed(2),
        r.approvalStatus, r.inEffect ? 'Yes' : 'No', r.approvedBy, r.remarks
      ].map(csvCell).join(','));
    });
    return lines.join('\r\n');
  }

  function csvCell(v) {
    var s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function unique(list) {
    var seen = {}, out = [];
    list.forEach(function (v) { if (v && !seen[v]) { seen[v] = true; out.push(v); } });
    return out.sort();
  }

  function field(label, control, cls, hint) {
    return el('div', { class: 'field ' + (cls || '') }, [
      el('label', {}, [label, hint ? el('span', { class: 'hint', text: ' — ' + hint }) : null]),
      control
    ]);
  }

  function select(options, value, onchange) {
    var node = el('select', { onchange: function (ev) {
      onchange(ev.target.selectedIndex === 0 ? '' : ev.target.value);
    } });
    options.forEach(function (o, i) {
      node.appendChild(el('option', { value: i === 0 ? '' : o, selected: value === o }, o));
    });
    return node;
  }

  function selectOf(options, value, onchange) {
    var node = el('select', { onchange: function (ev) { onchange(ev.target.value); } });
    options.forEach(function (o) {
      node.appendChild(el('option', { value: o, selected: value === o }, o || '—'));
    });
    return node;
  }

  root.SRT.views = root.SRT.views || {};
  root.SRT.views.revisions = { render: render, openForm: openForm };
})(window);
