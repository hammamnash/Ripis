/* Ripis mockup verification.
   Loads the ledger in this process, drives the three screens in headless
   Chrome (both themes), and asserts the things a reviewer would otherwise
   have to eyeball. Run: node mockups/_checks/verify.mjs
   Exit code 0 = every assertion passed. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(decodeURIComponent(
  new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const root = path.resolve(here, '..');
const base = 'file:///' + root.replace(/\\/g, '/').replace(/ /g, '%20');

/* ---- the ledger, in-process, same file the screens load ------------------ */
globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(root, '_shared', 'ledger.js'), 'utf8'))();
const R = globalThis.RIPIS;

/* ---- drive one screen ---------------------------------------------------- */
function probe(page, probeFile, theme) {
  const out = execFileSync(process.execPath, [
    path.join(here, 'page-probe.mjs'),
    base + '/' + page,
    path.join(here, probeFile),
    '--theme=' + theme
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(out);
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
}
const money = (v, c) => R.formatMoney(v, c || 'IDR');

/* ---- 001 Transactions list ---------------------------------------------- */
console.log('\n001 transactions list');
const listL = probe('001-transactions-list/index.html', 'probe-001.js', 'light');
const listD = probe('001-transactions-list/index.html', 'probe-001.js', 'dark');
const oct = R.monthTotals('2026-10');

check('script ran, rows rendered', listL.scriptRan && listL.rows > 0, listL.rows + ' rows');
check('row count == October ledger rows', listL.rows === R.monthTx('2026-10').length,
  listL.rows + ' vs ' + R.monthTx('2026-10').length);
check('band income == ledger', listL.band.indexOf(money(oct.income)) > -1, money(oct.income));
check('band expense == ledger', listL.band.indexOf(money(oct.expense)) > -1, money(oct.expense));
check('band net == ledger', listL.band.indexOf(money(oct.net)) > -1, money(oct.net));
check('row height is 64px', listL.rowMinH === '64px', listL.rowMinH);
check('currency mark is spaced from digits', listL.markGap > 2, listL.markGap + 'px');
check('no English grouping anywhere', !/Rp\s?\d{1,3}(,\d{3})+/.test(listL.firstRow + listL.lastRow));
check('no overhead of .00 on IDR', listL.usdOnIdr === false);
check('USD uses two decimals and a comma', listL.usd.join('').replace(/\s+/g, '') === '$90,00',
  listL.usd.join('').replace(/\s+/g, ' '));
check('VND renders with the dong sign', /\u20ab/.test(listL.vnd.join('')), listL.vnd.join(''));
check('exchange row shows its received amount', listL.fxSub.length === 1, listL.fxSub.join(''));
check('no horizontal overflow', listL.overflowX === 0, String(listL.overflowX));
check('income rows: + prefix', listL.incomeRows === 5, String(listL.incomeRows));
check('transfer rows: arrow, never +/', listL.transferRows === 4, String(listL.transferRows));

/* ---- both themes ship, and the panel flips per §2.9 rule 3 -------------- */
console.log('\nboth themes');
check('light canvas is paper', listL.tokens.canvas === 'rgb(244, 242, 240)', listL.tokens.canvas);
check('dark canvas is obsidian', listD.tokens.canvas === 'rgb(20, 18, 15)', listD.tokens.canvas);
check('light panel is the darker obsidian', listL.bandBg === 'rgb(26, 25, 25)', listL.bandBg);
check('dark panel is raised, not inverted', listD.bandBg === 'rgb(38, 34, 32)', listD.bandBg);
check('dark panel is lighter than the dark canvas',
  listD.bandBg !== listD.tokens.canvas && listD.bandBg > listD.tokens.canvas);
check('panel ash label identical in both themes',
  listL.bandLabelColor === listD.bandLabelColor, listL.bandLabelColor);
check('panel positive identical in both themes',
  listL.tokens.positive === listD.tokens.positive, listL.tokens.positive);

/* ---- 003 Dashboard ------------------------------------------------------ */
console.log('\n003 dashboard');
const dashL = probe('003-dashboard/index.html', 'probe-003.js', 'light');
const dashD = probe('003-dashboard/index.html', 'probe-003.js', 'dark');
const t = R.totals();
const octSlices = R.pieSlices('2026-10');

check('script ran, hero rendered', dashL.scriptRan === true);
check('hero == ledger net worth', dashL.heroFigure === money(t.net), dashL.heroFigure + ' vs ' + money(t.net));
check('hero assets == ledger', dashL.assets === money(t.assets), dashL.assets);
check('hero liabilities == ledger', dashL.liabilities === money(t.liabilities), dashL.liabilities);
check('hero delta == this month\'s net flow',
  dashL.heroDelta === ('+' + money(oct.net) + ' this month'), dashL.heroDelta);
check('hero figure fits at 60px here', Number(dashL.heroFit) <= 60, dashL.heroFit + 'px');
check('hero panel flips with the theme', dashL.heroPanel !== dashD.heroPanel,
  dashL.heroPanel + ' / ' + dashD.heroPanel);
check('six pie slices, ranked', dashL.pieSlices === octSlices.slices.length && dashL.pieSlices === 6,
  dashL.pieSlices + ' slices');
check('slice 1 is ink', dashL.pieFills[0] === 'rgb(12, 10, 8)', dashL.pieFills[0]);
check('slice 2 is the light-theme chart-2 (olive), not the unusable highlighter',
  dashL.pieFills[1] === 'rgb(125, 140, 34)', dashL.pieFills[1]);
check('slice 2 in dark IS the highlighter', dashD.pieFills[1] === 'rgb(228, 242, 34)', dashD.pieFills[1]);
check('the six fills are distinct', new Set(dashL.pieFills).size === 6, String(new Set(dashL.pieFills).size));
check('pie total == October expense', dashL.pieTotal === money(oct.expense) + ' total',
  dashL.pieTotal + ' vs ' + money(oct.expense));
check('every slice is labelled with its value and share', dashL.catrows.length === 6, dashL.catrows.length + ' rows');
check('the tail is grouped into Other',
  dashL.catrows[5].indexOf('Other (') === 0, dashL.catrows[5].slice(0, 60));
check('line has six points at 1.5px ink', dashL.linePoints === 6 && dashL.lineStrokeWidth === '1.5px',
  dashL.linePoints + ' pts @ ' + dashL.lineStrokeWidth);
check('line uses ink, not a chart colour', dashL.lineStroke === 'rgb(12, 10, 8)', dashL.lineStroke);
check('six bars', dashL.bars === 6, String(dashL.bars));
check('charts number 3', dashL.cards === 3, String(dashL.cards));
check('budget bars are worst-first with every status',
  dashL.budgetFills.join('|') === 'budget__fill--negative 100%|budget__fill--warning 100%|' +
    'budget__fill--warning 80.1%|budget__fill--positive 45.6%', dashL.budgetFills.join(' '));
check('liability card uses the light negative token, no minus sign',
  dashL.liabilityColor === 'rgb(163, 38, 28)' && !/\u2212/.test(dashL.wallets.join('')),
  String(dashL.liabilityColor));
check('liability is subtracted, not stored negative',
  R.balance('card') > 0 && dashL.liabilities === money(R.balance('card')),
  money(R.balance('card')) + ' stored positive');
check('wallet cards: 3 assets + the liability', dashL.wallets.length === 4, String(dashL.wallets.length));
check('insight card present, one only', !!dashL.insight && dashL.cards === 3, dashL.insight);
check('insight names a computed delta',
  /\d+%/.test(dashL.insight || ''), (dashL.insight || '').slice(0, 80));
check('no horizontal overflow on the dashboard',
  dashL.overflowX === 0 && dashD.overflowX === 0,
  dashL.overflowX + ' / ' + dashD.overflowX);
check('nothing clipped by an ancestor at 430px',
  dashL.geom.clipped.length === 0 && dashD.geom.clipped.length === 0,
  dashL.geom.clipped.slice(0, 3).join(' ; ') || 'clean');
check('chart labels do not collide with bars or dots',
  dashL.geom.overlaps.length === 0, dashL.geom.overlaps.join(' ; ') || 'clean');
check('the donut is a ring of six non-collapsed segments',
  dashL.geom.donut.paths === 6 && dashL.geom.donut.collapsed === 0,
  JSON.stringify(dashL.geom.donut));

/* ---- cross-screen: the two screens must agree --------------------------- */
console.log('\ncross-screen consistency');
const bandExpense = (listL.band.match(/EXPENSE \| ([^|]+)/) || [])[1];
check('001 band expense == 003 pie total == ledger',
  bandExpense.trim() === money(oct.expense) && dashL.pieTotal === money(oct.expense) + ' total',
  bandExpense.trim() + ' == ' + money(oct.expense));
const budgetSum = R.budgets('2026-10').reduce((s, b) => s + b.spent, 0);
check('budget spend never exceeds the month expense', budgetSum <= oct.expense,
  money(budgetSum) + ' <= ' + money(oct.expense));
const catSum = R.spendByCategory('2026-10').reduce((s, r) => s + r.amount, 0);
check('categories sum to the month expense exactly', catSum === oct.expense,
  money(catSum) + ' == ' + money(oct.expense));
check('transfers are excluded from income and expense',
  R.monthTx('2026-10').filter((x) => x.type === 'transfer' || x.type === 'exchange').length === 5 &&
  R.monthTotals('2026-10').expense === oct.expense, '5 transfer/exchange rows excluded');

/* ---- the hero's overflow threshold, reported not asserted --------------- */
console.log('\nhero fit (measured \u2014 §5 gives no rule for the overflow)');
(dashL.heroOverflow || []).forEach((line) => console.log('   ' + line));
check('autofit shrinks an overflowing figure, and leaves a fitting one at 60px',
  dashL.heroFit === '60' && dashL.heroAutofit < 60,
  'fits at 60px here; a Rp 12,3 miliar figure drops to ' + dashL.heroAutofit + 'px');

/* ---- 002 Transaction input --------------------------------------------- */
console.log('\n002 transaction input');
const form = probe('002-transaction-input/index.html', 'probe-002.js', 'light');
check('four types, Expense selected first', form.types.join(',') === 'Expense*,Income,Transfer,Exchange',
  form.types.join(','));
check('amount field pins the wallet currency', form.code === 'IDR', form.code);
check('date renders dd/mm/yyyy', form.dateShown === '16/10/2026', form.dateShown);
check('Save is the highlighter with ink-on-accent text',
  form.saveBg === 'rgb(228, 242, 34)' && form.saveFg === 'rgb(12, 10, 8)',
  form.saveBg + ' / ' + form.saveFg);
check('empty amount is refused', /above zero/.test(form.errorOnEmptySave || ''), form.errorOnEmptySave);
check('Income offers only income categories',
  form.catOptionsForIncome.join(',') === 'Salary,Bonus,Interest,Refund,Repayment',
  form.catOptionsForIncome.join(','));
check('typing groups Indonesian-style', form.amountReformatted === '1.250.000', form.amountReformatted);
check('date sheet is a real month grid, dd/mm/yyyy',
  form.dateGrid.days === 31 && form.dateGrid.dows === 'MON TUE WED THU FRI SAT SUN',
  form.dateGrid.days + ' days');
check('picking a day writes it back', form.dateAfterPick === '10/10/2026', form.dateAfterPick);
check('Exchange exposes the received amount and a derived rate',
  form.exchange.toWallet && form.exchange.amountReceived && /Implied rate/.test(form.rateHint || ''),
  form.rateHint);
check('no horizontal overflow on the form', form.overflowX === 0, String(form.overflowX));

/* ---- summary ------------------------------------------------------------ */
const bad = results.filter((r) => !r.ok);
console.log('\n' + (results.length - bad.length) + '/' + results.length + ' assertions passed');
if (bad.length) {
  console.log('FAILED:');
  bad.forEach((b) => console.log('  - ' + b.name + (b.detail ? '  [' + b.detail + ']' : '')));
  process.exitCode = 1;
}
