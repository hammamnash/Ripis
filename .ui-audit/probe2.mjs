import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const OUT = 'C:/Users/ATDSOL/Working Directory/Personal Project/Ripis/.ui-audit';
const sid = readFileSync(OUT + '/audit-session.txt', 'utf8').trim();
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  storageState: { cookies: [{ name: 'ripis_session', value: sid, domain: 'localhost', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }], origins: [] },
});
const page = await ctx.newPage();

const outline = () => {
  const main = document.querySelector('main');
  const walk = (el, d) => {
    if (d > 3) return '';
    const kids = [...el.children].map((c) => walk(c, d + 1)).filter(Boolean);
    const tag = el.tagName.toLowerCase();
    const cls = (el.className && typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 4).join('.') : '');
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ');
    const label = own ? ` "${own.slice(0, 46)}"` : '';
    const head = `${'  '.repeat(d)}<${tag}${cls ? ' .' + cls : ''}${label}>`;
    return kids.length ? head + '\n' + kids.join('\n') : head;
  };
  return walk(main || document.body, 0);
};

async function go(route) {
  await page.goto('http://localhost:3000' + route, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(300);
}

await go('/transactions');
console.log('##### /transactions outline\n' + (await page.evaluate(outline)));
console.log('\n##### metrics\n' + JSON.stringify(await page.evaluate(() => {
  const cs = (el) => el ? getComputedStyle(el) : null;
  const rows = [...document.querySelectorAll('main a[href*="/transactions/"]')].filter(a => !a.href.endsWith('/transactions/new'));
  const r = rows[0];
  const box = r?.getBoundingClientRect();
  const h = [...document.querySelectorAll('main h1, main h2')].map(e => e.tagName + ':' + e.textContent.trim());
  return {
    rowCount: rows.length,
    rowHref: r?.getAttribute('href'),
    rowHeight: box?.height,
    rowText: r?.innerText.replace(/\n/g, ' | '),
    rowBorder: cs(r)?.borderBottom + ' / radius ' + cs(r)?.borderRadius,
    rowPad: cs(r)?.padding,
    rowBg: cs(r)?.backgroundColor,
    rowFonts: { note: cs(r?.querySelector('p,span'))?.fontSize, amount: cs(r?.querySelector('[class*="tabular"],span:last-child'))?.fontSize },
    headings: h,
    sections: [...document.querySelectorAll('main h2')].map(e => e.textContent.trim()),
    scrollerOverflowX: cs(document.querySelector('main'))?.overflowX,
  };
})));

await go('/');
console.log('\n##### / outline\n' + (await page.evaluate(outline)));
console.log('\n##### dashboard metrics\n' + JSON.stringify(await page.evaluate(() => {
  const cs = (el) => el ? getComputedStyle(el) : null;
  const hero = [...document.querySelectorAll('main section, main div')].find(e => /NET WORTH/i.test(e.textContent || '') && e.getBoundingClientRect().height < 400 && e.getBoundingClientRect().height > 100);
  const figs = [...document.querySelectorAll('main *')].filter(e => e.children.length === 0 && /\d{1,3}\.\d{3}/.test(e.textContent));
  return {
    h1: document.querySelector('main h1')?.textContent,
    heroBg: cs(hero)?.backgroundColor,
    heroRadius: cs(hero)?.borderRadius,
    heroPad: cs(hero)?.padding,
    heroH: hero?.getBoundingClientRect().height,
    figureSizes: figs.slice(0, 8).map(e => ({ t: e.textContent.trim().slice(0, 14), fs: cs(e).fontSize, ff: cs(e).fontFamily.split(',')[0], w: cs(e).fontWeight })),
    hasDeltaLine: /this month|vs last month|%/i.test(document.querySelector('main')?.innerText || ''),
    charts: [...document.querySelectorAll('main svg')].map(s => s.parentElement?.tagName + ':' + (s.getAttribute('class') || '') + 'w=' + Math.round(s.getBoundingClientRect().width) + 'h=' + Math.round(s.getBoundingClientRect().height)),
    h2s: [...document.querySelectorAll('main h2, main h3')].map(e => e.tagName + ':' + e.textContent.trim()),
  };
})));

await go('/transactions/new');
console.log('\n##### /transactions/new outline\n' + (await page.evaluate(outline)));
console.log('\n##### form metrics\n' + JSON.stringify(await page.evaluate(() => {
  const cs = (el) => el ? getComputedStyle(el) : null;
  const amt = document.querySelector('form input[name*="amount" i], input[inputmode="decimal"]');
  const seg = document.querySelector('[role="radiogroup"]');
  return {
    amountFs: cs(amt)?.fontSize, amountH: cs(amt)?.height, amountAlign: cs(amt)?.textAlign, amountWeight: cs(amt)?.fontWeight,
    segmented: !!seg, segItems: seg ? [...seg.querySelectorAll('button,label')].map(e => e.textContent.trim()) : null,
    selects: document.querySelectorAll('form select').length,
    nativeDate: !!document.querySelector('form input[type="date"]'),
    buttons: [...document.querySelectorAll('form button')].map(b => ({ t: b.textContent.trim(), bg: cs(b)?.backgroundColor, color: cs(b)?.color, h: cs(b)?.height, r: cs(b)?.borderRadius })),
    labels: [...document.querySelectorAll('form label')].map(l => ({ t: l.textContent.trim().slice(0, 20), fs: cs(l)?.fontSize, tt: cs(l)?.textTransform, ls: cs(l)?.letterSpacing })),
    inputs: [...document.querySelectorAll('form input, form textarea')].map(i => ({ n: i.name || i.type, fs: cs(i).fontSize, h: cs(i).height, bg: cs(i).backgroundColor, r: cs(i).borderRadius })),
  };
})));

await browser.close();
