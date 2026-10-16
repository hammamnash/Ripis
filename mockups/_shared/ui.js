/* Ripis mockup — chrome: theme, mockup bar, toast, sheet, picker, date grid,
   swipe, context menu. Markup follows the class contract in the shared CSS;
   show/hide is driven by [data-open] so the 240ms transitions run. */
(function () {
  'use strict';
  var R = window.RIPIS;
  var root = document.documentElement;

  /* ---- theme: light | dark | auto, sticky across the three screens -------- */
  var KEY = 'ripis-mockup-theme';
  function readTheme() {
    var q = new URLSearchParams(location.search).get('theme');
    if (q) { try { sessionStorage.setItem(KEY, q); } catch (e) {} return q; }
    try { return sessionStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; }
  }
  function applyTheme(mode) {
    var m = mode || readTheme();
    var dark = m === 'dark' || (m === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-set]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === m));
    });
    Array.prototype.forEach.call(document.querySelectorAll('a[href*=".html"]'), function (a) {
      var h = a.getAttribute('href');
      if (h.indexOf('theme=') < 0) { a.setAttribute('href', h + (h.indexOf('?') > -1 ? '&' : '?') + 'theme=' + m); }
    });
  }

  /* ---- mockup bar. Not part of the app; uses no brand token. -------------- */
  function mkbar(screen, screens) {
    return '<div class="mkbar"><span class="mkbar__tag">mockup</span>' +
      screens.map(function (s) {
        return '<a href="' + s.href + '"' + (s.id === screen ? ' aria-current="true"' : '') + '>' + s.name + '</a>';
      }).join('') +
      '<span class="mkbar__spacer"></span><span class="mkbar__note">theme</span>' +
      ['light', 'dark', 'auto'].map(function (m) {
        return '<button type="button" data-theme-set="' + m + '">' + m + '</button>';
      }).join('') + '</div>';
  }

  /* ---- toast: inverted, above the tab bar, 4s ---------------------------- */
  function toast(msg, actionLabel, onAction) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.innerHTML = '<span class="toast__msg">' + msg + '</span>' +
      (actionLabel ? '<button class="toast__action" type="button">' + actionLabel + '</button>' : '');
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.setAttribute('data-open', 'true'); });
    if (actionLabel) {
      t.querySelector('.toast__action').addEventListener('click', function () {
        if (onAction) { onAction(); }
        hide();
      });
    }
    var t1 = setTimeout(hide, 4000);
    function hide() {
      clearTimeout(t1);
      t.removeAttribute('data-open');
      setTimeout(function () { t.remove(); }, 240);
    }
    return t;
  }

  /* ---- bottom sheet ------------------------------------------------------ */
  var open = null;
  function closeSheet() {
    if (!open) { return; }
    var s = open;
    open = null;
    s.scrim.removeAttribute('data-open');
    s.panel.removeAttribute('data-open');
    document.removeEventListener('keydown', onEsc);
    setTimeout(function () { s.scrim.remove(); s.panel.remove(); }, 240);
  }
  function onEsc(e) { if (e.key === 'Escape') { closeSheet(); } }
  function sheet(title, body, actions) {
    closeSheet();
    var scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.addEventListener('click', closeSheet);
    var panel = document.createElement('div');
    panel.className = 'sheet';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', title);
    panel.innerHTML = '<span class="sheet__handle"></span>' +
      '<h2 class="sheet__title row-between">' + title +
        '<button class="icon-btn" type="button" data-close aria-label="Close">' +
          window.RIPIS_ICON('x') + '</button></h2>' +
      body + (actions ? '<div class="sheet__row">' + actions + '</div>' : '');
    document.body.appendChild(scrim);
    document.body.appendChild(panel);
    requestAnimationFrame(function () {
      scrim.setAttribute('data-open', 'true');
      panel.setAttribute('data-open', 'true');
    });
    Array.prototype.forEach.call(panel.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', closeSheet);
    });
    open = { scrim: scrim, panel: panel };
    document.addEventListener('keydown', onEsc);
    return panel;
  }

  /* ---- picker: a Bottom Sheet of rows, never a native <select> ----------- */
  function picker(o) {
    var body = (o.search ? '<div class="sheet__search"><input class="input" type="search" placeholder="' +
        (o.searchHint || 'Search') + '" aria-label="' + (o.searchHint || 'Search') + '"></div>' : '') +
      '<div class="sheet__list">' + o.options.map(function (x) {
        return '<button class="sheet__opt" type="button" data-v="' + x.value + '"' +
          (x.value === o.value ? ' aria-selected="true"' : '') + '>' +
          (x.colour ? '<span class="picker__dot" style="background:' + x.colour + '"></span>' : '') +
          (x.icon ? '<span class="txn__icon" aria-hidden="true">' + window.RIPIS_ICON(x.icon, 16) + '</span>' : '') +
          '<span class="sheet__opt-name">' + x.label + '</span>' +
          (x.meta ? '<span class="sheet__opt-meta">' + x.meta + '</span>' : '') +
          (x.value === o.value ? '<span class="sheet__check">' + window.RIPIS_ICON('check', 18) + '</span>' : '') +
          '</button>';
      }).join('') + '</div>';
    var panel = sheet(o.title, body);
    function bindFilter() {
      var box = panel.querySelector('.sheet__search input');
      if (!box) { return; }
      box.addEventListener('input', function () {
        var q = box.value.toLowerCase();
        Array.prototype.forEach.call(panel.querySelectorAll('.sheet__opt'), function (b) {
          b.hidden = q !== '' && b.textContent.toLowerCase().indexOf(q) < 0;
        });
      });
    }
    bindFilter();
    Array.prototype.forEach.call(panel.querySelectorAll('[data-v]'), function (b) {
      b.addEventListener('click', function () {
        o.onPick(b.getAttribute('data-v'));
        if (!o.keepOpen) { closeSheet(); }
      });
    });
    return panel;
  }

  /* ---- date sheet: dd/mm/yyyy (§8, ADR-0026) ----------------------------- */
  function datePicker(o) {
    var cur = o.ym || (o.value || R.TODAY).slice(0, 7);
    function grid(ym) {
      var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
      var lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
      var days = new Date(y, m, 0).getDate();
      var cells = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (w) {
        return '<span class="dategrid__dow">' + w + '</span>';
      }).join('');
      for (var i = 0; i < lead; i++) { cells += '<span></span>'; }
      for (var d = 1; d <= days; d++) {
        var iso = ym + '-' + (d < 10 ? '0' + d : d);
        cells += '<button class="dategrid__day" type="button" data-iso="' + iso + '"' +
          (iso === o.value ? ' aria-selected="true"' : '') + '>' + d + '</button>';
      }
      return '<div class="dategrid__head">' +
          '<button class="monthsel__btn" type="button" data-mv="-1" aria-label="Previous month">' +
            window.RIPIS_ICON('left', 20) + '</button>' +
          '<span class="monthsel__label">' + R.monthLabel(ym) + '</span>' +
          '<button class="monthsel__btn" type="button" data-mv="1" aria-label="Next month">' +
            window.RIPIS_ICON('right', 20) + '</button></div>' +
        '<div class="dategrid">' + cells + '</div>';
    }
    var panel = sheet(o.title || 'Date', '<div data-gridwrap>' + grid(cur) + '</div>' +
      '<p class="field__hint">Stored as a calendar day (ADR-0007), shown dd/mm/yyyy.</p>');
    function bind() {
      Array.prototype.forEach.call(panel.querySelectorAll('[data-iso]'), function (b) {
        b.addEventListener('click', function () { o.onPick(b.getAttribute('data-iso')); closeSheet(); });
      });
      Array.prototype.forEach.call(panel.querySelectorAll('[data-mv]'), function (b) {
        b.addEventListener('click', function () {
          cur = b.getAttribute('data-mv') === '-1' ? R.prevMonth(cur) : R.nextMonth(cur);
          panel.querySelector('[data-gridwrap]').innerHTML = grid(cur);
          bind();
        });
      });
    }
    bind();
    return panel;
  }

  /* ---- the app's nav: one place, so the three screens cannot drift -------- */
  var SCREENS = [
    { id: 'dashboard', name: 'Dashboard', icon: 'dashboard', href: '../003-dashboard/index.html' },
    { id: 'transactions', name: 'Transactions', icon: 'list', href: '../001-transactions-list/index.html' },
    { id: 'budgets', name: 'Budgets', icon: 'chart', href: null },
    { id: 'wallets', name: 'Wallets', icon: 'wallet', href: null },
    { id: 'settings', name: 'Settings', icon: 'gear', href: null }
  ];
  function tabbar(active) {
    return SCREENS.map(function (s) {
      var inner = window.RIPIS_ICON(s.icon, 24) +
        '<span class="tabbar__label">' + s.name + '</span>';
      if (!s.href) {
        return '<button class="tabbar__item" type="button" data-missing="' + s.name + '">' + inner + '</button>';
      }
      return '<a class="tabbar__item" href="' + s.href + '"' +
        (s.id === active ? ' aria-current="page"' : '') + '>' + inner + '</a>';
    }).join('');
  }
  function bindMissing(scope) {
    Array.prototype.forEach.call(scope.querySelectorAll('[data-missing]'), function (b) {
      b.addEventListener('click', function () {
        toast(b.getAttribute('data-missing') + ' is not part of this mockup \u2014 three screens only.');
      });
    });
  }
  function fab(href, label) {
    return '<a class="fab" href="' + href + '" aria-label="' + label + '">' +
      window.RIPIS_ICON('plus', 26) + '</a>';
  }

  /* ---- swipe-left reveal + long-press context menu (§5, §6) -------------- */
  function ctxmenu(x, y, items) {
    var old = document.querySelector('.ctxmenu');
    if (old) { old.remove(); }
    var el = document.createElement('div');
    el.className = 'ctxmenu';
    el.setAttribute('role', 'menu');
    el.innerHTML = items.map(function (it) {
      return '<button class="ctxmenu__item' + (it.destructive ? ' ctxmenu__item--destructive' : '') +
        '" type="button" role="menuitem" data-k="' + it.key + '">' +
        window.RIPIS_ICON(it.icon, 16) + it.label + '</button>';
    }).join('');
    document.body.appendChild(el);
    var w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8)) + 'px';
    el.style.top = Math.max(8, Math.min(y - h / 2, window.innerHeight - h - 8)) + 'px';
    requestAnimationFrame(function () { el.setAttribute('data-open', 'true'); });
    document.addEventListener('pointerdown', function away(e) {
      if (!el.contains(e.target)) { el.remove(); document.removeEventListener('pointerdown', away); }
    });
    Array.prototype.forEach.call(el.querySelectorAll('[data-k]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-k');
        el.remove();
        items.filter(function (i) { return i.key === k; })[0].run();
      });
    });
    return el;
  }

  /* `onAct(id, what)` — what is 'open' | 'edit' | 'delete'. */
  function attachRows(scope, onAct) {
    Array.prototype.forEach.call(scope.querySelectorAll('.txn'), function (el) {
      var body = el.querySelector('.txn__body');
      var sx = 0, sy = 0, dx = 0, drag = false, moved = false, lp = null;
      var id = el.getAttribute('data-id');
      function close() { el.removeAttribute('data-swiped'); body.style.transform = ''; }
      function closeAll() {
        Array.prototype.forEach.call(document.querySelectorAll('.txn[data-swiped]'), function (x) {
          x.removeAttribute('data-swiped');
          x.querySelector('.txn__body').style.transform = '';
        });
      }
      el.addEventListener('pointerdown', function (e) {
        if (e.button !== 0 || e.target.closest('.txn__action')) { return; }
        sx = e.clientX; sy = e.clientY; dx = 0; drag = true; moved = false;
        lp = setTimeout(function () {
          if (moved) { return; }
          closeAll(); close();
          ctxmenu(e.clientX, e.clientY, [
            { key: 'edit', label: 'Edit', icon: 'pencil', run: function () { onAct(id, 'edit'); } },
            { key: 'dup', label: 'Duplicate', icon: 'plus', run: function () { onAct(id, 'duplicate'); } },
            { key: 'del', label: 'Delete', icon: 'trash', destructive: true, run: function () { onAct(id, 'delete'); } }
          ]);
        }, 520);
      });
      el.addEventListener('pointermove', function (e) {
        if (!drag) { return; }
        dx = e.clientX - sx;
        if (Math.abs(dx) > 6 || Math.abs(e.clientY - sy) > 6) { moved = true; clearTimeout(lp); }
        if (Math.abs(dx) > 10) {
          closeAll();
          var base = el.hasAttribute('data-swiped') ? -144 : 0;
          body.style.transform = 'translateX(' + Math.max(-150, Math.min(0, base + dx)) + 'px)';
        }
      });
      el.addEventListener('pointerup', function () {
        clearTimeout(lp);
        drag = false;
        if (!moved) { return; }
        var base = el.hasAttribute('data-swiped') ? -144 : 0;
        body.style.transform = '';
        if (base + dx < -50) { closeAll(); el.setAttribute('data-swiped', 'true'); } else { close(); }
      });
      el.addEventListener('pointercancel', function () { clearTimeout(lp); drag = false; });
      Array.prototype.forEach.call(el.querySelectorAll('.txn__action'), function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          onAct(id, b.getAttribute('data-act'));
        });
      });
      el.addEventListener('click', function (e) {
        if (moved) { moved = false; return; }
        if (e.target.closest('.txn__action')) { return; }
        if (el.hasAttribute('data-swiped')) { close(); e.stopPropagation(); return; }
        if (e.target.closest('a, button')) { return; }
        onAct(id, 'open');
      });
    });
  }

  /* ---- hero figure: 60px until it overflows, floor 34px ------------------ */
  function autofit(el, max, floor) {
    if (!el) { return 0; }
    var size = max;
    el.style.fontSize = size + 'px';
    while (size > floor && el.scrollWidth > el.clientWidth) { size -= 1; el.style.fontSize = size + 'px'; }
    return size;
  }

  /* ---- rows added in 002 -----------------------------------------------
     They live in sessionStorage and are pushed into the ledger at load, so
     every screen, total and chart sees one dataset. A fresh browser profile
     (as the probe uses) starts empty, so the seeded figures stay reproducible.
     ---------------------------------------------------------------------- */
  var ADDKEY = 'ripis-mockup-added';
  var YMKEY = 'ripis-mockup-ym';
  function loadAdded() {
    try {
      var raw = sessionStorage.getItem(ADDKEY);
      if (!raw) { return 0; }
      var list = JSON.parse(raw);
      list.forEach(function (t) { R.TX.push(t); });
      return list.length;
    } catch (e) { return 0; }
  }
  function saveAdded(t) {
    try {
      var raw = sessionStorage.getItem(ADDKEY);
      var list = raw ? JSON.parse(raw) : [];
      list.push(t);
      sessionStorage.setItem(ADDKEY, JSON.stringify(list));
      sessionStorage.setItem(YMKEY, t.date.slice(0, 7));
    } catch (e) {}
  }
  function storedYm() {
    try { return sessionStorage.getItem(YMKEY); } catch (e) { return null; }
  }

  loadAdded();

  window.RIPIS_UI = {
    SCREENS: SCREENS, applyTheme: applyTheme, readTheme: readTheme, mkbar: mkbar, tabbar: tabbar,
    fab: fab, bindMissing: bindMissing, toast: toast, sheet: sheet, closeSheet: closeSheet,
    picker: picker, datePicker: datePicker, ctxmenu: ctxmenu, attachRows: attachRows, autofit: autofit,
    saveAdded: saveAdded, storedYm: storedYm
  };
})();
