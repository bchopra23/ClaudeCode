/* Employees — the roster, and the per-employee revision history drawer. */
(function (root) {
  'use strict';

  var U = root.SRT.ui, E = root.SRT.engine, M = root.SRT.model, store = root.SRT.store;
  var el = U.el;

  var filters = { q: '', department: '', grade: '', status: 'Active', revised: '' };

  function render(mount) {
    var book = store.book();
    var fy = store.ui().fy;

    if (!book.list.length) {
      mount.appendChild(U.emptyState('No employees yet',
        'Import your workbook from the Import & Export tab.',
        el('button', { class: 'btn btn-primary', style: 'margin-top:12px',
          onclick: function () { root.SRT.app.go('data'); } }, 'Go to Import & Export')));
      return;
    }

    mount.appendChild(el('div', { class: 'view-head' }, [
      el('div', {}, [
        el('h1', { class: 'view-title', text: 'Employees' }),
        el('p', { class: 'view-sub', text: 'Figures shown for ' + fy + '. Select a row to see the full revision history.' })
      ])
    ]));

    var card = el('section', { class: 'card' });
    var table = null;

    var departments = unique(book.list.map(function (c) { return c.employee.department; }));
    var grades = unique(book.list.map(function (c) { return c.employee.grade; }));

    function rows() {
      return book.list
        .map(function (c) { return { computed: c, summary: E.fySummary(c, fy, book.settings) }; })
        .filter(function (r) {
          var e = r.computed.employee;
          if (filters.department && e.department !== filters.department) return false;
          if (filters.grade && e.grade !== filters.grade) return false;
          if (filters.status && e.status !== filters.status) return false;
          if (filters.revised === 'yes' && !r.summary.effectiveRevisionCount) return false;
          if (filters.revised === 'no' && r.summary.effectiveRevisionCount) return false;
          if (filters.revised === 'multi' && !r.summary.hasMultipleRevisions) return false;
          if (filters.q) {
            var q = filters.q.toLowerCase();
            var hay = (e.code + ' ' + e.name + ' ' + e.department + ' ' + e.subDepartment + ' ' +
              e.designation + ' ' + e.subDesignation).toLowerCase();
            if (hay.indexOf(q) === -1) return false;
          }
          return true;
        });
    }

    function refresh() { if (table) table.update(rows()); }

    var bar = el('div', { class: 'filters' }, [
      field('Search', el('input', {
        type: 'search', placeholder: 'Name, code, department…', value: filters.q,
        oninput: function (ev) { filters.q = ev.target.value; refresh(); }
      }), 'grow'),
      field('Department', select(['All departments'].concat(departments), filters.department, function (v) {
        filters.department = v; refresh();
      })),
      field('Grade', select(['All grades'].concat(grades), filters.grade, function (v) {
        filters.grade = v; refresh();
      })),
      field('Employment', select(['All'].concat(M.EMPLOYMENT_STATUSES), filters.status, function (v) {
        filters.status = v; refresh();
      })),
      field('Revised in ' + fy, selectPairs([
        ['', 'All'], ['yes', 'Revised'], ['no', 'Not revised'], ['multi', 'Revised more than once']
      ], filters.revised, function (v) { filters.revised = v; refresh(); }))
    ]);
    card.appendChild(bar);

    table = U.dataTable({
      pageSize: 60,
      sortKey: 'name', sortDir: 1,
      onRowClick: function (r) { openEmployee(r.computed.employee.code); },
      columns: [
        { key: 'code', label: 'Code', value: function (r) { return r.computed.employee.code; } },
        { key: 'name', label: 'Employee', value: function (r) { return r.computed.employee.name; },
          render: function (r) {
            var e = r.computed.employee;
            return el('div', {}, [
              el('div', { style: 'font-weight:600', text: e.name }),
              el('div', { class: 'muted', style: 'font-size:11.5px',
                text: (e.subDesignation || e.designation || '—') })
            ]);
          } },
        { key: 'dept', label: 'Department', value: function (r) { return r.computed.employee.department; } },
        { key: 'grade', label: 'Grade', value: function (r) { return r.computed.employee.grade; } },
        { key: 'opening', label: 'Opening ' + fy, numeric: true,
          value: function (r) { return r.summary.openingCTC; },
          render: function (r) { return U.money(r.summary.openingCTC); } },
        { key: 'closing', label: 'Closing ' + fy, numeric: true,
          value: function (r) { return r.summary.closingCTC; },
          render: function (r) { return U.money(r.summary.closingCTC); } },
        { key: 'revs', label: 'Revisions', numeric: true,
          value: function (r) { return r.summary.revisionCount; },
          render: function (r) {
            var n = r.summary.revisionCount;
            if (!n) return el('span', { class: 'muted', text: '—' });
            return el('span', {
              class: 'chip chip-count',
              title: r.summary.steps.map(function (s) {
                return U.dateLong(s.effectiveDate) + ' · ' + s.revisionType + ' · ' + U.pct(s.pct);
              }).join('\n'),
              text: String(n)
            });
          } },
        { key: 'pct', label: 'Increase', numeric: true,
          value: function (r) { return r.summary.incrementPct; },
          render: function (r) {
            if (r.summary.incrementPct === null) return '—';
            var cls = r.summary.incrementPct < 0 ? 'delta-down' : 'delta-up';
            return el('span', { class: cls, text: U.pct(r.summary.incrementPct) });
          } },
        { key: 'latest', label: 'Latest CTC', numeric: true,
          value: function (r) { return r.computed.latestCTC; },
          render: function (r) { return U.money(r.computed.latestCTC); } },
        { key: 'act', label: '', sortable: false, render: function (r) {
          return el('button', {
            class: 'btn btn-sm',
            onclick: function () { root.SRT.app.addRevision({ empCode: r.computed.employee.code }); }
          }, 'Add revision');
        } }
      ],
      rows: rows()
    });
    card.appendChild(table);
    mount.appendChild(card);
  }

  /* --------------------------------------------------------- detail drawer */

  function openEmployee(code) {
    var book = store.book();
    var computed = book.byCode[code];
    if (!computed) return;
    var e = computed.employee;

    var body = el('div');

    body.appendChild(el('div', { class: 'panel-head' }, [
      el('div', {}, [
        el('h2', { text: e.name || e.code }),
        el('p', { text: [e.code, e.subDesignation || e.designation, e.department,
          e.grade ? 'Grade ' + e.grade : null].filter(Boolean).join(' · ') })
      ]),
      el('button', { class: 'icon-button', 'aria-label': 'Close',
        onclick: function () { root.SRT.app.closeOverlay(); } }, '✕')
    ]));

    body.appendChild(el('dl', { class: 'kv card' }, [
      kv('Baseline CTC', U.money(e.baselineCTC)),
      kv('Latest CTC', U.money(computed.latestCTC)),
      kv('Total increase', computed.latestCTC === null || e.baselineCTC === null ? '—'
        : U.signed(computed.latestCTC - e.baselineCTC)),
      kv('Date of joining', U.dateLong(e.doj)),
      kv('Employment status', e.status),
      kv('Revisions on record', String(computed.revisions.length))
    ]));

    /* Per-year summary — the multi-revision story, year by year. */
    var years = uniqueYears(computed);
    if (years.length) {
      var yearCard = el('section', { class: 'card', style: 'margin-top:14px' });
      yearCard.appendChild(el('div', { class: 'card-head' }, [
        el('h3', { class: 'card-title', text: 'Year by year' })
      ]));
      var yTable = el('table', { class: 'data' });
      yTable.appendChild(el('thead', {}, el('tr', {}, [
        el('th', { text: 'Year' }), el('th', { class: 'num', text: 'Opening' }),
        el('th', { class: 'num', text: 'Closing' }), el('th', { class: 'num', text: 'Revisions' }),
        el('th', { class: 'num', text: 'Annualised' }), el('th', { class: 'num', text: '%' }),
        el('th', { class: 'num', text: 'In-year cost' })
      ])));
      var yBody = el('tbody');
      years.forEach(function (fy) {
        var s = E.fySummary(computed, fy, book.settings);
        yBody.appendChild(el('tr', {}, [
          el('td', { style: 'font-weight:600', text: fy }),
          el('td', { class: 'num', text: U.money(s.openingCTC) }),
          el('td', { class: 'num', text: U.money(s.closingCTC) }),
          el('td', { class: 'num', text: String(s.revisionCount) }),
          el('td', { class: 'num', text: U.signed(s.annualisedImpact) }),
          el('td', { class: 'num', text: U.pct(s.incrementPct) }),
          el('td', { class: 'num', text: U.money(s.inYearCost) })
        ]));
      });
      yTable.appendChild(yBody);
      yearCard.appendChild(el('div', { class: 'table-wrap' }, yTable));
      body.appendChild(yearCard);
    }

    /* The chain itself. */
    var histCard = el('section', { class: 'card', style: 'margin-top:14px' });
    histCard.appendChild(el('div', { class: 'card-head' }, [
      el('h3', { class: 'card-title', text: 'Revision history' }),
      el('button', { class: 'btn btn-sm btn-primary',
        onclick: function () { root.SRT.app.addRevision({ empCode: e.code }); } }, 'Add revision')
    ]));

    var list = el('ol', { class: 'timeline' });
    list.appendChild(el('li', { class: 'is-baseline' }, [
      el('div', { class: 'timeline-head' }, [
        el('span', { class: 'timeline-date', text: e.doj ? U.dateLong(e.doj) : 'Baseline' }),
        el('span', { class: 'pill-muted', text: 'Baseline' })
      ]),
      el('div', { class: 'timeline-body' }, [
        el('span', { class: 'timeline-jump', text: U.money(e.baselineCTC) }),
        e.baselineCTC === null
          ? el('div', { class: 'muted', style: 'font-size:12px',
              text: 'No baseline CTC on record — the first revision cannot show an increase until this is filled in.' })
          : null
      ])
    ]));

    computed.revisions.forEach(function (r) {
      list.appendChild(el('li', { class: r.inEffect ? '' : 'is-proposal' }, [
        el('div', { class: 'timeline-head' }, [
          el('span', { class: 'timeline-date', text: U.dateLong(r.effectiveDate) }),
          el('span', { class: 'pill-muted', text: r.fy }),
          r.revisionsInFY > 1
            ? el('span', { class: 'pill-muted', text: U.ordinal(r.seqInFY) + ' of ' + r.revisionsInFY + ' this year' })
            : null,
          el('span', { class: 'pill-muted', text: r.revisionType }),
          U.statusChip(r.approvalStatus),
          !r.inEffect ? el('span', { class: 'pill-muted', text: 'Not applied to pay' }) : null
        ]),
        el('div', { class: 'timeline-body' }, [
          el('div', {}, [
            el('span', { class: 'timeline-jump', text: U.money(r.previousCTC) + ' → ' + U.money(r.ctc) }),
            r.incrementAmount === null ? null : el('span', {
              class: r.incrementAmount < 0 ? 'delta-down' : 'delta-up',
              style: 'margin-left:8px',
              text: U.signed(r.incrementAmount) + ' (' + U.pct(r.incrementPct) + ')'
            })
          ]),
          r.newDesignation ? el('div', { text: 'New designation: ' + r.newDesignation }) : null,
          r.approvedBy ? el('div', { class: 'muted', text: 'Approved by ' + r.approvedBy }) : null,
          r.remarks ? el('div', { class: 'muted', text: r.remarks }) : null,
          el('div', { class: 'btn-row', style: 'margin-top:6px' }, [
            el('button', { class: 'btn btn-sm',
              onclick: function () { root.SRT.app.editRevision(r.id); } }, 'Edit'),
            el('button', { class: 'btn btn-sm btn-danger', onclick: function () {
              if (confirm('Delete this revision effective ' + U.dateLong(r.effectiveDate) + '?\n\n' +
                  'Later revisions will be re-chained against the pay before it.')) {
                store.deleteRevision(r.id);
                U.toast('Revision deleted');
                openEmployee(code);
              }
            } }, 'Delete')
          ])
        ])
      ]));
    });

    if (!computed.revisions.length) {
      list.appendChild(el('li', {}, el('div', { class: 'muted', text: 'No revisions recorded yet.' })));
    }

    histCard.appendChild(list);
    body.appendChild(histCard);

    root.SRT.app.openDrawer(body);
  }

  /* ------------------------------------------------------------- utilities */

  function uniqueYears(computed) {
    var set = {};
    computed.revisions.forEach(function (r) { if (r.fy) set[r.fy] = true; });
    var current = store.ui().fy;
    if (current) set[current] = true;
    return Object.keys(set).sort();
  }

  function unique(list) {
    var seen = {}, out = [];
    list.forEach(function (v) {
      if (v && !seen[v]) { seen[v] = true; out.push(v); }
    });
    return out.sort();
  }

  function kv(label, value) {
    return el('div', {}, [el('dt', { text: label }), el('dd', { text: value })]);
  }

  function field(label, control, cls) {
    return el('div', { class: 'field ' + (cls || '') }, [el('label', { text: label }), control]);
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

  function selectPairs(pairs, value, onchange) {
    var node = el('select', { onchange: function (ev) { onchange(ev.target.value); } });
    pairs.forEach(function (p) {
      node.appendChild(el('option', { value: p[0], selected: value === p[0] }, p[1]));
    });
    return node;
  }

  root.SRT.views = root.SRT.views || {};
  root.SRT.views.employees = { render: render, openEmployee: openEmployee };
})(window);
