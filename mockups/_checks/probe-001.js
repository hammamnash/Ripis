(() => {
  const q = (s) => document.querySelector(s);
  const cs = (el) => (el ? getComputedStyle(el) : {});
  const rows = [...document.querySelectorAll('.txn')];
  const band = q('#bandwrap .band');
  const txt = document.body.innerText;
  return JSON.stringify({
    scriptRan: rows.length > 0,
    rows: rows.length,
    month: q('.monthsel__label') ? q('.monthsel__label').innerText : null,
    nextDisabled: q('#next') ? q('#next').disabled : null,
    band: band ? band.innerText.replace(/\n/g, ' | ') : null,
    bandBg: band ? cs(band).backgroundColor : null,
    bandFg: band ? cs(band).color : null,
    bandLabelColor: q('.band__label') ? cs(q('.band__label')).color : null,
    chips: [...document.querySelectorAll('.chip')].map((c) => c.innerText.replace(/\n/g, ' ')),
    firstRow: rows[0] ? rows[0].innerText.replace(/\n/g, ' | ') : null,
    lastRow: rows.length ? rows[rows.length - 1].innerText.replace(/\n/g, ' | ') : null,
    rowMinH: rows[0] ? cs(rows[0].querySelector('.txn__body')).minHeight : null,
    iconColor: rows[0] ? cs(rows[0].querySelector('.txn__icon')).color : null,
    incomeRows: rows.filter((r) => r.querySelector('.amount--income')).length,
    transferRows: rows.filter((r) => r.querySelector('.amount--transfer')).length,
    fxSub: (txt.match(/\u2192 [\d.,]+\s?\u20ab/g) || []),
    usdOnIdr: /Rp\s[\d.]+,\d\d/.test(txt),
    usd: (txt.match(/\$\s?[\d.,]+/g) || []).slice(0, 5),
    vnd: (txt.match(/[\d.]+\s?\u20ab/g) || []).slice(0, 4),
    tabs: [...document.querySelectorAll('.tabbar__item')].map((t) => t.innerText.replace(/\n/g, ' ')),
    activeTab: q('.tabbar__item[aria-current="page"]') ? q('.tabbar__item[aria-current="page"]').innerText.replace(/\n/g, ' ') : null,
    fab: q('.fab') ? cs(q('.fab')).backgroundColor + ' ' + cs(q('.fab')).width : null,
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    markGap: (() => {
      const a = q('.amount');
      if (!a) { return null; }
      const m = a.querySelector('.amount__mark').getBoundingClientRect();
      const f = a.querySelector('.amount__figure').getBoundingClientRect();
      return Math.round((f.left - m.right) * 10) / 10;
    })(),
    theme: document.documentElement.getAttribute('data-theme'),
    tokens: {
      canvas: cs(document.body).backgroundColor,
      ink: cs(document.body).color,
      positive: cs(q('.band__value--in')).color,
      bandPanel: cs(band).backgroundColor
    }
  }, null, 1);
})()
