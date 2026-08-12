/* Dashboard — one fiscal year at a glance. */
(function (root) {
  'use strict';

  var U = root.SRT.ui, E = root.SRT.engine, store = root.SRT.store;
  var el = U.el;

  function render(mount) {
    var book = store.book();
    var fy = store.ui().fy;

    if (!book.list.length) {
      mount.appendChild(U.emptyState(
        'No employees yet',
        'Import your Salary Revision Tracker workbook, or a CSV of employees, to get started.',
        el('button', { class: 'btn btn-primary', style: 'margin-top:12px',
          onclick: function () { root.SRT.app.go('data'); } }, 'Go to Import & Export')
      ));
      return;
    }

    var active = function (e) { return e.status !== 'Exited'; };
    var agg = E.aggregate(book, fy, active);

    mount.appendChild(el('div', { class: 'view-head' }, [
      el('div', {}, [
        el('h1', { class: 'view-title', text: fy + ' revision cycle' }),
        el('p', { class: 'view-sub', text:
          agg.headcount.toLocaleString('en-IN') + ' active employees · ' +
          agg.revisionCount.toLocaleString('en-IN') + ' revisions recorded · pay moves on: ' +
          store.settings().effectiveStatuses.join(', ') })
      ]),
      el('div', { class: 'btn-row' }, [
        el('button', { class: 'btn', onclick: function () { root.SRT.app.go('revisions'); } },
          'View revision ledger'),
        el('button', { class: 'btn btn-primary', onclick: function () { root.SRT.app.addRevision(); } },
          'Add revision')
      ])
    ]));

    mount.appendChild(statTiles(agg));

    /* Multi-revision callout — the case this tool exists for. */
    if (agg.multiRevisionCount > 0) {
      mount.appendChild(multiRevisionCard(book, fy, agg));
    }

    mount.appendChild(el('div', { class: 'grid grid-2', style: 'margin-top:16px' }, [
      runRateCard(book, fy, agg),
      distributionCard(agg)
    ]));

    mount.appendChild(el('div', { class: 'grid grid-2', style: 'margin-top:16px' }, [
      breakdownCard('By department', E.breakdown(book, fy, function (e) { return e.department; }, active)),
      breakdownCard('By grade', E.breakdown(book, fy, function (e) { return e.grade; }, active))
    ]));

    mount.appendChild(topMoversCard(agg));
  }

  function statTiles(agg) {
    var tiles = el('div', { class: 'stats' });

    tiles.appendChild(el('div', { class: 'stat is-primary' }, [
      el('div', { class: 'stat-label', text: 'Annualised increase' }),
      el('div', { class: 'stat-value', text: U.moneyShort(agg.annualisedImpact) }),
      el('div', { class: 'stat-foot', text: agg.annualisedPct === null ? 'No opening payroll on record'
        : U.pct(agg.annualisedPct) + ' on an opening payroll of ' + U.moneyShort(agg.openingTotal) })
    ]));

    tiles.appendChild(el('div', { class: 'stat' }, [
      el('div', { class: 'stat-label', text: 'In-year cost impact' }),
      el('div', { class: 'stat-value', text: U.moneyShort(agg.inYearImpact) }),
      el('div', { class: 'stat-foot', text: 'Cash this year — the rest lands next year' })
    ]));

    tiles.appendChild(el('div', { class: 'stat' }, [
      el('div', { class: 'stat-label', text: 'Closing payroll' }),
      el('div', { class: 'stat-value', text: U.moneyShort(agg.closingTotal) }),
      el('div', { class: 'stat-foot', text: 'Run rate at 31 March' })
    ]));

    tiles.appendChild(el('div', { class: 'stat' }, [
      el('div', { class: 'stat-label', text: 'Employees revised' }),
      el('div', { class: 'stat-value', text: agg.revisedCount.toLocaleString('en-IN') }),
      el('div', { class: 'stat-foot', text: agg.unrevisedCount.toLocaleString('en-IN') + ' not yet revised' })
    ]));

    tiles.appendChild(el('div', { class: 'stat' }, [
      el('div', { class: 'stat-label', text: 'Average increment' }),
      el('div', { class: 'stat-value', text: U.pct(agg.avgIncrementPct) }),
      el('div', { class: 'stat-foot', text: 'Median ' + U.pct(agg.medianIncrementPct) +
        (agg.maxIncrementPct === null ? '' : ' · high ' + U.pct(agg.maxIncrementPct)) })
    ]));

    return tiles;
  }

  /* The headline feature: employees revised more than once inside the year. */
  function multiRevisionCard(book, fy, agg) {
    var rows = agg.summaries
      .filter(function (item) { return item.summary.hasMultipleRevisions; })
      .sort(function (a, b) { return (b.summary.annualisedImpact || 0) - (a.summary.annualisedImpact || 0); });

    var card = el('section', { class: 'card', style: 'margin-top:16px' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h2', { class: 'card-title', text: 'Revised more than once in ' + fy }),
      el('span', { class: 'card-note', text:
        rows.length + ' employee' + (rows.length === 1 ? '' : 's') +
        ' · each revision is measured against the pay it replaced, not against April' })
    ]));

    card.appendChild(U.dataTable({
      pageSize: 8,
      sortKey: 'impact', sortDir: -1,
      onRowClick: function (r) { root.SRT.app.openEmployee(r.item.computed.employee.code); },
      columns: [
        { key: 'name', label: 'Employee', value: function (r) { return r.item.computed.employee.name; },
          render: function (r) {
            var e = r.item.computed.employee;
            return el('div', {}, [
              el('div', { style: 'font-weight:600', text: e.name }),
              el('div', { class: 'muted', style: 'font-size:11.5px',
                text: e.code + ' · ' + (e.department || '—') })
            ]);
          } },
        { key: 'steps', label: 'Revisions', sortable: false, render: function (r) {
          return el('div', { class: 'row', style: 'gap:6px' },
            r.item.summary.steps.map(function (st) {
              return el('span', {
                class: 'chip ' + (st.inEffect ? 'chip-count' : 'status-' + U.slug(st.approvalStatus)),
                title: st.revisionType + ' effective ' + U.dateLong(st.effectiveDate) +
                  ' · ' + U.money(st.fromCTC) + ' → ' + U.money(st.toCTC),
                text: U.dateLong(st.effectiveDate).replace(/ \d{4}$/, '') + ' ' + U.pct(st.pct)
              });
            }));
        } },
        { key: 'opening', label: 'Opening', numeric: true,
          value: function (r) { return r.item.summary.openingCTC; },
          render: function (r) { return U.money(r.item.summary.openingCTC); } },
        { key: 'closing', label: 'Closing', numeric: true,
          value: function (r) { return r.item.summary.closingCTC; },
          render: function (r) { return U.money(r.item.summary.closingCTC); } },
        { key: 'impact', label: 'Annualised', numeric: true,
          value: function (r) { return r.item.summary.annualisedImpact; },
          render: function (r) {
            return el('span', { class: 'delta-up', text: U.signed(r.item.summary.annualisedImpact) });
          } },
        { key: 'pct', label: 'Year %', numeric: true,
          value: function (r) { return r.item.summary.incrementPct; },
          render: function (r) { return U.pct(r.item.summary.incrementPct); } },
        { key: 'inyear', label: 'In-year cost', numeric: true,
          title: 'What this year actually costs, counting each revision from the month it takes effect',
          value: function (r) { return r.item.summary.inYearImpact; },
          render: function (r) { return U.money(r.item.summary.inYearImpact); } }
      ],
      rows: rows.map(function (item) { return { item: item }; })
    }));

    return card;
  }

  /* Monthly payroll run rate — makes mid-year revisions visible as steps. */
  function runRateCard(book, fy, agg) {
    var months = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
    var totals = new Array(12).fill(0);
    agg.summaries.forEach(function (item) {
      item.summary.monthlyCTC.forEach(function (v, i) { totals[i] += (v || 0) / 12; });
    });

    var points = totals.map(function (v, i) {
      return {
        label: months[i],
        fullLabel: months[i] + ' — monthly payroll',
        value: v,
        note: 'Annualised: ' + U.moneyShort(v * 12)
      };
    });

    var card = el('section', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h2', { class: 'card-title', text: 'Monthly payroll run rate' }),
      el('span', { class: 'card-note', text: 'Each step is a month where revisions took effect' })
    ]));
    card.appendChild(U.stepLine(points, { ariaLabel: 'Monthly payroll run rate across ' + fy }));
    card.appendChild(el('p', { class: 'card-note', style: 'margin:10px 0 0', text:
      'Total for the year ' + U.moneyShort(agg.inYearCost) + ' against a closing run rate of ' +
      U.moneyShort(agg.closingTotal) + '.' }));
    return card;
  }

  function distributionCard(agg) {
    var buckets = E.incrementHistogram(agg, 0.05);
    var card = el('section', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h2', { class: 'card-title', text: 'Increment distribution' }),
      el('span', { class: 'card-note', text: 'Employees by year-on-year increase' })
    ]));
    if (!buckets.length) {
      card.appendChild(el('p', { class: 'muted', text: 'No revisions with a comparable opening CTC yet.' }));
      return card;
    }
    card.appendChild(U.histogram(buckets, { ariaLabel: 'Distribution of increment percentages' }));
    return card;
  }

  function breakdownCard(title, groups) {
    var card = el('section', { class: 'card' });
    var max = Math.max.apply(null, groups.map(function (g) { return Math.abs(g.annualisedImpact); }).concat([1]));

    card.appendChild(el('div', { class: 'card-head' }, [
      el('h2', { class: 'card-title', text: title }),
      el('span', { class: 'card-note', text: 'Annualised increase' })
    ]));

    var data = groups
      .slice()
      .sort(function (a, b) { return b.annualisedImpact - a.annualisedImpact; })
      .map(function (g) {
        return {
          label: g.key,
          value: g.annualisedImpact,
          display: U.moneyShort(g.annualisedImpact),
          tooltip: '<strong>' + U.escapeHTML(g.key) + '</strong>' +
            g.revisedCount + ' of ' + g.headcount + ' revised · ' +
            g.revisionCount + ' revisions<br>' +
            U.moneyShort(g.openingTotal) + ' → ' + U.moneyShort(g.closingTotal) +
            ' (' + U.pct(g.annualisedPct) + ')<br>In-year cost impact ' + U.moneyShort(g.inYearImpact)
        };
      });

    card.appendChild(U.barChartH(data, { ariaLabel: title + ', annualised increase' }));

    // The table view that pairs with the chart, for exact figures.
    var details = el('details', { style: 'margin-top:12px' });
    details.appendChild(el('summary', { class: 'card-note', style: 'cursor:pointer', text: 'Show as table' }));
    details.appendChild(U.dataTable({
      pageSize: 20,
      columns: [
        { key: 'k', label: title.replace('By ', ''), value: function (g) { return g.key; } },
        { key: 'hc', label: 'Headcount', numeric: true, value: function (g) { return g.headcount; } },
        { key: 'rev', label: 'Revised', numeric: true, value: function (g) { return g.revisedCount; } },
        { key: 'multi', label: 'Multi-revision', numeric: true, value: function (g) { return g.multiRevisionCount; } },
        { key: 'open', label: 'Opening', numeric: true, value: function (g) { return g.openingTotal; },
          render: function (g) { return U.moneyShort(g.openingTotal); } },
        { key: 'close', label: 'Closing', numeric: true, value: function (g) { return g.closingTotal; },
          render: function (g) { return U.moneyShort(g.closingTotal); } },
        { key: 'imp', label: 'Annualised', numeric: true, value: function (g) { return g.annualisedImpact; },
          render: function (g) { return U.moneyShort(g.annualisedImpact); } },
        { key: 'pct', label: '%', numeric: true, value: function (g) { return g.annualisedPct; },
          render: function (g) { return U.pct(g.annualisedPct); } },
        { key: 'avg', label: 'Avg increment', numeric: true, value: function (g) { return g.avgIncrementPct; },
          render: function (g) { return U.pct(g.avgIncrementPct); } }
      ],
      rows: groups
    }));
    card.appendChild(details);
    return card;
  }

  function topMoversCard(agg) {
    var rows = agg.summaries
      .filter(function (i) { return i.summary.effectiveRevisionCount > 0 && i.summary.incrementPct !== null; })
      .sort(function (a, b) { return b.summary.incrementPct - a.summary.incrementPct; })
      .slice(0, 15);

    if (!rows.length) return el('div');

    var card = el('section', { class: 'card', style: 'margin-top:16px' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h2', { class: 'card-title', text: 'Largest increments' }),
      el('span', { class: 'card-note', text: 'Top 15 by year-on-year %' })
    ]));
    card.appendChild(U.dataTable({
      pageSize: 15,
      onRowClick: function (r) { root.SRT.app.openEmployee(r.summary ? r.computed.employee.code : ''); },
      columns: [
        { key: 'n', label: 'Employee', value: function (r) { return r.computed.employee.name; } },
        { key: 'd', label: 'Department', value: function (r) { return r.computed.employee.department; } },
        { key: 'g', label: 'Grade', value: function (r) { return r.computed.employee.grade; } },
        { key: 'c', label: 'Revisions', numeric: true, value: function (r) { return r.summary.revisionCount; } },
        { key: 'o', label: 'Opening', numeric: true, value: function (r) { return r.summary.openingCTC; },
          render: function (r) { return U.money(r.summary.openingCTC); } },
        { key: 'cl', label: 'Closing', numeric: true, value: function (r) { return r.summary.closingCTC; },
          render: function (r) { return U.money(r.summary.closingCTC); } },
        { key: 'p', label: 'Increase', numeric: true, value: function (r) { return r.summary.incrementPct; },
          render: function (r) {
            return el('span', { class: 'delta-up', text: U.pct(r.summary.incrementPct) });
          } }
      ],
      rows: rows
    }));
    return card;
  }

  root.SRT.views = root.SRT.views || {};
  root.SRT.views.dashboard = { render: render };
})(window);
