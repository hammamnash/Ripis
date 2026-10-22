import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const OUT = 'C:/Users/ATDSOL/Working Directory/Personal Project/Ripis/.ui-audit';
mkdirSync(OUT, { recursive: true });
const sid = readFileSync(OUT + '/audit-session.txt', 'utf8').trim();

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  extraHTTPHeaders: { cookie: `ripis_session=${sid}` },
  storageState: {
    cookies: [{ name: 'ripis_session', value: sid, domain: 'localhost', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }],
    origins: [],
  },
});
const page = await ctx.newPage();

const routes = ['/', '/transactions', '/transactions/new', '/budgets', '/wallets', '/settings'];
for (const theme of ['light', 'dark']) {
  for (const r of routes) {
    const res = await page.goto('http://localhost:3000' + r, { waitUntil: 'networkidle', timeout: 90000 });
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('theme', t); } catch {}
    }, theme);
    await page.waitForTimeout(500);
    const name = (r === '/' ? 'dashboard' : r.replace(/\//g, '-').replace(/^-/, '')) + '-' + theme + '.png';
    await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });
    const first = (await page.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText)).slice(0, 80).replace(/\n+/g, ' | ');
    console.log(`${r} ${res?.status()} ${theme} :: ${first}`);
  }
}
await browser.close();
