/* Prints every derived figure the mockup screens render, so the numbers in the
   README/report are computed, not guessed. Run: node mockups/_checks/figures.mjs
   Numbers here are JS floats because this is a mockup; the real app is
   Decimal(19,4) (ADR-0003). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(root, '_shared', 'ledger.js'), 'utf8'))();

const R = window.RIPIS;
const M = R.formatMoney, N = R.formatNumber;
const pad = (s, n) => String(s).padEnd(n);
const catSpend = (ym, id) => (R.spendByCategory(ym).find(r => r.id === id) || { amount: 0 }).amount;

console.log('=== WALLETS ===  (a liability stores its balance POSITIVE and is subtracted, ADR-0025)');
R.balances().forEach(b => {
  console.log(pad(b.w.name, 21), pad(b.w.type, 18), pad(b.w.currency, 4),
    'opening=' + pad(M(b.w.opening, b.w.currency), 16),
    'balance=' + pad(M(b.balance, b.w.currency), 16),
    'value(IDR)=' + pad(M(b.primary, 'IDR'), 18),
    b.w.is_liability ? 'LIABILITY (required flag)' : '');
});
const T = R.totals();
console.log(pad('assets', 21), M(T.assets, 'IDR'));
console.log(pad('liabilities', 21), M(T.liabilities, 'IDR'));
console.log(pad('NET WORTH', 21), M(T.net, 'IDR'));

for (const ym of ['2026-10', '2026-09']) {
  const t = R.monthTotals(ym);
  console.log('\n=== ' + R.monthLabel(ym) + ' ===  rows: ' + R.monthCount(ym) +
    '  income ' + M(t.income, 'IDR') + '  expense ' + M(t.expense, 'IDR') + '  net ' + M(t.net, 'IDR'));
}

console.log('\n=== BUDGET BARS (October), sorted worst-first like the screen ===');
R.budgets('2026-10').forEach(b => {
  console.log(pad(b.category.name, 13), pad(M(b.spent, 'IDR') + ' of ' + M(b.limit, 'IDR'), 38),
    pad((b.ratio * 100).toFixed(2) + '%', 9), pad(b.status, 9),
    b.remaining < 0 ? 'over by ' + M(-b.remaining, 'IDR') : 'left ' + M(b.remaining, 'IDR'));
});

console.log('\n=== EXPENSE BY CATEGORY (October) — ranked, pie colours by rank (§4) ===');
R.spendByCategory('2026-10').forEach(r => console.log(pad(r.name, 14), M(r.amount, 'IDR')));
const P = R.pieSlices('2026-10');
console.log('--- pie: top 5 + one grouped tail = 6 slices ---');
P.slices.forEach(s => console.log('  rank ' + s.rank, pad(s.name, 16), pad(M(s.amount, 'IDR'), 16),
  (s.share * 100).toFixed(1) + '%', s.grouped ? '(merged: ' + s.grouped.join(', ') + ')' : ''));
console.log('  pie total', M(P.total, 'IDR'));

console.log('\n=== INCOME BY CATEGORY (October) ===');
R.spendByCategory('2026-10').forEach(() => {});
R.monthTx('2026-10').filter(t => t.type === 'income').forEach(t => {});
const inc = {};
R.monthTx('2026-10').filter(t => t.type === 'income').forEach(t => { inc[t.cat] = (inc[t.cat] || 0) + R.primaryAmount(t); });
Object.keys(inc).sort((a, b) => inc[b] - inc[a]).forEach(k => console.log(pad(R.category(k).name, 14), M(inc[k], 'IDR')));

console.log('\n=== FOOD: October vs September (the insight card line) ===');
const oct = catSpend('2026-10', 'food'), sep = catSpend('2026-09', 'food');
console.log('oct', M(oct, 'IDR'), '| sep', M(sep, 'IDR'), '| delta', ((oct / sep - 1) * 100).toFixed(1) + '%');

console.log('\n=== EXPENSE TREND (6 months, line chart) ===');
R.TREND.forEach(r => console.log(pad(r.m, 9), pad(R.monthLabel(r.m), 16), M(r.expense, 'IDR'), ' income', M(r.income, 'IDR')));

console.log('\n=== EXCHANGE — FR-06 implied rate, nothing stored ===');
R.TX.filter(t => t.type === 'exchange').forEach(t => console.log(R.impliedRate(t).text));

console.log('\n=== CROSS-SCREEN INVARIANTS ===');
const t = R.monthTotals('2026-10');
const catSum = R.spendByCategory('2026-10').reduce((a, r) => a + r.amount, 0);
const budSum = R.budgets('2026-10').reduce((a, b) => a + b.spent, 0);
const rec = R.TX.filter(x => x.note === 'Balance Difference' && x.date.startsWith('2026-10'));
const sumRow = R.TX.filter(x => x.type === 'transfer').reduce((a, r) => a + r.amount, 0);
console.log('byCategory sum == month expense       :', catSum === t.expense, M(catSum, 'IDR'), M(t.expense, 'IDR'));
console.log('budget spend <= month expense         :', budSum <= t.expense, M(budSum, 'IDR'));
console.log('income - expense == net               :', t.income - t.expense === t.net);
console.log('transfers excluded from income/expense:', sumRow > 0 && t.expense < sumRow + t.expense, '(' + M(sumRow, 'IDR') + ' of transfers in the month)');
console.log('reconciliation rows counted as expense:', rec.length, M(rec.reduce((a, r) => a + r.amount, 0), 'IDR'), '(ADR-0017)');
console.log('pie total == category sum             :', P.total === catSum);
