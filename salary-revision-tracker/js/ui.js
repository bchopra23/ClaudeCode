/* Salary Revision Tracker — formatting, DOM helpers, tables and charts. */
(function (root) {
  'use strict';

  var M = root.SRT.model;

  /* ------------------------------------------------------------ formatting */

  var inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  var inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

  /* Indian digit grouping: 12,34,567 rather than 1,234,567. */
  function money(v, opts) {
    if (v === null || v === undefined || v === '') return '—';
    var n = Number(v);
    if (!isFinite(n)) return '—';
    return (opts && opts.noSymbol ? '' : '₹') + inr.format(Math.round(n));
  }

  /* Compact Indian scale for headline figures: thousand → lakh → crore. */
  function moneyShort(v) {
    if (v === null || v === undefined || v === '') return '—';
    var n = Number(v);
    if (!isFinite(n)) return '—';
    var sign = n < 0 ? '-' : '';
    var a = Math.abs(n);
    if (a >= 10000000) return sign + '₹' + inr2.format(round(a / 10000000, 2)) + ' Cr';
    if (a >= 100000) return sign + '₹' + inr2.format(round(a / 100000, 2)) + ' L';
    if (a >= 1000) return sign + '₹' + inr.format(Math.round(a / 1000)) + 'K';
    return sign + '₹' + inr.format(Math.round(a));
  }

  function round(n, dp) { var f = Math.pow(10, dp); return Math.round(n * f) / f; }

  function pct(v, dp) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v * 100).toFixed(dp === undefined ? 1 : dp) + '%';
  }

  function signed(v, formatter) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var f = (formatter || money)(Math.abs(v));
    return (v < 0 ? '−' : v > 0 ? '+' : '') + f;
  }

  function dateLong(iso) {
    var d = M.toDate(iso);
    if (!d) return '—';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getUTCDate() + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* ------------------------------------------------------------ DOM helpers */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    });
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === null || children === undefined || children === false) return node;
    if (Array.isArray(children)) {
      children.forEach(function (c) { append(node, c); });
      return node;
    }
    node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  function svgEl(tag, attrs, children) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] === null || attrs[k] === undefined || attrs[k] === false) return;
      if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (Array.isArray(children) ? children : (children ? [children] : [])).forEach(function (c) {
      node.appendChild(c);
    });
    return node;
  }

  function statusChip(status) {
    return el('span', { class: 'chip status-' + slug(status), text: status });
  }

  function emptyState(title, message, action) {
    return el('div', { class: 'empty-state' }, [
      el('h3', { text: title }),
      el('p', { text: message }),
      action || null
    ]);
  }

  /* ---------------------------------------------------------------- tables
   * A sortable, virtualised-enough table. Rows beyond `pageSize` are rendered
   * on demand via a "show more" button — 1,160 employees × 20 columns is enough
   * DOM to feel slow if rendered blindly.
   */
  function dataTable(opts) {
    var columns = opts.columns;
    var rows = opts.rows.slice();
    var sortKey = opts.sortKey || null;
    var sortDir = opts.sortDir || 1;
    var pageSize = opts.pageSize || 100;
    var shown = pageSize;

    var wrap = el('div', { class: 'table-wrap' });
    var table = el('table', { class: 'data' });
    var thead = el('thead');
    var tbody = el('tbody');
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);

    var footer = el('div', { class: 'row', style: 'margin-top:10px' });
    var container = el('div', {}, [wrap, footer]);

    function sortedRows() {
      if (!sortKey) return rows;
      var col = columns.filter(function (c) { return c.key === sortKey; })[0];
      if (!col) return rows;
      var get = col.sortValue || col.value;
      return rows.slice().sort(function (a, b) {
        var va = get(a), vb = get(b);
        var na = (va === null || va === undefined || va === '');
        var nb = (vb === null || vb === undefined || vb === '');
        if (na && nb) return 0;
        if (na) return 1;          // blanks always sink, regardless of direction
        if (nb) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
        return String(va).localeCompare(String(vb)) * sortDir;
      });
    }

    function renderHead() {
      clear(thead);
      var tr = el('tr');
      columns.forEach(function (col) {
        var th = el('th', {
          class: (col.numeric ? 'num ' : '') + (col.sortable === false ? 'no-sort' : ''),
          title: col.title || col.label
        }, col.label);
        if (col.sortable !== false) {
          th.addEventListener('click', function () {
            if (sortKey === col.key) sortDir = -sortDir;
            else { sortKey = col.key; sortDir = col.numeric ? -1 : 1; }
            renderHead(); renderBody();
          });
          if (sortKey === col.key) {
            th.appendChild(el('span', { class: 'sort-caret', text: sortDir > 0 ? '▲' : '▼' }));
          }
        }
        tr.appendChild(th);
      });
      thead.appendChild(tr);
    }

    function renderBody() {
      clear(tbody);
      clear(footer);
      var list = sortedRows();
      var slice = list.slice(0, shown);

      slice.forEach(function (row) {
        var tr = el('tr', { class: opts.onRowClick ? 'is-clickable' : '' });
        if (opts.onRowClick) {
          tr.addEventListener('click', function (ev) {
            if (ev.target.closest('button, a, input, select')) return;
            opts.onRowClick(row);
          });
        }
        columns.forEach(function (col) {
          var td = el('td', { class: (col.numeric ? 'num ' : '') + (col.wrap ? 'wrap' : '') });
          var content = col.render ? col.render(row) : col.value(row);
          if (content instanceof Node) td.appendChild(content);
          else td.textContent = (content === null || content === undefined || content === '')
            ? '—' : String(content);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });

      footer.appendChild(el('span', { class: 'muted', text:
        list.length === 0 ? 'No rows'
          : 'Showing ' + Math.min(shown, list.length).toLocaleString('en-IN') +
            ' of ' + list.length.toLocaleString('en-IN') }));
      if (shown < list.length) {
        footer.appendChild(el('button', {
          class: 'btn btn-sm',
          onclick: function () { shown += pageSize * 4; renderBody(); }
        }, 'Show more'));
        footer.appendChild(el('button', {
          class: 'btn btn-sm',
          onclick: function () { shown = list.length; renderBody(); }
        }, 'Show all'));
      }
      if (opts.footerExtra) footer.appendChild(opts.footerExtra());
    }

    renderHead();
    renderBody();

    container.update = function (nextRows) {
      rows = nextRows.slice();
      shown = pageSize;
      renderBody();
    };
    return container;
  }

  /* ---------------------------------------------------------------- charts
   * All charts here are single-series magnitude charts, so they use one hue and
   * need no legend — the card title names the measure. Every mark carries a
   * hover tooltip, and each chart is paired with a table elsewhere in the view.
   */

  var tooltip = null;
  function ensureTooltip() {
    if (!tooltip) {
      tooltip = el('div', { class: 'chart-tooltip', hidden: true, role: 'status' });
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }

  function showTooltip(ev, html) {
    var t = ensureTooltip();
    t.innerHTML = html;
    t.hidden = false;
    var pad = 12;
    var rect = t.getBoundingClientRect();
    var x = Math.min(ev.clientX + pad, window.innerWidth - rect.width - 8);
    var y = ev.clientY - rect.height - pad;
    if (y < 8) y = ev.clientY + pad;
    t.style.left = Math.max(8, x) + 'px';
    t.style.top = y + 'px';
  }

  function hideTooltip() { if (tooltip) tooltip.hidden = true; }

  function attachTooltip(node, htmlFn) {
    node.addEventListener('mousemove', function (ev) { showTooltip(ev, htmlFn()); });
    node.addEventListener('mouseleave', hideTooltip);
  }

  /* Horizontal bars — the right form when category labels are long, which
   * department names are. */
  function barChartH(data, opts) {
    opts = opts || {};
    var rowH = 26, gap = 8, labelW = opts.labelWidth || 150, valueW = 88;
    var height = data.length * (rowH + gap) + 6;
    var width = opts.width || 640;
    var plotW = Math.max(60, width - labelW - valueW);
    var max = Math.max.apply(null, data.map(function (d) { return Math.abs(d.value) || 0; }).concat([1]));

    var svg = svgEl('svg', {
      class: 'chart', viewBox: '0 0 ' + width + ' ' + height,
      preserveAspectRatio: 'xMinYMin meet', height: height, role: 'img',
      'aria-label': opts.ariaLabel || 'Bar chart'
    });

    data.forEach(function (d, i) {
      var y = i * (rowH + gap) + 3;
      var w = max ? Math.max(2, (Math.abs(d.value) / max) * plotW) : 2;

      svg.appendChild(svgEl('text', {
        class: 'axis-label', x: labelW - 10, y: y + rowH / 2 + 4,
        'text-anchor': 'end', text: truncate(d.label, 22)
      }));
      // 4px rounded data-end, anchored to the baseline at x = labelW.
      svg.appendChild(svgEl('rect', {
        class: 'bar-track', x: labelW, y: y + 6, width: plotW, height: rowH - 12, rx: 4
      }));
      var bar = svgEl('rect', {
        class: 'bar', x: labelW, y: y + 4, width: w, height: rowH - 8, rx: 4
      });
      svg.appendChild(bar);
      svg.appendChild(svgEl('text', {
        class: 'value-label', x: labelW + plotW + 8, y: y + rowH / 2 + 4, text: d.display
      }));

      var hit = svgEl('rect', { class: 'hit', x: 0, y: y, width: width, height: rowH });
      svg.appendChild(hit);
      attachTooltip(hit, function () { return d.tooltip || ('<strong>' + escapeHTML(d.label) + '</strong>' + d.display); });
    });

    svg.appendChild(svgEl('line', {
      class: 'baseline', x1: labelW, y1: 0, x2: labelW, y2: height
    }));
    return svg;
  }

  /* Histogram of increment %, so the shape of a cycle is visible at a glance. */
  function histogram(buckets, opts) {
    opts = opts || {};
    var width = opts.width || 640, height = opts.height || 190;
    var padL = 34, padB = 26, padT = 10, padR = 6;
    var plotW = width - padL - padR, plotH = height - padB - padT;
    var max = Math.max.apply(null, buckets.map(function (b) { return b.count; }).concat([1]));
    var bw = plotW / Math.max(buckets.length, 1);

    var svg = svgEl('svg', {
      class: 'chart', viewBox: '0 0 ' + width + ' ' + height,
      preserveAspectRatio: 'xMinYMin meet', height: height, role: 'img',
      'aria-label': opts.ariaLabel || 'Distribution of increment percentages'
    });

    [0, 0.5, 1].forEach(function (f) {
      var y = padT + plotH - f * plotH;
      svg.appendChild(svgEl('line', { class: 'gridline', x1: padL, y1: y, x2: width - padR, y2: y }));
      svg.appendChild(svgEl('text', {
        class: 'axis-label', x: padL - 7, y: y + 4, 'text-anchor': 'end',
        text: String(Math.round(f * max))
      }));
    });

    buckets.forEach(function (b, i) {
      var h = (b.count / max) * plotH;
      var x = padL + i * bw;
      // 2px surface gap between adjacent fills.
      var bar = svgEl('rect', {
        class: 'bar', x: x + 1, y: padT + plotH - h, width: Math.max(1, bw - 2),
        height: Math.max(b.count ? 2 : 0, h), rx: 4
      });
      svg.appendChild(bar);

      if (buckets.length <= 12 || i % 2 === 0) {
        svg.appendChild(svgEl('text', {
          class: 'axis-label', x: x + bw / 2, y: height - 8, 'text-anchor': 'middle',
          text: Math.round(b.from * 100) + '%'
        }));
      }
      var hit = svgEl('rect', { class: 'hit', x: x, y: padT, width: bw, height: plotH });
      svg.appendChild(hit);
      attachTooltip(hit, function () {
        return '<strong>' + Math.round(b.from * 100) + '% to ' + Math.round(b.to * 100) + '%</strong>' +
          b.count + ' employee' + (b.count === 1 ? '' : 's');
      });
    });

    svg.appendChild(svgEl('line', {
      class: 'baseline', x1: padL, y1: padT + plotH, x2: width - padR, y2: padT + plotH
    }));
    return svg;
  }

  /* Monthly payroll run-rate across a fiscal year. A step line, because pay does
   * not drift between revisions — it jumps on an effective date and holds. */
  function stepLine(points, opts) {
    opts = opts || {};
    var width = opts.width || 640, height = opts.height || 190;
    var padL = 52, padB = 24, padT = 12, padR = 10;
    var plotW = width - padL - padR, plotH = height - padB - padT;
    var values = points.map(function (p) { return p.value || 0; });
    var max = Math.max.apply(null, values.concat([1]));
    var min = Math.min.apply(null, values);
    var lo = Math.min(min, max * 0.92), span = (max - lo) || 1;
    var stepW = plotW / points.length;

    var svg = svgEl('svg', {
      class: 'chart', viewBox: '0 0 ' + width + ' ' + height,
      preserveAspectRatio: 'xMinYMin meet', height: height, role: 'img',
      'aria-label': opts.ariaLabel || 'Monthly payroll run rate'
    });

    [0, 0.5, 1].forEach(function (f) {
      var y = padT + plotH - f * plotH;
      svg.appendChild(svgEl('line', { class: 'gridline', x1: padL, y1: y, x2: width - padR, y2: y }));
      svg.appendChild(svgEl('text', {
        class: 'axis-label', x: padL - 7, y: y + 4, 'text-anchor': 'end',
        text: moneyShort(lo + f * span)
      }));
    });

    var d = '';
    points.forEach(function (p, i) {
      var x0 = padL + i * stepW, x1 = x0 + stepW;
      var y = padT + plotH - (((p.value || 0) - lo) / span) * plotH;
      d += (i === 0 ? 'M' + x0 + ' ' + y : 'L' + x0 + ' ' + y) + 'L' + x1 + ' ' + y;
      if (i % 2 === 0) {
        svg.appendChild(svgEl('text', {
          class: 'axis-label', x: x0 + stepW / 2, y: height - 7, 'text-anchor': 'middle',
          text: p.label
        }));
      }
      var hit = svgEl('rect', { class: 'hit', x: x0, y: padT, width: stepW, height: plotH });
      svg.appendChild(hit);
      attachTooltip(hit, function () {
        return '<strong>' + escapeHTML(p.fullLabel || p.label) + '</strong>' +
          money(p.value) + (p.note ? '<br>' + escapeHTML(p.note) : '');
      });
    });

    svg.appendChild(svgEl('path', { class: 'series-line', d: d }));
    svg.appendChild(svgEl('line', {
      class: 'baseline', x1: padL, y1: padT + plotH, x2: width - padR, y2: padT + plotH
    }));
    return svg;
  }

  function cellBar(fraction) {
    var outer = el('span', { class: 'cell-bar' });
    outer.appendChild(el('span', {
      style: 'width:' + Math.max(0, Math.min(1, fraction || 0)) * 100 + '%'
    }));
    return outer;
  }

  function truncate(s, n) {
    s = String(s === null || s === undefined ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function escapeHTML(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* --------------------------------------------------------------- download */

  function download(filename, data, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var toastTimer = null;
  function toast(message, isError) {
    var node = document.getElementById('toast');
    node.textContent = message;
    node.className = 'toast' + (isError ? ' is-error' : '');
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, isError ? 8000 : 4000);
  }

  root.SRT.ui = {
    money: money, moneyShort: moneyShort, pct: pct, signed: signed,
    dateLong: dateLong, slug: slug, ordinal: ordinal, truncate: truncate, escapeHTML: escapeHTML,
    el: el, append: append, clear: clear, svgEl: svgEl,
    statusChip: statusChip, emptyState: emptyState, dataTable: dataTable,
    barChartH: barChartH, histogram: histogram, stepLine: stepLine, cellBar: cellBar,
    hideTooltip: hideTooltip,
    download: download, toast: toast
  };
})(window);
