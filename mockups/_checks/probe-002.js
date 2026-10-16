(async () => {
  const q = (s) => document.querySelector(s);
  const all = (s) => [...document.querySelectorAll(s)];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};
  out.form = !!q('#form .segmented');
  out.types = all('[data-type]').map((b) => b.innerText + (b.getAttribute('aria-selected') === 'true' ? '*' : ''));
  out.code = q('.amountfield__code') ? q('.amountfield__code').innerText : null;
  out.wallet = q('#pick-wallet .picker__value') ? q('#pick-wallet .picker__value').innerText : null;
  out.dateShown = q('#pick-date .picker__value') ? q('#pick-date .picker__value').innerText : null;
  out.saveBg = q('#save') ? getComputedStyle(q('#save')).backgroundColor : null;
  out.saveFg = q('#save') ? getComputedStyle(q('#save')).color : null;

  q('#save').click();
  await wait(150);
  out.errorOnEmptySave = q('.field__error') ? q('.field__error').innerText : null;

  all('[data-type]')[1].click();
  await wait(150);
  out.incomeHint = q('.field__hint') ? q('.field__hint').innerText : null;

  q('#pick-cat').click();
  await wait(300);
  out.catOptionsForIncome = all('.sheet__opt').map((o) => o.innerText.replace(/\n/g, ' '));
  all('.sheet__opt')[0].click();
  await wait(250);
  out.catChosen = q('#pick-cat .picker__value') ? q('#pick-cat .picker__value').innerText : null;

  const amt = q('#amt');
  amt.value = '1250000';
  amt.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(80);
  out.amountReformatted = amt.value;

  q('#pick-date').click();
  await wait(300);
  out.dateGrid = {
    head: q('.dategrid__head .monthsel__label') ? q('.dategrid__head .monthsel__label').innerText : null,
    dows: all('.dategrid__dow').map((d) => d.innerText).join(' '),
    days: all('.dategrid__day').length,
    selected: q('.dategrid__day[aria-selected="true"]') ? q('.dategrid__day[aria-selected="true"]').innerText : null
  };
  all('.dategrid__day')[9].click();
  await wait(250);
  out.dateAfterPick = q('#pick-date .picker__value') ? q('#pick-date .picker__value').innerText : null;

  all('[data-type]')[3].click();
  await wait(200);
  out.exchange = { toWallet: !!q('#pick-dest'), amountReceived: !!q('#damt') };
  const d = q('#damt');
  if (d) {
    d.value = '5000000';
    d.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(80);
  }
  out.rateHint = q('[data-rate]') ? q('[data-rate]').innerText : null;
  out.overflowX = document.documentElement.scrollWidth - window.innerWidth;
  out.theme = document.documentElement.getAttribute('data-theme');
  return JSON.stringify(out, null, 1);
})()
