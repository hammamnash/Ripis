/* ============================================================================
   Ripis — renderers. Every colour is a token: var(--color-chart-3),
   var(--color-positive). No hex literals.
   ============================================================================ */
(function () {
  'use strict';
  var R = window.RIPIS;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Amount (§5). `mark` is the currency symbol in --text-caption, set twice a
     word space from the digits; `figure` is the grouped number. group() in
     ledger.js does the Indonesian grouping — never toLocaleString('en-US'). */
  function amount(v, cur, cls) {
    var m = R.formatMoney(v, cur);
    var neg = m.charAt(0) === '\u2212';
    var body = neg ? m.slice(1) : m;
    var sp = body.indexOf(' ');
    var sym = sp < 0 ? '' : body.slice(0, sp);
    var fig = sp < 0 ? body : body.slice(sp + 1);
    return '<span class="amount tabular ' + (cls || '') + '">' +
      '<span class="amount__mark">' + esc(sym) + '</span>' +
      '<span class="amount__figure">' + esc(fig) + '</span></span>';
  }

  function txnAmount(t) {
    var m = R.formatMoney(t.amount, t.cur);
    var neg = m.charAt(0) === '\u2212';
    var body = neg ? m.slice(1) : m;
    var sp = body.indexOf(' ');
    var sym = sp < 0 ? '' : body.slice(0, sp);
    var fig = sp < 0 ? body : body.slice(sp + 1);
    if (t.type === 'transfer' || t.type === 'exchange') { sym = '\u2192 ' + sym; }
    if (t.type === 'income') { sym = '+' + sym; }
    if (neg) { sym = '\u2212' + sym; }
    return '<span class="amount tabular amount--' + t.type + '">' +
      '<span class="amount__mark">' + esc(sym) + '</span>' +
      '<span class="amount__figure">' + esc(fig) + '</span></span>';
  }

  function dateLabel(iso) { return R.formatDate(iso); }

  function txnRow(t) {
    var w = R.wallet(t.wallet), c = R.category(t.cat);
    var meta = [c ? c.name : '\u2014', w.name, dateLabel(t.date)].join(' \u00b7 ');
    var sub = '';
    if (t.type === 'exchange' && t.dest_amount) {
      var d = R.wallet(t.dest);
      sub = '<span class="txn__amt-sub tabular">\u2192 ' + esc(R.formatMoney(t.dest_amount, d.currency)) + '</span>';
    }
    var tag = t.tags && t.tags.length ? '<span class="txn__tag">#' + esc(t.tags[0]) + '</span>' : '';
    var icon = R.CATEGORIES.filter(function (x) { return x.id === t.cat; })[0];
    var ic = t.type === 'transfer' || t.type === 'exchange' ? 'transfer' : (icon ? icon.icon : 'other');
    return '' +
      '<div class="txn" data-id="' + esc(t.id) + '" tabindex="0">' +
        '<div class="txn__actions">' +
          '<button class="txn__action" type="button" data-act="edit">' +
            window.RIPIS_ICON('pencil', 18) + 'Edit</button>' +
          '<button class="txn__action txn__action--delete" type="button" data-act="delete">' +
            window.RIPIS_ICON('trash', 18) + 'Delete</button>' +
        '</div>' +
        '<div class="txn__body">' +
          '<span class="txn__icon" aria-hidden="true"' +
            (icon ? ' style="color:var(--color-chart-' + icon.c + ')"' : '') + '>' +
            window.RIPIS_ICON(ic) + '</span>' +
          '<span class="txn__main">' +
            '<span class="txn__note truncate">' + esc(t.note) + tag + '</span>' +
            '<span class="txn__meta truncate">' + esc(meta) + '</span>' +
          '</span>' +
          '<span class="txn__amt">' + txnAmount(t) + sub + '</span>' +
        '</div>' +
      '</div>';
  }

  /* ---- icons: 24×24, stroke currentColor, 1.6 — hairline-weight only ------ */
  var PATHS = {
    food: '<path d="M6 3v8a2 2 0 0 0 4 0V3M8 11v10M16 3c-1.5 1-2 3-2 5s.5 3 2 3 2-1.5 2-4-.5-3-2-4zM16 11v10"/>',
    transport: '<path d="M4 16h16M6 16V9l6-4 6 4v7M9 16v2M15 16v2M8 12h8"/>',
    shopping: '<path d="M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2"/>',
    bills: '<path d="M6 3h9l3 3v15H6zM9 8h6M9 12h6M9 16h4"/>',
    fun: '<path d="M4 9h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM8 9V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M12 13v4M10 15h4"/>',
    health: '<path d="M12 20s-7-4.5-7-9a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 4.5-7 9-7 9z"/>',
    edu: '<path d="M3 7l9-4 9 4-9 4-9-4zM6 9v6c0 1.5 3 3 6 3s6-1.5 6-3V9"/>',
    other: '<path d="M12 4v16M4 12h16"/>',
    transfer: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    income: '<path d="M12 4v13M7 12l5 5 5-5M5 20h14"/>',
    dashboard: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z"/>',
    list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    wallet: '<path d="M3 7h15a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM3 7a3 3 0 0 1 3-3h11M17 13h.01"/>',
    gear: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12c0-.6-.1-1.2-.2-1.8l2-1.5-2-3.4-2.3 1a7 7 0 0 0-3-1.8L13 2h-4l-.5 2.5a7 7 0 0 0-3 1.8l-2.3-1-2 3.4 2 1.5A9 9 0 0 0 3 12c0 .6.1 1.2.2 1.8l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 3 1.8L9 22h4l.5-2.5a7 7 0 0 0 3-1.8l2.3 1 2-3.4-2-1.5c.1-.6.2-1.2.2-1.8z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 13l4 4L19 7"/>',
    pencil: '<path d="M4 20h4l10-10-4-4L4 16zM14 6l4 4"/>',
    trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    calendar: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
    search: '<path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4"/>',
    alert: '<path d="M12 4l9 16H3zM12 10v4M12 17h.01"/>',
    info: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01"/>'
  };
  window.RIPIS_ICON = function (name, size) {
    var d = PATHS[name] || PATHS.other;
    var s = size || 20;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + '</svg>';
  };

  function walletCard(w) {
    var b = R.balance(w.id);
    var badge = w.is_liability
      ? '<span class="wallet__badge wallet__badge--liability">Liability</span>'
      : '<span class="wallet__badge">' + esc(w.currency) + '</span>';
    return '<div class="wallet">' +
      '<div class="wallet__main">' +
        '<span class="wallet__name">' + esc(w.name) + '</span>' +
        '<span class="wallet__type">' + esc(w.type) + '</span>' +
      '</div>' +
      '<div class="wallet__side">' +
        '<div class="wallet__balance' + (w.is_liability ? ' wallet__balance--liability' : '') + '">' +
          amount(b, w.currency, '') + '</div>' +
        badge +
      '</div></div>';
  }

  /* Budget bar (§5, FR-10). <80% positive · 80–100% warning · exactly 100%
     warning · >100% negative. Spend is the frozen base_amount, so the bar is
     in the primary currency whatever the wallet was (ADR-0004).
     `row` is a budgetStatus from ledger.budgets(): {ratio, status, pct,
     remaining, limit, spent, category}. */
  function budgetBar(row) {
    var c = row.category;
    var st = row.status;
    var over = row.spent > row.limit;
    return '<div class="budget">' +
      '<div class="budget__head"><span class="budget__label">' +
        (c ? '<span class="catrow__dot" style="background:var(--color-chart-' + c.c + ')"></span> ' : '') +
        esc(c ? c.name : 'Uncategorised') + '</span>' +
        '<span class="budget__pct budget__pct--' + st + ' tabular">' + row.pct + '%</span></div>' +
      '<div class="budget__track"><div class="budget__fill budget__fill--' + st + '" ' +
        'style="width:' + Math.min(100, row.ratio * 100).toFixed(1) + '%"></div></div>' +
      '<div class="caption tabular">' + esc(R.formatMoney(row.spent, 'IDR')) + ' of ' +
        esc(R.formatMoney(row.limit, 'IDR')) + ' \u00b7 ' +
        (over ? 'over by ' + esc(R.formatMoney(row.spent - row.limit, 'IDR'))
              : 'left ' + esc(R.formatMoney(row.limit - row.spent, 'IDR'))) +
      '</div></div>';
  }

  function catRow(c, i) {
    return '<div class="catrow">' +
      '<span class="catrow__dot" style="background:var(--color-chart-' + (i + 1) + ')"></span>' +
      '<span class="catrow__name truncate">' + esc(c.name) + '</span>' +
      '<span class="catrow__amt tabular">' + esc(R.formatMoney(c.amount, 'IDR')) + '</span>' +
      '<span class="catrow__pct tabular caption">' + c.pct.toFixed(1) + '%</span>' +
    '</div>';
  }

  /* Net-worth hero (§5) — --surface-inverted, in both themes.
     The delta is the month's net flow, computed: with one static display rate
     the change in net worth equals income − expense for the month exactly. */
  function hero(t) {
    var d = R.monthTotals(R.CURRENT_YM).net;
    var up = d >= 0;
    return '<section class="hero" data-hero>' +
      '<div class="hero__label micro">Net worth</div>' +
      '<div class="hero__figure serif tabular" data-autofit>' + esc(R.formatMoney(t.net, 'IDR')) + '</div>' +
      '<div class="hero__delta hero__delta--' + (up ? 'up' : 'down') + '">' +
        (up ? '+' : '\u2212') + esc(R.formatMoney(Math.abs(d), 'IDR')) + ' this month</div>' +
      '<div class="hero__split">' +
        '<div><div class="hero__stat-label">Assets</div>' +
          '<div class="hero__stat-value">' + esc(R.formatMoney(t.assets, 'IDR')) + '</div></div>' +
        '<div><div class="hero__stat-label">Liabilities</div>' +
          '<div class="hero__stat-value">' + esc(R.formatMoney(t.liabilities, 'IDR')) + '</div></div>' +
      '</div>' +
      '<div class="hero__note">Includes USD and VND wallets at derived rates \u2014 no rate is stored (ADR-0004).</div>' +
    '</section>';
  }

  function band(ym) {
    var t = R.monthTotals(ym);
    return '<section class="band" data-band>' +
      '<div class="band__cell"><div class="band__label micro">Income</div>' +
        '<div class="band__value band__value--in tabular">' + esc(R.formatMoney(t.income, 'IDR')) + '</div></div>' +
      '<div class="band__cell"><div class="band__label micro">Expense</div>' +
        '<div class="band__value band__value--out tabular">' + esc(R.formatMoney(t.expense, 'IDR')) + '</div></div>' +
      '<div class="band__cell"><div class="band__label micro">Net</div>' +
        '<div class="band__value tabular">' + esc(R.formatMoney(t.net, 'IDR')) + '</div></div>' +
    '</section>';
  }

  window.RIPIS_RENDER = {
    esc: esc, amount: amount, txnAmount: txnAmount, txnRow: txnRow, walletCard: walletCard,
    budgetBar: budgetBar, catRow: catRow, hero: hero, band: band, dateLabel: dateLabel
  };

  /* @@END@@ */
})();
