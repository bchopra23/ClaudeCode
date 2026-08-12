/* Salary Revision Tracker — shell, routing and overlays. */
(function (root) {
  'use strict';

  var U = root.SRT.ui, store = root.SRT.store;
  var el = U.el;

  var ROUTES = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'employees', label: 'Employees' },
    { id: 'revisions', label: 'Revisions' },
    { id: 'bulk', label: 'Bulk revision' },
    { id: 'data', label: 'Import & export' }
  ];

  var current = 'dashboard';
  var mount, nav, fySelect;

  function init() {
    store.load();

    mount = document.getElementById('view');
    nav = document.getElementById('nav');
    fySelect = document.getElementById('fy-select');

    ROUTES.forEach(function (r) {
      nav.appendChild(el('button', {
        type: 'button', dataset: { route: r.id },
        onclick: function () { go(r.id); }
      }, r.label));
    });

    fySelect.addEventListener('change', function (ev) {
      store.setUI({ fy: ev.target.value });
      render();
    });

    document.getElementById('save-btn').addEventListener('click', function () { save(); });

    // Ctrl/Cmd+S is what people reach for; intercept it rather than letting the
    // browser offer to save the page itself.
    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        save();
      }
    });

    // Only fires when a write actually failed — otherwise everything is already
    // on disk and closing the tab is safe.
    window.addEventListener('beforeunload', function (ev) {
      if (store.saveInfo().dirty) { ev.preventDefault(); ev.returnValue = ''; }
    });

    store.subscribe(function () { updateSaveStatus(); });
    setInterval(updateSaveStatus, 30000);

    document.getElementById('theme-toggle').addEventListener('click', function () {
      var order = ['system', 'light', 'dark'];
      var next = order[(order.indexOf(store.ui().theme || 'system') + 1) % order.length];
      store.setUI({ theme: next });
      U.toast('Theme: ' + next);
    });

    document.getElementById('scrim').addEventListener('click', function (ev) {
      if (ev.target === ev.currentTarget) closeOverlay();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeOverlay();
    });

    // Deep links (#employees) keep the browser Back button meaningful.
    window.addEventListener('hashchange', function () { go(routeFromHash(), true); });
    current = routeFromHash();

    refreshChrome();
    updateSaveStatus();
    render();
  }

  function routeFromHash() {
    var id = (location.hash || '').replace('#', '');
    return ROUTES.some(function (r) { return r.id === id; }) ? id : 'dashboard';
  }

  function go(route, fromHash) {
    current = route;
    if (!fromHash) location.hash = route;
    closeOverlay();
    render();
    window.scrollTo({ top: 0 });
  }

  function refreshChrome() {
    Array.prototype.forEach.call(nav.children, function (btn) {
      if (btn.dataset.route === current) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });

    var years = store.fiscalYears();
    U.clear(fySelect);
    years.forEach(function (fy) {
      fySelect.appendChild(el('option', { value: fy, selected: fy === store.ui().fy }, fy));
    });
  }

  /* --------------------------------------------------------------- saving */

  function save() {
    var res = store.saveNow();
    var info = store.saveInfo();
    if (res.ok) {
      U.toast('Saved to this device — ' + info.employees.toLocaleString('en-IN') +
        ' employees, ' + info.revisions.toLocaleString('en-IN') + ' revisions');
      var btn = document.getElementById('save-btn');
      btn.classList.add('just-saved');
      setTimeout(function () { btn.classList.remove('just-saved'); }, 2500);
    } else {
      U.toast(res.error, true);
    }
    updateSaveStatus();
  }

  function updateSaveStatus() {
    var btn = document.getElementById('save-btn');
    var status = document.getElementById('save-status');
    var label = document.getElementById('save-label');
    if (!btn) return;

    var info = store.saveInfo();
    btn.classList.toggle('is-dirty', info.dirty);

    if (info.dirty) {
      label.textContent = 'Retry save';
      status.textContent = 'not saved';
      btn.title = info.error;
      return;
    }
    label.textContent = 'Save';
    status.textContent = info.lastSavedAt ? relativeTime(info.lastSavedAt) : '';
    btn.title = info.lastSavedAt
      ? 'All changes are saved on this device. Last saved ' + new Date(info.lastSavedAt).toLocaleString() +
        '. Use Export for a copy you can share.'
      : 'Save to this device (Ctrl+S)';
  }

  function relativeTime(iso) {
    var secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 45) return 'saved just now';
    if (secs < 5400) return 'saved ' + Math.round(secs / 60) + 'm ago';
    if (secs < 86400) return 'saved ' + Math.round(secs / 3600) + 'h ago';
    return 'saved ' + new Date(iso).toLocaleDateString();
  }

  function render() {
    U.hideTooltip();
    U.clear(mount);
    refreshChrome();
    var view = root.SRT.views[current];
    if (view) view.render(mount);
  }

  /* --------------------------------------------------------------- overlays */

  function openOverlay(node, kind) {
    var scrim = document.getElementById('scrim');
    U.clear(scrim);
    scrim.appendChild(el('div', { class: kind, role: 'dialog', 'aria-modal': 'true' }, node));
    scrim.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeOverlay() {
    var scrim = document.getElementById('scrim');
    scrim.hidden = true;
    U.clear(scrim);
    document.body.style.overflow = '';
  }

  root.SRT.app = {
    init: init,
    go: go,
    refresh: render,
    refreshChrome: refreshChrome,
    openDrawer: function (node) { openOverlay(node, 'drawer'); },
    openModal: function (node) { openOverlay(node, 'modal'); },
    closeOverlay: closeOverlay,
    openEmployee: function (code) { root.SRT.views.employees.openEmployee(code); },
    addRevision: function (seed) { root.SRT.views.revisions.openForm(seed || {}); },
    editRevision: function (id) { root.SRT.views.revisions.openForm({}, id); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
