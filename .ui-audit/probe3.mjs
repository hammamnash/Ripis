import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const OUT = 'C:/Users/ATDSOL/Working Directory/Personal Project/Ripis/.ui-audit';
const sid = readFileSync(OUT + '/audit-session.txt', 'utf8').trim();
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 },
  storageState: { cookies: [{ name: 'ripis_session', value: sid, domain: 'localhost', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }], origins: [] } });
const page = await ctx.newPage();
const cs = (el) => el ? getComputedStyle(el) : null;

await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
const dash = await page.evaluate(() => {
  const g = (el) => el ? getComputedStyle(el) : null;
  const main = document.querySelector('main');
  const wrap = main.querySelector(':scope > div');
  const card = main.querySelector('a[href^="/wallets/"]');
  const sections = [...main.querySelectorAll(':scope > div > *')];
  return {
    wrapperGap: g(wrap)?.rowGap,
    sectionCount: sections.length,
    walletCard: card ? { radius: g(card).borderRadius, border: g(card).borderTopWidth, pad: g(card).padding, bg: g(card).backgroundColor, h: Math.round(card.getBoundingClientRect().height) } : null,
    walletCardCount: main.querySelectorAll('a[href^="/wallets/"]').length,
    chartCardBars: [...main.querySelectorAll('[data-slot="chart-card"] div[style*="width"]')].map(d => g(d).height),
    chartBarColors: [...main.querySelectorAll('[data-slot="chart-card"] div[style*="width"]')].slice(0, 5).map(d => d.style.backgroundColor),
  };
});
console.log('DASH ' + JSON.stringify(dash, null, 1));

await page.goto('http://localhost:3000/transactions', { waitUntil: 'networkidle' });
const tx = await page.evaluate(() => {
  const g = (el) => el ? getComputedStyle(el) : null;
  const row = document.querySelector('[data-slot="transaction-row"]');
  const daySec = document.querySelector('[data-slot="transaction-day"]');
  const pager = document.querySelector('[data-slot="transaction-pager"]');
  return {
    rowHasIconOrImage: row ? row.querySelectorAll('svg,img').length : null,
    rowIconBgPresent: row ? !!row.querySelector('[class*="rounded-pill"]') : null,
    rowHeight: row ? Math.round(row.getBoundingClientRect().height) : null,
    rowPad: g(row)?.padding,
    rowNoteFs: g(row.querySelector('p'))?.fontSize,
    rowMetaFs: g(row.querySelectorAll('p')[1])?.fontSize,
    dayHeaderFs: g(daySec?.querySelector('h2'))?.fontSize,
    dayCount: document.querySelectorAll('[data-slot="transaction-day"]').length,
    pagerText: pager?.innerText.replace(/\n/g, ' | '),
    filterHeights: [...document.querySelectorAll('form[data-slot="transaction-filters"] select, form[data-slot="transaction-filters"] button')].map(e => g(e).height),
    fab: (() => { const f = document.querySelector('a[href="/transactions/new"]'); return f ? { size: Math.round(f.getBoundingClientRect().width), bg: g(f).backgroundColor, bottom: g(f).bottom } : null; })(),
    tabbarH: (() => { const t = document.querySelector('nav'); return t ? Math.round(t.getBoundingClientRect().height) : null; })(),
  };
});
console.log('TX ' + JSON.stringify(tx, null, 1));

await page.goto('http://localhost:3000/settings', { waitUntil: 'networkidle' });
console.log('SETTINGS ' + (await page.evaluate(() => document.querySelector('main').innerText.slice(0, 260).replace(/\n+/g, ' | '))));
await page.goto('http://localhost:3000/wallets', { waitUntil: 'networkidle' });
console.log('WALLETS ' + JSON.stringify(await page.evaluate(() => {
  const g = (el) => el ? getComputedStyle(el) : null;
  const cards = document.querySelectorAll('a[href^="/wallets/"]');
  return { cards: cards.length, firstH: cards[0] ? Math.round(cards[0].getBoundingClientRect().height) : null, hasGroupHeadings: document.querySelectorAll('main h2').length, h2s: [...document.querySelectorAll('main h2')].map(h => h.textContent) };
})));
await browser.close();
