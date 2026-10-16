(() => {
  const q = (s) => document.querySelector(s);
  const cs = (el) => (el ? getComputedStyle(el) : {});
  const all = (s) => [...document.querySelectorAll(s)];
  const txt = document.body.innerText;
  const hero = q('.hero');
  return JSON.stringify({
    scriptRan: !!hero,
    theme: document.documentElement.getAttribute('data-theme'),
    heroFigure: q('.hero__figure') ? q('.hero__figure').innerText.replace(/\n/g, ' ') : null,
    heroFit: q('.hero__figure') ? q('.hero__figure').getAttribute('data-fit-size') : null,
    heroFigurePx: hero ? cs(q('.hero__figure')).fontSize : null,
    heroDelta: q('.hero__delta') ? q('.hero__delta').innerText : null,
    heroDeltaColor: q('.hero__delta') ? cs(q('.hero__delta')).color : null,
    heroLabelColor: q('.hero__label') ? cs(q('.hero__label')).color : null,
    heroPanel: hero ? cs(hero).backgroundColor : null,
    heroNote: q('.hero__note') ? q('.hero__note').innerText : null,
    assets: all('.hero__stat-value')[0] ? all('.hero__stat-value')[0].innerText : null,
    liabilities: all('.hero__stat-value')[1] ? all('.hero__stat-value')[1].innerText : null,
    wallets: all('.wallet').map((w) => w.innerText.replace(/\n/g, ' | ')),
    liabilityColor: all('.wallet__balance--liability')[0] ? cs(all('.wallet__balance--liability')[0]).color : null,
    budgets: all('.budget').map((b) => b.innerText.replace(/\n/g, ' | ')),
    budgetFills: all('.budget__fill').map((f) => f.className.replace('budget__fill ', '') + ' ' + f.style.width),
    pieSlices: all('.catpie__svg path').length,
    pieFills: all('.catpie__svg path').map((p) => getComputedStyle(p).fill),
    catrows: all('.catrow').map((r) => r.innerText.replace(/\n/g, ' ')),
    pieTotal: q('.catpie__total') ? q('.catpie__total').innerText : null,
    linePoints: q('polyline') ? q('polyline').getAttribute('points').split(' ').length : null,
    lineStroke: q('polyline') ? cs(q('polyline')).stroke : null,
    lineStrokeWidth: q('polyline') ? cs(q('polyline')).strokeWidth : null,
    chartLabels: all('.ch__val').map((t) => t.textContent),
    ticks: all('.ch__tick').map((t) => t.textContent),
    bars: all('rect').length,
    insight: q('.insight') ? q('.insight').innerText.replace(/\n/g, ' ') : null,
    insightBg: q('.insight') ? cs(q('.insight')).backgroundColor : null,
    insightFg: q('.insight') ? cs(q('.insight')).color : null,
    cards: all('.card').length,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    inkOnCanvas: cs(q('.hero__figure')).color,
    bodyBg: cs(document.body).backgroundColor,
    heroOverflow: (() => {
      const f = q('.hero__figure');
      if (!f) { return null; }
      const orig = f.textContent;
      const out = [];
      ['Rp 93.686.838', 'Rp 999.999.999', 'Rp 1.234.567.890', 'Rp 12.345.678.900'].forEach((s) => {
        f.style.fontSize = '60px';
        f.textContent = s;
        out.push(s + ': scroll=' + f.scrollWidth + ' box=' + f.clientWidth +
          (f.scrollWidth > f.clientWidth ? ' OVERFLOWS' : ' fits'));
      });
      f.textContent = orig;
      f.style.fontSize = '';
      return out;
    })(),
    heroAutofit: (() => {
      const f = q('.hero__figure');
      if (!f || !window.RIPIS_UI) { return null; }
      const orig = f.textContent;
      f.textContent = 'Rp 12.345.678.900';
      const shrunk = window.RIPIS_UI.autofit(f, 60, 34);
      f.textContent = orig;
      window.RIPIS_UI.autofit(f, 60, 34);
      return shrunk;
    })(),
    geom: (() => {
      const phone = q('.phone').getBoundingClientRect();
      const out = { clipped: [], overlaps: [], collapsed: 0 };
      document.querySelectorAll('.screen *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) { return; }
        if (r.left < phone.left - 1 || r.right > phone.right + 1) {
          out.clipped.push((el.getAttribute('class') || el.tagName) + ' l=' +
            Math.round(r.left) + ' r=' + Math.round(r.right));
        }
      });
      const marks = [...document.querySelectorAll('.ch rect, .ch circle')]
        .map((m) => m.getBoundingClientRect());
      document.querySelectorAll('.ch__val, .ch__tick').forEach((t) => {
        const r = t.getBoundingClientRect();
        if (marks.some((m) => !(r.right < m.left || r.left > m.right ||
            r.bottom < m.top || r.top > m.bottom))) {
          out.overlaps.push('label "' + t.textContent + '"');
        }
      });
      const boxes = [...document.querySelectorAll('.screen > *')]
        .map((e) => e.getBoundingClientRect());
      for (let i = 1; i < boxes.length; i++) {
        if (boxes[i].top < boxes[i - 1].bottom - 2) { out.overlaps.push('section ' + i + ' overlaps ' + (i - 1)); }
      }
      const paths = [...document.querySelectorAll('.catpie__svg path')]
        .map((p) => p.getBoundingClientRect());
      paths.forEach((p) => { if (p.width < 4 || p.height < 4) { out.collapsed++; } });
      out.donut = { paths: paths.length, collapsed: out.collapsed };
      return out;
    })(),
  }, null, 1);
})()
