/* Ripis — charts (§4). Colours are tokens only.
   pie/stacked: --color-chart-1..6 by rank, largest = ink
   line: ink stroke 1.5px, no fill, one hairline baseline, no gridlines
   bars: single series = ink */
(function () {
  'use strict';
  var R = window.RIPIS;

  function pol(cx, cy, r, a) {
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  /* donut segment between two angles, with a 2° gap so neighbouring slices
     of similar luminance never touch (a rendering gap, not a colour). */
  function seg(cx, cy, ro, ri, a0, a1) {
    var large = (a1 - a0) > Math.PI ? 1 : 0;
    var p0 = pol(cx, cy, ro, a0), p1 = pol(cx, cy, ro, a1);
    var q0 = pol(cx, cy, ri, a1), q1 = pol(cx, cy, ri, a0);
    return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) +
      'A' + ro + ' ' + ro + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) +
      'L' + q0[0].toFixed(2) + ' ' + q0[1].toFixed(2) +
      'A' + ri + ' ' + ri + ' 0 ' + large + ' 0 ' + q1[0].toFixed(2) + ' ' + q1[1].toFixed(2) + 'Z';
  }

  /* Pie (§4). Input is ledger.pieSlices(ym).slices: [{name, amount, rank,
     share, grouped}] — already ranked, so colour index == rank. The list under
     the donut is the direct labelling AND the text alternative — every value
     and share is in the DOM as text. */
  function pie(slices, opt) {
    opt = opt || {};
    var total = slices.reduce(function (s, x) { return s + x.amount; }, 0);
    var cx = 100, cy = 100, ro = 92, ri = 58;
    var a = -Math.PI / 2, paths = '', rows = '';
    slices.forEach(function (s, i) {
      var span = total > 0 ? (s.amount / total) * Math.PI * 2 : 0;
      var gap = 0.035;
      if (span > gap * 2) {
        paths += '<path d="' + seg(cx, cy, ro, ri, a + gap, a + span - gap) +
          '" fill="var(--color-chart-' + (i + 1) + ')"></path>';
      }
      a += span;
      var pct = total > 0 ? (s.amount / total) * 100 : 0;
      rows += '<li class="catrow">' +
        '<span class="catrow__dot" style="background:var(--color-chart-' + (i + 1) + ')"></span>' +
        '<span class="catrow__name">' + s.name + (s.grouped ? ' <span class="ash">(' +
          s.grouped.join(', ') + ')</span>' : '') + '</span>' +
        '<span class="catrow__amt tabular">' + R.formatMoney(s.amount, opt.cur || R.PRIMARY) + '</span>' +
        '<span class="catrow__pct tabular">' + R.formatNumber(pct, 1) + '%</span>' +
        '</li>';
    });
    return '<div class="catpie">' +
      '<svg viewBox="0 0 200 200" class="catpie__svg" role="img" aria-label="' +
        (opt.label || 'Spending by category') + '">' + paths +
        '<text class="catpie__hole" x="100" y="104" text-anchor="middle">' +
        R.monthLabel(opt.ym).split(' ')[0] + '</text></svg>' +
      '<p class="catpie__total caption">' +
        R.formatMoney(total, opt.cur || R.PRIMARY) + ' total</p>' +
      '<ul class="catrows">' + rows + '</ul>' +
      '</div>';
  }

  /* Line (§4): ink 1.5px, no fill, one hairline baseline, no gridlines.
     Direct labels on first, last, and max. */
  function line(series, opt) {
    opt = opt || {};
    var x0 = 16, x1 = 284, top = 26, base = 78, n = series.length;
    var max = series.reduce(function (m, r) { return Math.max(m, r.v); }, 0) || 1;
    function px(i) { return n === 1 ? x0 : x0 + (i * (x1 - x0)) / (n - 1); }
    function py(v) { return base - (v / max) * (base - top); }
    var pts = series.map(function (r, i) { return px(i).toFixed(1) + ',' + py(r.v).toFixed(1); }).join(' ');
    var last = n - 1, maxI = 0;
    series.forEach(function (r, i) { if (r.v > series[maxI].v) { maxI = i; } });
    var dots = '<circle cx="' + px(last).toFixed(1) + '" cy="' + py(series[last].v).toFixed(1) + '" r="3" fill="var(--color-ink)"></circle>';
    var labs =
      '<text class="ch__val" x="' + x0 + '" y="' + (py(series[0].v) - 8).toFixed(1) + '" text-anchor="start">' +
        R.formatMoney(series[0].v, R.PRIMARY) + '</text>' +
      '<text class="ch__val" x="' + x1 + '" y="' + (py(series[last].v) - 8).toFixed(1) + '" text-anchor="end">' +
        R.formatMoney(series[last].v, R.PRIMARY) + '</text>';
    if (maxI !== 0 && maxI !== last) {
      labs += '<text class="ch__val" x="' + px(maxI).toFixed(1) + '" y="' + (py(series[maxI].v) - 8).toFixed(1) +
        '" text-anchor="middle">' + R.formatMoney(series[maxI].v, R.PRIMARY) + '</text>' +
        '<circle cx="' + px(maxI).toFixed(1) + '" cy="' + py(series[maxI].v).toFixed(1) + '" r="3" fill="var(--color-ink)"></circle>';
    }
    var ticks = series.map(function (r, i) {
      var an = i === 0 ? 'start' : (i === last ? 'end' : 'middle');
      return '<text class="ch__tick" x="' + px(i).toFixed(1) + '" y="96" text-anchor="' + an + '">' +
        R.monthLabel(r.m).slice(0, 3) + '</text>';
    }).join('');
    return '<svg viewBox="0 0 300 104" class="ch" role="img" aria-label="' + (opt.label || 'Trend') + '">' +
      '<line x1="0" y1="' + base + '" x2="300" y2="' + base + '" stroke="var(--color-hairline)" stroke-width="1"></line>' +
      '<polyline points="' + pts + '" fill="none" stroke="var(--color-ink)" stroke-width="1.5" ' +
        'stroke-linejoin="round" stroke-linecap="round"></polyline>' + dots + labs + ticks + '</svg>';
  }

  /* Bars (§4): one series, ink. Negative months drop below the hairline
     baseline in --color-negative (a status colour, §3). First and last bar
     carry a direct label; no legend, no gridlines. */
  function bars(series, opt) {
    opt = opt || {};
    var n = series.length, top = 30, bot = 86, w = 26, gap = 25.6, x0 = 22;
    var vs = series.map(function (r) { return r.v; });
    var hi = Math.max.apply(null, vs.concat([0])), lo = Math.min.apply(null, vs.concat([0]));
    var span = (hi - lo) || 1, scale = (bot - top) / span;
    var zeroY = top + hi * scale;
    var out = '', labs = '', ticks = '';
    series.forEach(function (r, i) {
      var v = r.v;
      var h = Math.max(Math.abs(v) * scale, v === 0 ? 0 : 1.5);
      var y = v >= 0 ? zeroY - h : zeroY;
      var x = x0 + i * (w + gap);
      out += '<rect x="' + x + '" y="' + y.toFixed(1) + '" width="' + w + '" height="' + h.toFixed(1) +
        '" rx="3" fill="' + (v < 0 ? 'var(--color-negative)' : 'var(--color-ink)') + '"></rect>';
      ticks += '<text class="ch__tick" x="' + (x + w / 2) + '" y="100" text-anchor="middle">' +
        R.monthLabel(r.m).slice(0, 3) + '</text>';
      if (i === 0 || i === n - 1) {
        labs += '<text class="ch__val" x="' + (i === 0 ? x : x + w) + '" y="' + (y - 8).toFixed(1) +
          '" text-anchor="' + (i === 0 ? 'start' : 'end') + '">' + R.formatMoney(v, R.PRIMARY) + '</text>';
      }
    });
    return '<svg viewBox="0 0 300 106" class="ch" role="img" aria-label="' + (opt.label || 'Cash flow') + '">' +
      '<line x1="0" y1="' + zeroY.toFixed(1) + '" x2="300" y2="' + zeroY.toFixed(1) +
      '" stroke="var(--color-hairline)" stroke-width="1"></line>' + out + labs + ticks + '</svg>';
  }

  window.RIPIS_CHARTS = { pie: pie, line: line, bars: bars };
})();
