/* Bulk revision — apply an increment to a filtered set, with a preview before
 * anything is written. This is the part that makes a whole annual cycle
 * practical: filter to Grade A in Sales, apply 8%, review, commit. */
(function (root) {
  'use strict';

  var U = root.SRT.ui, E = root.SRT.engine, M = root.SRT.model, store = root.SRT.store;
  var el = U.el;

  function render(mount) {
    var book = store.book();
    if (!book.list.length) {
      mount.appendChild(U.emptyState('No employees yet', 'Import your workbook first.',
        el('button', { class: 'btn btn-primary', style: 'margin-top:12px',
          onclick: function () { root.SRT.app.go('data'); } }, 'Go to Import & Export')));
      return;
    }

    var opts = {
      department: '', grade: '', status: 'Active', onlyUnrevised: true,
      mode: 'percent', value: 8, roundTo: 1000,
      effectiveDate: M.fyBounds(store.ui().fy).start,
      revisionType: 'Annual Increment', approvalStatus: 'Draft',
      approvedBy: '', remarks: ''
    };

    mount.appendChild(el('div', { class: 'view-head' }, [
      el('div', {}, [
        el('h1', { class: 'view-title', text: 'Bulk revision' }),
        el('p', { class: 'view-sub', text:
          'Draft a revision for many employees at once. Nothing is saved until you commit, ' +
          'and each employee still gets their own ledger entry.' })
      ])
    ]));

    var previewCard = el('section', { class: 'card', style: 'margin-top:16px' });
    var setup = el('section', { class: 'card' });

    var departments = unique(book.list.map(function (c) { return c.employee.department; }));
    var grades = unique(book.list.map(function (c) { return c.employee.grade; }));

    setup.appendChild(el('div', { class: 'card-head' },
      el('h2', { class: 'card-title', text: '1 · Choose who' })));

    setup.appendChild(el('div', { class: 'form-grid' }, [
      field('Department', select(['All departments'].concat(departments), opts.department, function (v) {
        opts.department = v; refresh();
      })),
      field('Grade', select(['All grades'].concat(grades), opts.grade, function (v) {
        opts.grade = v; refresh();
      })),
      field('Employment status', select(['All'].concat(M.EMPLOYMENT_STATUSES), opts.status, function (v) {
        opts.status = v; refresh();
      })),
      el('div', { class: 'field' }, [
        el('label', { text: 'Scope' }),
        el('label', { class: 'row', style: 'gap:8px; font-weight:500' }, [
          el('input', { type: 'checkbox', checked: opts.onlyUnrevised, style: 'width:auto',
            onchange: function (ev) { opts.onlyUnrevised = ev.target.checked; refresh(); } }),
          'Skip employees already revised on this date'
        ])
      ])
    ]));

    setup.appendChild(el('div', { class: 'card-head', style: 'margin-top:18px' },
      el('h2', { class: 'card-title', text: '2 · Choose what' })));

    setup.appendChild(el('div', { class: 'form-grid' }, [
      field('Method', selectOf([
        ['percent', 'Increase by percentage'],
        ['amount', 'Increase by fixed amount'],
        ['set', 'Set CTC to a fixed value']
      ], opts.mode, function (v) { opts.mode = v; refresh(); })),
      field(' ', el('input', {
        type: 'number', step: '0.1', value: opts.value,
        oninput: function (ev) { opts.value = M.num(ev.target.value); refresh(); }
      }), '', 'Percentage or rupee amount'),
      field('Round to nearest', selectOf([
        ['0', 'No rounding'], ['100', '₹100'], ['1000', '₹1,000'], ['10000', '₹10,000']
      ], String(opts.roundTo), function (v) { opts.roundTo = M.num(v); refresh(); })),
      field('Effective date', el('input', {
        type: 'date', value: opts.effectiveDate,
        oninput: function (ev) { opts.effectiveDate = ev.target.value; refresh(); }
      })),
      field('Revision type', selectOf(M.REVISION_TYPES.map(function (t) { return [t, t]; }),
        opts.revisionType, function (v) { opts.revisionType = v; })),
      field('Approval status', selectOf(M.APPROVAL_STATUSES.map(function (t) { return [t, t]; }),
        opts.approvalStatus, function (v) { opts.approvalStatus = v; refresh(); })),
      field('Approved by', el('input', { type: 'text', value: opts.approvedBy,
        oninput: function (ev) { opts.approvedBy = ev.target.value; } })),
      field('Remarks', el('input', { type: 'text', value: opts.remarks,
        placeholder: 'e.g. FY26-27 annual cycle',
        oninput: function (ev) { opts.remarks = ev.target.value; } }))
    ]));

    mount.appendChild(setup);
    mount.appendChild(previewCard);

    function matching() {
      return book.list.filter(function (c) {
        var e = c.employee;
        if (opts.department && e.department !== opts.department) return false;
        if (opts.grade && e.grade !== opts.grade) return false;
        if (opts.status && e.status !== opts.status) return false;
        if (opts.onlyUnrevised) {
          var clash = c.revisions.some(function (r) { return r.effectiveDate === opts.effectiveDate; });
          if (clash) return false;
        }
        return true;
      }).map(function (c) { return c.employee.code; });
    }

    function refresh() {
      U.clear(previewCard);
      var codes = matching();
      var plans = E.planBulkRevision(book, codes, opts);
      var applicable = plans.filter(function (p) { return !p.skipped; });
      var skipped = plans.filter(function (p) { return p.skipped; });

      var totalBefore = applicable.reduce(function (a, p) { return a + (p.currentCTC || 0); }, 0);
      var totalAfter = applicable.reduce(function (a, p) { return a + (p.newCTC || 0); }, 0);

      previewCard.appendChild(el('div', { class: 'card-head' }, [
        el('h2', { class: 'card-title', text: '3 · Review' }),
        el('span', { class: 'card-note', text: applicable.length + ' employee' +
          (applicable.length === 1 ? '' : 's') + ' affected' +
          (skipped.length ? ' · ' + skipped.length + ' skipped' : '') })
      ]));

      if (!applicable.length) {
        previewCard.appendChild(el('p', { class: 'muted', text:
          skipped.length
            ? 'Every matching employee was skipped — they have no CTC on record to increase.'
            : 'No employees match these filters.' }));
        return;
      }

      previewCard.appendChild(el('div', { class: 'stats', style: 'margin-bottom:14px' }, [
        el('div', { class: 'stat' }, [
          el('div', { class: 'stat-label', text: 'Employees' }),
          el('div', { class: 'stat-value', text: String(applicable.length) })
        ]),
        el('div', { class: 'stat' }, [
          el('div', { class: 'stat-label', text: 'Payroll before' }),
          el('div', { class: 'stat-value is-small', text: U.moneyShort(totalBefore) })
        ]),
        el('div', { class: 'stat' }, [
          el('div', { class: 'stat-label', text: 'Payroll after' }),
          el('div', { class: 'stat-value is-small', text: U.moneyShort(totalAfter) })
        ]),
        el('div', { class: 'stat is-primary' }, [
          el('div', { class: 'stat-label', text: 'Annualised increase' }),
          el('div', { class: 'stat-value is-small', text: U.moneyShort(totalAfter - totalBefore) }),
          el('div', { class: 'stat-foot', text: totalBefore
            ? U.pct((totalAfter - totalBefore) / totalBefore) + ' overall' : '' })
        ])
      ]));

      previewCard.appendChild(U.dataTable({
        pageSize: 25,
        columns: [
          { key: 'code', label: 'Code', value: function (p) { return p.empCode; } },
          { key: 'name', label: 'Employee', value: function (p) { return p.employee.name; } },
          { key: 'dept', label: 'Department', value: function (p) { return p.employee.department; } },
          { key: 'grade', label: 'Grade', value: function (p) { return p.employee.grade; } },
          { key: 'cur', label: 'Current', numeric: true, value: function (p) { return p.currentCTC; },
            render: function (p) { return U.money(p.currentCTC); } },
          { key: 'new', label: 'Revised', numeric: true, value: function (p) { return p.newCTC; },
            render: function (p) { return U.money(p.newCTC); } },
          { key: 'amt', label: 'Increment', numeric: true, value: function (p) { return p.amount; },
            render: function (p) {
              return el('span', { class: (p.amount || 0) < 0 ? 'delta-down' : 'delta-up',
                text: U.signed(p.amount) });
            } },
          { key: 'pct', label: '%', numeric: true, value: function (p) { return p.pct; },
            render: function (p) { return U.pct(p.pct); } }
        ],
        rows: applicable
      }));

      if (skipped.length) {
        var details = el('details', { style: 'margin-top:12px' });
        details.appendChild(el('summary', { class: 'card-note', style: 'cursor:pointer',
          text: skipped.length + ' skipped — no CTC on record' }));
        details.appendChild(el('p', { class: 'muted', style: 'margin:8px 0 0', text:
          skipped.map(function (p) { return p.employee.code + ' ' + p.employee.name; }).join(', ') }));
        previewCard.appendChild(details);
      }

      previewCard.appendChild(el('div', { class: 'form-actions' }, [
        el('span', { class: 'muted', style: 'margin-right:auto; font-size:12.5px', text:
          'Creates ' + applicable.length + ' ledger entries with status "' + opts.approvalStatus + '".' }),
        el('button', { class: 'btn btn-primary', onclick: function () {
          if (!confirm('Create ' + applicable.length + ' revisions effective ' +
              U.dateLong(opts.effectiveDate) + '?')) return;
          var res = store.saveRevisions(applicable.map(function (p) { return p.revision; }));
          if (!res.ok) { U.toast(res.error, true); return; }
          U.toast(applicable.length + ' revisions created');
          root.SRT.app.go('revisions');
        } }, 'Create ' + applicable.length + ' revisions')
      ]));
    }

    refresh();
  }

  /* ------------------------------------------------------------- utilities */

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

  function selectOf(pairs, value, onchange) {
    var node = el('select', { onchange: function (ev) { onchange(ev.target.value); } });
    pairs.forEach(function (p) {
      node.appendChild(el('option', { value: p[0], selected: String(value) === String(p[0]) }, p[1]));
    });
    return node;
  }

  root.SRT.views = root.SRT.views || {};
  root.SRT.views.bulk = { render: render };
})(window);
