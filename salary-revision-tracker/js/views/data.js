/* Import & export — the spreadsheet bridge, plus settings and housekeeping. */
(function (root) {
  'use strict';

  var U = root.SRT.ui, IO = root.SRT.io, M = root.SRT.model, E = root.SRT.engine, store = root.SRT.store;
  var el = U.el;

  var importMode = 'merge';

  function render(mount) {
    var book = store.book();

    mount.appendChild(el('div', { class: 'view-head' }, [
      el('div', {}, [
        el('h1', { class: 'view-title', text: 'Import & export' }),
        el('p', { class: 'view-sub', text:
          'Everything is stored on this device only. Exports are how data leaves — nothing is uploaded anywhere.' })
      ])
    ]));

    mount.appendChild(el('div', { class: 'grid grid-2' }, [importCard(), exportCard(book)]));
    mount.appendChild(el('div', { class: 'grid grid-2', style: 'margin-top:16px' }, [
      settingsCard(), dangerCard(book)
    ]));
  }

  /* ------------------------------------------------------------------ import */

  function importCard() {
    var card = el('section', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' },
      el('h2', { class: 'card-title', text: 'Import' })));

    card.appendChild(el('p', { class: 'card-note', style: 'margin:0 0 12px' },
      'Accepts your existing Salary Revision Tracker workbook (Employee Master plus the ' +
      'per-year sheets), a workbook exported from here, or a CSV of employees or revisions.'));

    var modeBox = el('div', { class: 'checkbox-list', style: 'margin-bottom:12px' }, [
      radio('import-mode', 'merge', importMode === 'merge',
        'Merge — update matching records, add the rest', function () { importMode = 'merge'; }),
      radio('import-mode', 'replace', importMode === 'replace',
        'Replace — discard what is here and start from this file', function () { importMode = 'replace'; })
    ]);
    card.appendChild(modeBox);

    var input = el('input', {
      type: 'file', accept: '.xlsx,.xlsm,.csv,.tsv,.txt,.json', style: 'display:none',
      onchange: function (ev) { if (ev.target.files[0]) handleFile(ev.target.files[0]); ev.target.value = ''; }
    });

    var zone = el('div', { class: 'dropzone', tabindex: '0', role: 'button',
      onclick: function () { input.click(); },
      onkeydown: function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); } }
    }, [
      el('div', { style: 'font-weight:600; color:var(--ink)' }, 'Drop a file here, or click to choose'),
      el('div', { style: 'font-size:12.5px; margin-top:4px' }, '.xlsx · .csv · .json backup')
    ]);

    ['dragenter', 'dragover'].forEach(function (t) {
      zone.addEventListener(t, function (ev) { ev.preventDefault(); zone.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (t) {
      zone.addEventListener(t, function (ev) { ev.preventDefault(); zone.classList.remove('is-over'); });
    });
    zone.addEventListener('drop', function (ev) {
      if (ev.dataTransfer.files && ev.dataTransfer.files[0]) handleFile(ev.dataTransfer.files[0]);
    });

    card.appendChild(zone);
    card.appendChild(input);

    var report = el('div', { style: 'margin-top:12px' });
    card.appendChild(report);

    function handleFile(file) {
      U.clear(report);
      report.appendChild(el('p', { class: 'muted', text: 'Reading ' + file.name + '…' }));

      var reader = new FileReader();
      reader.onerror = function () {
        U.clear(report);
        U.toast('Could not read that file.', true);
      };
      reader.onload = function () {
        try {
          var stats, result;
          if (/\.json$/i.test(file.name)) {
            stats = store.fromJSON(
              typeof reader.result === 'string' ? reader.result : new TextDecoder().decode(reader.result),
              importMode);
            result = { report: { sheets: ['JSON backup'], notes: [], skipped: [] } };
          } else {
            result = IO.importWorkbook(reader.result, { type: 'array' });
            if (!result.employees.length && !result.revisions.length) {
              throw new Error('No employees or revisions were found in that file. ' +
                'Check that it has an "Employee Master" or "Revision Ledger" sheet.');
            }
            stats = store.applyImport(result, importMode);
          }
          showReport(report, file, result.report, stats);
          root.SRT.app.refreshChrome();
          U.toast('Imported ' + file.name);
        } catch (err) {
          U.clear(report);
          report.appendChild(el('ul', { class: 'messages' },
            el('li', { class: 'level-error', text: err.message || String(err) })));
          U.toast('Import failed', true);
        }
      };
      if (/\.json$/i.test(file.name)) reader.readAsText(file);
      else reader.readAsArrayBuffer(file);
    }

    return card;
  }

  function showReport(mount, file, rep, stats) {
    U.clear(mount);
    var lines = [];
    if (stats.employeesAdded) lines.push(stats.employeesAdded.toLocaleString('en-IN') + ' employees added');
    if (stats.employeesUpdated) lines.push(stats.employeesUpdated.toLocaleString('en-IN') + ' employees updated');
    if (stats.revisionsAdded) lines.push(stats.revisionsAdded.toLocaleString('en-IN') + ' revisions added');
    if (stats.revisionsUpdated) lines.push(stats.revisionsUpdated.toLocaleString('en-IN') + ' revisions updated');
    if (!lines.length) lines.push('Nothing changed');

    mount.appendChild(el('div', { class: 'card', style: 'background:var(--surface-sunken)' }, [
      el('div', { style: 'font-weight:600; margin-bottom:6px', text: file.name }),
      el('div', { text: lines.join(' · ') }),
      rep.sheets && rep.sheets.length
        ? el('div', { class: 'muted', style: 'font-size:12.5px; margin-top:4px',
            text: 'Sheets read: ' + rep.sheets.join(', ') })
        : null,
      (rep.notes || []).length
        ? el('ul', { class: 'messages' }, rep.notes.map(function (n) { return el('li', { text: n }); }))
        : null,
      (rep.skipped || []).length
        ? el('ul', { class: 'messages' }, [
            el('li', { class: 'level-warning', text: rep.skipped.length + ' rows skipped' }),
            el('li', { text: rep.skipped.slice(0, 8).join(' · ') })
          ])
        : null,
      store.canUndoImport()
        ? el('button', { class: 'btn btn-sm', style: 'margin-top:10px', onclick: function () {
            store.undoImport();
            root.SRT.app.refresh();
            U.toast('Import undone');
          } }, 'Undo this import')
        : null
    ]));
  }

  /* ------------------------------------------------------------------ export */

  function exportCard(book) {
    var card = el('section', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' },
      el('h2', { class: 'card-title', text: 'Export' })));

    card.appendChild(el('p', { class: 'card-note', style: 'margin:0 0 10px' },
      'Three sheets: every revision, a line per employee, and department totals. ' +
      'Filters and frozen headers are already set up.'));

    /* Read at click time, not when the card was built — otherwise an import
     * that adds a new year leaves this list stale and quietly drops it. */
    function chosenYears() {
      var present = store.book().fiscalYears;
      return present.length ? present : [store.ui().fy];
    }

    /* Building a workbook is synchronous and takes a few seconds at full scale,
     * so the button reports progress rather than appearing to hang. */
    function exportWorkbook(btn, builder, filename, label) {
      btn.disabled = true;
      btn.textContent = 'Building…';
      setTimeout(function () {
        try {
          var data = IO.writeWorkbook(builder(store.book(), { fiscalYears: chosenYears() }));
          U.download(filename, new Blob([data], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
          U.toast('Spreadsheet downloaded');
        } catch (err) {
          U.toast('Export failed: ' + err.message, true);
        }
        btn.disabled = false;
        btn.textContent = label;
      }, 30);
    }

    card.appendChild(el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn btn-primary', onclick: function (ev) {
        exportWorkbook(ev.target, IO.buildSimpleWorkbook,
          'Salary Revisions ' + stamp() + '.xlsx', 'Download spreadsheet');
      } }, 'Download spreadsheet'),

      el('button', { class: 'btn', onclick: function () {
        U.download('Salary Revisions ' + stamp() + '.csv',
          IO.ledgerCSV(store.book()), 'text/csv;charset=utf-8');
        U.toast('CSV downloaded');
      } }, 'As CSV instead')
    ]));

    /* Everything else is real but rarely needed, so it stays folded away. */
    var more = el('details', { style: 'margin-top:14px' });
    more.appendChild(el('summary', { class: 'card-note', style: 'cursor:pointer' },
      'Other formats'));
    more.appendChild(el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
      el('button', { class: 'btn btn-sm', title:
        'Adds a read-me, a sheet per year with each revision spread across columns, ' +
        'a consolidated view and a summary. Use this when you need the full audit trail.',
        onclick: function (ev) {
          exportWorkbook(ev.target, IO.buildWorkbook,
            'Salary Revisions - detailed ' + stamp() + '.xlsx', 'Detailed workbook');
        } }, 'Detailed workbook'),

      el('button', { class: 'btn btn-sm', onclick: function () {
        U.download('Employees ' + stamp() + '.csv', IO.masterCSV(store.book()), 'text/csv;charset=utf-8');
        U.toast('CSV downloaded');
      } }, 'Employee list (.csv)'),

      el('button', { class: 'btn btn-sm', title: 'An exact copy of everything, for archiving',
        onclick: function () {
          U.download('backup ' + stamp() + '.json', store.toJSON(), 'application/json');
          U.toast('Backup saved');
        } }, 'Backup (.json)'),

      el('button', { class: 'btn btn-sm', title: 'An empty sheet for collecting revisions offline',
        onclick: function () {
          U.download('revision-import-template.csv', IO.blankLedgerCSV(), 'text/csv;charset=utf-8');
        } }, 'Blank template')
    ]));
    card.appendChild(more);

    return card;
  }

  /* ---------------------------------------------------------------- settings */

  function settingsCard() {
    var card = el('section', { class: 'card' });
    var settings = store.settings();

    card.appendChild(el('div', { class: 'card-head' },
      el('h2', { class: 'card-title', text: 'Policy' })));

    card.appendChild(el('p', { class: 'card-note', style: 'margin:0 0 10px' },
      'Which approval statuses actually move an employee\'s pay. Anything unticked is still ' +
      'recorded and reported, but never becomes the base for the next revision.'));

    card.appendChild(el('div', { class: 'checkbox-list' }, M.APPROVAL_STATUSES.map(function (s) {
      return el('label', {}, [
        el('input', { type: 'checkbox', checked: settings.effectiveStatuses.indexOf(s) >= 0,
          onchange: function (ev) {
            var next = store.settings().effectiveStatuses.slice();
            if (ev.target.checked) { if (next.indexOf(s) < 0) next.push(s); }
            else next = next.filter(function (x) { return x !== s; });
            store.updateSettings({ effectiveStatuses: next });
            root.SRT.app.refresh();
          } }),
        s
      ]);
    })));

    card.appendChild(el('div', { class: 'field', style: 'margin-top:14px' }, [
      el('label', {}, ['Mid-year proration',
        el('span', { class: 'hint', text: ' — how in-year cost is spread' })]),
      (function () {
        var sel = el('select', { onchange: function (ev) {
          store.updateSettings({ prorationBasis: ev.target.value });
          root.SRT.app.refresh();
        } });
        [['month', 'Whole calendar months (matches payroll)'],
         ['day', 'Exact days']].forEach(function (p) {
          sel.appendChild(el('option', { value: p[0], selected: settings.prorationBasis === p[0] }, p[1]));
        });
        return sel;
      })()
    ]));

    card.appendChild(el('div', { class: 'field', style: 'margin-top:14px' }, [
      el('label', { text: 'Appearance' }),
      (function () {
        var sel = el('select', { onchange: function (ev) { store.setUI({ theme: ev.target.value }); } });
        [['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].forEach(function (p) {
          sel.appendChild(el('option', { value: p[0], selected: store.ui().theme === p[0] }, p[1]));
        });
        return sel;
      })()
    ]));

    return card;
  }

  /* ----------------------------------------------------------------- danger */

  function dangerCard(book) {
    var card = el('section', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' },
      el('h2', { class: 'card-title', text: 'Stored on this device' })));

    var rows = E.ledgerRows(book);
    card.appendChild(el('dl', { class: 'kv' }, [
      kv('Employees', book.list.length.toLocaleString('en-IN')),
      kv('Revisions', rows.length.toLocaleString('en-IN')),
      kv('Fiscal years', book.fiscalYears.join(', ') || '—'),
      kv('Approx. size', approxSize())
    ]));

    if (book.orphanRevisions.length) {
      card.appendChild(el('ul', { class: 'messages' },
        el('li', { class: 'level-warning', text: book.orphanRevisions.length +
          ' revision(s) reference an employee code that is not in the master, so they are ' +
          'excluded from every total. Import the matching employees to bring them in.' })));
    }

    card.appendChild(el('div', { class: 'btn-row', style: 'margin-top:14px' }, [
      el('button', { class: 'btn btn-danger', onclick: function () {
        if (!confirm('Delete all employees and revisions from this device?\n\n' +
            'Export a backup first if you might need this data.')) return;
        store.clearAll();
        root.SRT.app.refresh();
        U.toast('All data cleared');
      } }, 'Clear all data')
    ]));

    return card;
  }

  function approxSize() {
    try {
      var bytes = 0;
      ['srt_employees_v1', 'srt_revisions_v1'].forEach(function (k) {
        bytes += (localStorage.getItem(k) || '').length;
      });
      return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
    } catch (e) { return '—'; }
  }

  /* ------------------------------------------------------------- utilities */

  function stamp() { return new Date().toISOString().slice(0, 10); }

  function kv(label, value) {
    return el('div', {}, [el('dt', { text: label }), el('dd', { text: value })]);
  }

  function radio(name, value, checked, label, onchange) {
    return el('label', {}, [
      el('input', { type: 'radio', name: name, value: value, checked: checked,
        onchange: function (ev) { if (ev.target.checked) onchange(); } }),
      label
    ]);
  }

  root.SRT.views = root.SRT.views || {};
  root.SRT.views.data = { render: render };
})(window);
