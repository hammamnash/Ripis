/* ============================================================================
   Ripis — mockup ledger: dataset + derived figures + formatters.
   Plain script (no ES module): file:// blocks module loading, and a mockup you
   cannot double-click is not a mockup.

   Why the data lives here and not in the three pages: the dashboard's hero,
   the month band on the list, and the input screen's wallet balances are the
   same three numbers. Computing them once from one ledger is what makes the
   three screens checkable against each other — mockups/_checks/verify.mjs
   re-derives every figure from the rendered DOM and compares.

   Everything money-shaped here is a JS number ONLY because this is a mockup.
   The real app stores Decimal(19,4), never floating point (.hermes.md, ADR-0003).
   ========================================================================== */
window.RIPIS = (function () {
  'use strict';

  var PRIMARY = 'IDR';

  /* The mockup's "now" — the day this dataset is written to. Both themes and
     both months are reachable from it via the Month Selector. */
  var TODAY = '2026-10-16';
  var CURRENT_YM = '2026-10';

  /* Display-only conversion for the two foreign wallets. NO rate is ever
     stored (ADR-0004) — these exist so the dashboard can total wallets that
     are not in the primary currency, which is the open question this mockup
     exists to expose (see README § Contract gaps #1). */
  var RATE = { IDR: 1, USD: 15600, VND: 0.639375 };
  var CUR = {
    IDR: { mark: 'Rp', minor: 0, suffix: false },
    USD: { mark: '$', minor: 2, suffix: false },
    VND: { mark: '\u20ab', minor: 0, suffix: true }
  };

  /* --- format ------------------------------------------------------------ */
  function groupThousands(digits) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');   /* Indonesian: '.' groups */
  }
  function formatNumber(value, dp) {
    var neg = value < 0;
    var s = Math.abs(value).toFixed(dp === undefined ? 0 : dp);
    var p = s.split('.');
    return (neg ? '\u2212' : '') + groupThousands(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  /* The one currency-aware formatter. `Rp 1.250.000`, `$ 1.240,00`,
     `5.000.000 ₫` — never `.00` on IDR (FR-03, ADR-0026). */
  function formatMoney(value, currency) {
    var c = CUR[currency] || CUR[PRIMARY];
    var neg = value < 0;
    var s = Math.abs(value).toFixed(c.minor);
    var p = s.split('.');
    var digits = groupThousands(p[0]) + (p[1] ? ',' + p[1] : '');
    return (neg ? '\u2212' : '') + (c.suffix ? digits + ' ' + c.mark : c.mark + ' ' + digits);
  }
  function formatDate(iso) {                     /* dd/mm/yyyy (ADR-0026) */
    var p = String(iso).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }
  function monthLabel(ym) {
    var names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return names[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
  }
  function prevMonth(ym) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1;
    if (m === 0) { m = 12; y -= 1; }
    return y + '-' + String(m).padStart(2, '0');
  }
  function nextMonth(ym) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) + 1;
    if (m === 13) { m = 1; y += 1; }
    return y + '-' + String(m).padStart(2, '0');
  }

  /* --- reference data ---------------------------------------------------- */
  /* is_liability is required and stored positive (ADR-0025). It is NOT derived
     from wallet_type for Investment Account / Other — see WALLETS below, where
     the two exceptions carry an explicit flag with no type to infer it from. */
  var WALLETS = [
    { id: 'bca',    name: 'BCA Debit',       type: 'Debit Account',    is_liability: false, currency: 'IDR', opening: 8450000 },
    { id: 'cash',   name: 'Cash Wallet',     type: 'Cash',             is_liability: false, currency: 'IDR', opening: 620000 },
    { id: 'shopee', name: 'ShopeePay',       type: 'Prepaid Card',     is_liability: false, currency: 'IDR', opening: 245000 },
    { id: 'jenius', name: 'Jenius Savings',  type: 'Savings Account',  is_liability: false, currency: 'IDR', opening: 42000000 },
    { id: 'wise',   name: 'Wise USD',        type: 'Investment Account', is_liability: false, currency: 'USD', opening: 1240.00 },
    { id: 'vnd',    name: 'Cash VND',        type: 'Cash',             is_liability: false, currency: 'VND', opening: 4100000 },
    { id: 'card',   name: 'BCA Credit Card', type: 'Credit Card',      is_liability: true,  currency: 'IDR', opening: 4100000 }
  ];

  /* Categories are ONE level, no parent_id (ADR-0014). Each dot colour is a
     §4 palette value — inline `var(--color-chart-N)`, so it resolves in both
     themes and no hex is written into the markup. */
  var CATEGORIES = [
    /* One level, user-owned (ADR-0014) — no parent_id, ever. `c` is the
       category's own colour from the §4 six, used for its chip dot. The pie
       colours by RANK instead (§4's explicit rule), so a category's chip
       colour and its slice colour can legitimately differ. No category may BE
       the highlighter: §4 says #e4f222 cannot be reused as a chart field, so
       c:2 is never assigned to a category. */
    { id: 'food',      name: 'Food',          icon: 'food',      type: 'expense', c: 6 },
    { id: 'transport', name: 'Transport',     icon: 'transport', type: 'expense', c: 4 },
    { id: 'shopping',  name: 'Shopping',      icon: 'shopping',  type: 'expense', c: 3 },
    { id: 'bills',     name: 'Bills',         icon: 'bills',     type: 'expense', c: 5 },
    { id: 'fun',       name: 'Entertainment', icon: 'fun',       type: 'expense', c: 6 },
    { id: 'health',    name: 'Health',        icon: 'health',    type: 'expense', c: 1 },
    { id: 'edu',       name: 'Education',     icon: 'edu',       type: 'expense', c: 3 },
    /* The reconciliation's only home: FR-04 refuses an expense with no
       category, and a balance difference is not spending — see README gap 3. */
    { id: 'other',     name: 'Other',         icon: 'other',     type: 'expense', c: 4 },
    /* Income categories — the input screen filters its picker by type. */
    { id: 'salary',    name: 'Salary',        icon: 'income',    type: 'income',  c: 1 },
    { id: 'bonus',     name: 'Bonus',         icon: 'income',    type: 'income',  c: 3 },
    { id: 'interest',  name: 'Interest',      icon: 'income',    type: 'income',  c: 5 },
    { id: 'refund',    name: 'Refund',        icon: 'income',    type: 'income',  c: 2 },
    { id: 'repay',     name: 'Repayment',     icon: 'income',    type: 'income',  c: 4 }
  ];

  /* Illustrative budgets. Chosen to land on both boundaries FR-10 names:
     exactly 100% is warning, above it is negative. */
  var BUDGETS = [
    { category_id: 'shopping', amount: 2500000 },
    { category_id: 'food',     amount: 3000000 },
    { category_id: 'transport', amount: 1500000 },
    { category_id: 'bills',    amount: 500000 }
  ];

  /* --- the ledger --------------------------------------------------------
     type: expense | income | transfer | exchange   (FR-04, FR-05, FR-06)
     `base` is the frozen primary-currency amount, present only when the
     transaction is not already in the primary currency (FR-02).
     A reconciliation is an ordinary expense noted `Balance Difference` — it
     is not a type and it DOES count toward expense totals (ADR-0017), which
     is why it appears below with no special casing anywhere in this file.
     Notes are as the user typed them; Indonesian notes stay as written.
     ---------------------------------------------------------------------- */
  var TX = [
    /* ---- October 2026 ---- */
    { id: 't01', type: 'income',   date: '2026-10-01', wallet: 'bca',   cat: 'salary', amount: 18500000, note: 'Gaji Oktober',            recorded: '2026-10-01T08:12:04' },
    { id: 't02', type: 'expense',  date: '2026-10-01', wallet: 'cash',  cat: 'food',  amount: 45000,   note: 'Warung Bu Tini',           recorded: '2026-10-01T12:41:55' },
    { id: 't03', type: 'expense',  date: '2026-10-01', wallet: 'bca',   cat: 'bills', amount: 385000,  note: 'Indihome — Oktober',       recorded: '2026-10-01T19:02:10' },
    { id: 't04', type: 'expense',  date: '2026-10-02', wallet: 'shopee',cat: 'food',  amount: 27000,   note: 'Kopi Kenangan',            recorded: '2026-10-02T07:58:30' },
    { id: 't05', type: 'expense',  date: '2026-10-02', wallet: 'bca',   cat: 'transport', amount: 24000, note: 'Gojek ke kantor',        recorded: '2026-10-02T08:21:12' },
    { id: 't06', type: 'expense',  date: '2026-10-03', wallet: 'bca',   cat: 'food',  amount: 312000,  note: 'Superindo',                recorded: '2026-10-03T17:30:44' },
    { id: 't07', type: 'expense',  date: '2026-10-03', wallet: 'bca',   cat: 'shopping', amount: 245000, note: 'Tokopedia — kabel HDMI', recorded: '2026-10-03T21:14:07' },
    { id: 't08', type: 'transfer', date: '2026-10-03', wallet: 'bca',   dest: 'cash', amount: 1500000, note: 'Tarik tunai ATM',          recorded: '2026-10-03T18:05:00' },
    { id: 't45', type: 'transfer', date: '2026-10-04', wallet: 'bca',   dest: 'shopee', amount: 600000, note: 'Top up ShopeePay',      recorded: '2026-10-04T09:15:00' },
    { id: 't09', type: 'expense',  date: '2026-10-04', wallet: 'bca',   cat: 'food',  amount: 96000,   note: 'Sate Taichan',             recorded: '2026-10-04T20:12:31' },
    { id: 't10', type: 'expense',  date: '2026-10-05', wallet: 'bca',   cat: 'transport', amount: 152000, note: 'Pertamina — Pertalite',  recorded: '2026-10-05T09:02:55' }, /* 2 */
    { id: 't11', type: 'income',   date: '2026-10-05', wallet: 'bca',   cat: 'bonus', amount: 2250000, note: 'Bonus proyek',             recorded: '2026-10-05T10:00:00' },
    { id: 't12', type: 'expense',  date: '2026-10-05', wallet: 'shopee',cat: 'food',  amount: 78000,   note: 'GoFood — nasi padang',     recorded: '2026-10-05T13:22:18' },
    { id: 't13', type: 'transfer', date: '2026-10-05', wallet: 'bca',   dest: 'card', amount: 2400000, note: 'Bayar kartu kredit',       recorded: '2026-10-05T16:40:02' },
    { id: 't14', type: 'expense',  date: '2026-10-06', wallet: 'bca',   cat: 'food',  amount: 62000,   note: 'Bakmi GM',                 recorded: '2026-10-06T12:55:09' },
    { id: 't15', type: 'expense',  date: '2026-10-06', wallet: 'bca',   cat: 'shopping', amount: 620000, note: 'Shopee — sepatu lari',   recorded: '2026-10-06T20:31:47' },
    { id: 't16', type: 'exchange', date: '2026-10-06', wallet: 'bca',   dest: 'vnd', amount: 3196875, dest_amount: 5000000, note: 'Tukar ke VND — liburan', recorded: '2026-10-06T15:18:26' },
    { id: 't17', type: 'expense',  date: '2026-10-07', wallet: 'bca',   cat: 'food',  amount: 268000,  note: 'Superindo',                recorded: '2026-10-07T18:44:11' },
    { id: 't18', type: 'expense',  date: '2026-10-07', wallet: 'shopee',cat: 'transport', amount: 18000, note: 'Gojek — pulang kantor',  recorded: '2026-10-07T18:10:03' },
    { id: 't19', type: 'expense',  date: '2026-10-08', wallet: 'bca',   cat: 'bills', amount: 115000,  note: 'Token listrik PLN',        recorded: '2026-10-08T09:33:52' },
    { id: 't20', type: 'income',   date: '2026-10-08', wallet: 'bca',   cat: 'refund', amount: 245000,  note: 'Refund Tokopedia',         recorded: '2026-10-08T11:02:41' },
    { id: 't21', type: 'expense',  date: '2026-10-08', wallet: 'shopee',cat: 'food',  amount: 22000,   note: 'Kopi Janji Jiwa',          recorded: '2026-10-08T15:20:37' },
    { id: 't22', type: 'expense',  date: '2026-10-09', wallet: 'bca',   cat: 'food',  amount: 185000,  note: 'Makan siang dengan klien', recorded: '2026-10-09T13:05:20' },
    { id: 't23', type: 'expense',  date: '2026-10-09', wallet: 'bca',   cat: 'transport', amount: 285000, note: 'Grab ke bandara',        recorded: '2026-10-09T05:40:00' },
    { id: 't24', type: 'expense',  date: '2026-10-10', wallet: 'card',  cat: 'shopping', amount: 1450000, note: 'IKEA — rak buku',        recorded: '2026-10-10T14:22:09' },
    { id: 't25', type: 'transfer', date: '2026-10-10', wallet: 'bca',   dest: 'jenius', amount: 3000000, note: 'Menabung',               recorded: '2026-10-10T08:00:00' },
    { id: 't26', type: 'expense',  date: '2026-10-10', wallet: 'cash',  cat: 'food',  amount: 58000,   note: 'Warung Sederhana',         recorded: '2026-10-10T19:55:41' },
    { id: 't27', type: 'expense',  date: '2026-10-11', wallet: 'bca',   cat: 'food',  amount: 341000,  note: 'Superindo',                recorded: '2026-10-11T17:12:26' },
    { id: 't28', type: 'expense',  date: '2026-10-11', wallet: 'bca',   cat: 'fun',   amount: 240000,  note: 'CGV — bioskop',            recorded: '2026-10-11T20:30:00' },
    { id: 't29', type: 'income',   date: '2026-10-12', wallet: 'jenius',cat: 'interest', amount: 128400,  note: 'Bunga tabungan',           recorded: '2026-10-12T00:05:00' },
    { id: 't30', type: 'expense',  date: '2026-10-12', wallet: 'shopee',cat: 'food',  amount: 64000,   note: 'GoFood — ayam geprek',     recorded: '2026-10-12T12:48:12' },
    { id: 't31', type: 'expense',  date: '2026-10-12', wallet: 'bca',   cat: 'transport', amount: 148000, note: 'Pertamina — Pertalite',  recorded: '2026-10-12T08:44:35' },
    { id: 't32', type: 'expense',  date: '2026-10-13', wallet: 'bca',   cat: 'shopping', amount: 385000, note: 'Tokopedia — mouse',      recorded: '2026-10-13T21:40:18' },
    { id: 't33', type: 'expense',  date: '2026-10-13', wallet: 'shopee',cat: 'food',  amount: 24000,   note: 'Kopi Kenangan',            recorded: '2026-10-13T08:05:44' },
    { id: 't34', type: 'expense',  date: '2026-10-13', wallet: 'bca',   cat: 'health',amount: 185000,  note: 'Apotek K24',               recorded: '2026-10-13T19:11:02' },
    { id: 't35', type: 'expense',  date: '2026-10-14', wallet: 'card',  cat: 'food',  amount: 486000,  note: 'Sushi Tei — ulang tahun',  recorded: '2026-10-14T19:30:26' },
    { id: 't36', type: 'expense',  date: '2026-10-14', wallet: 'card',  cat: 'fun',   amount: 186000,  note: 'Netflix — Oktober',        recorded: '2026-10-14T06:00:00' },
    { id: 't37', type: 'expense',  date: '2026-10-14', wallet: 'bca',   cat: 'transport', amount: 22000, note: 'Gojek — ke kantor',      recorded: '2026-10-14T07:52:39' },
    { id: 't38', type: 'expense',  date: '2026-10-15', wallet: 'bca',   cat: 'food',  amount: 293000,  note: 'Superindo',                recorded: '2026-10-15T18:02:14' },
    { id: 't39', type: 'income',   date: '2026-10-15', wallet: 'bca',   cat: 'repay', amount: 500000,  note: 'Ari bayar utang',          recorded: '2026-10-15T09:20:00' },
    { id: 't40', type: 'expense',  date: '2026-10-15', wallet: 'cash',  cat: 'transport', amount: 35000, note: 'Parkir + tol',           recorded: '2026-10-15T11:15:00' },
    { id: 't41', type: 'expense',  date: '2026-10-16', wallet: 'cash',  cat: 'food',  amount: 42000,   note: 'Warung Bu Tini',           recorded: '2026-10-16T12:30:00' },
    { id: 't42', type: 'expense',  date: '2026-10-16', wallet: 'cash',  cat: 'other', amount: 50000,   note: 'Balance Difference',       recorded: '2026-10-16T20:10:00' },
    { id: 't43', type: 'expense',  date: '2026-10-16', wallet: 'wise',  cat: 'edu',   amount: 90.00,   cur: 'USD', base: 1404000, note: 'Coursera — EA course', recorded: '2026-10-16T14:00:00' },
    { id: 't44', type: 'expense',  date: '2026-10-14', wallet: 'card',  cat: 'fun',   amount: 54000,   note: 'Spotify',                  recorded: '2026-10-14T06:01:00' },

    /* ---- September 2026 (the comparison month) ---- */
    { id: 's01', type: 'income',   date: '2026-09-30', wallet: 'bca',   cat: 'salary', amount: 18500000, note: 'Gaji September',           recorded: '2026-09-30T08:00:00' },
    { id: 's02', type: 'expense',  date: '2026-09-03', wallet: 'bca',   cat: 'food',  amount: 412000,  note: 'Superindo',                recorded: '2026-09-03T17:20:00' },
    { id: 's03', type: 'expense',  date: '2026-09-06', wallet: 'shopee',cat: 'food',  amount: 26000,   note: 'Kopi Kenangan',            recorded: '2026-09-06T08:10:00' },
    { id: 's04', type: 'expense',  date: '2026-09-09', wallet: 'bca',   cat: 'transport', amount: 32000, note: 'Gojek',                  recorded: '2026-09-09T08:30:00' },
    { id: 's05', type: 'expense',  date: '2026-09-11', wallet: 'bca',   cat: 'food',  amount: 388000,  note: 'Superindo',                recorded: '2026-09-11T18:00:00' },
    { id: 's06', type: 'expense',  date: '2026-09-14', wallet: 'cash',  cat: 'food',  amount: 64000,   note: 'Warung Bu Tini',           recorded: '2026-09-14T12:40:00' },
    { id: 's07', type: 'expense',  date: '2026-09-17', wallet: 'bca',   cat: 'transport', amount: 145000, note: 'Pertamina',              recorded: '2026-09-17T09:00:00' },
    { id: 's08', type: 'expense',  date: '2026-09-20', wallet: 'bca',   cat: 'food',  amount: 425000,  note: 'Superindo',                recorded: '2026-09-20T17:45:00' },
    { id: 's09', type: 'expense',  date: '2026-09-21', wallet: 'cash',  cat: 'food',  amount: 112000,  note: 'Bakso Pak Kumis',          recorded: '2026-09-21T13:10:00' },
    { id: 's10', type: 'transfer', date: '2026-09-22', wallet: 'bca',   dest: 'card', amount: 1950000, note: 'Bayar kartu kredit',       recorded: '2026-09-22T16:00:00' },
    { id: 's11', type: 'expense',  date: '2026-09-24', wallet: 'bca',   cat: 'food',  amount: 384000,  note: 'Superindo',                recorded: '2026-09-24T18:20:00' },
    { id: 's12', type: 'expense',  date: '2026-09-26', wallet: 'bca',   cat: 'shopping', amount: 268000, note: 'Tokopedia — lampu meja', recorded: '2026-09-26T20:05:00' },
    { id: 's13', type: 'expense',  date: '2026-09-28', wallet: 'card',  cat: 'fun',   amount: 186000,  note: 'Netflix — September',      recorded: '2026-09-28T06:00:00' },
    { id: 's14', type: 'expense',  date: '2026-09-29', wallet: 'shopee',cat: 'food',  amount: 24000,   note: 'Kopi Kenangan',            recorded: '2026-09-29T08:12:00' },
    { id: 's15', type: 'expense',  date: '2026-09-02', wallet: 'bca',   cat: 'shopping', amount: 348000, note: 'Tokopedia \u2014 keyboard',   recorded: '2026-09-02T21:40:00' },
    { id: 's16', type: 'expense',  date: '2026-09-05', wallet: 'card',  cat: 'shopping', amount: 1290000, note: 'Apple Store \u2014 charger & kabel', recorded: '2026-09-05T15:22:00' },
    { id: 's17', type: 'expense',  date: '2026-09-08', wallet: 'cash',  cat: 'health', amount: 165000,  note: 'Apotek K24',                recorded: '2026-09-08T19:05:00' },
    { id: 's18', type: 'expense',  date: '2026-09-10', wallet: 'bca',   cat: 'bills',  amount: 412000,  note: 'Indihome \u2014 September',   recorded: '2026-09-10T09:00:00' },
    { id: 's19', type: 'expense',  date: '2026-09-12', wallet: 'bca',   cat: 'fun',    amount: 120000,  note: 'TIX ID \u2014 bioskop',       recorded: '2026-09-12T20:15:00' },
    { id: 's20', type: 'expense',  date: '2026-09-16', wallet: 'card',  cat: 'shopping', amount: 780000, note: 'IKEA \u2014 rak buku',        recorded: '2026-09-16T14:30:00' },
    { id: 's21', type: 'expense',  date: '2026-09-21', wallet: 'bca',   cat: 'transport', amount: 150000, note: 'Pertamina \u2014 Pertalite', recorded: '2026-09-21T07:45:00' },
    { id: 's22', type: 'expense',  date: '2026-09-23', wallet: 'bca',   cat: 'health', amount: 240000,  note: 'Klinik gigi',               recorded: '2026-09-23T11:20:00' },
    { id: 's23', type: 'expense',  date: '2026-09-27', wallet: 'bca',   cat: 'other',  amount: 1240000, note: 'Hotel \u2014 perjalanan kerja', recorded: '2026-09-27T18:55:00' }
  ];

  /* Monthly expense totals for the trend chart. Computed by
     mockups/_checks/verify.mjs, not trusted from this table. */
  var TREND = [
    { m: '2026-05', expense: 6850000, income: 18500000 },
    { m: '2026-06', expense: 7240000, income: 18500000 },
    { m: '2026-07', expense: 6120000, income: 18500000 },
    { m: '2026-08', expense: 7980000, income: 20750000 },
    { m: '2026-09', expense: 0,       income: 18500000 },
    { m: '2026-10', expense: 0,       income: 0 }
  ];

  /* --- derived ----------------------------------------------------------- */
  function tx() {
    return TX.filter(function (t) { return t.amount !== 0; });   /* amount 0 is a placeholder, never a row */
  }
  function wallet(id) {
    for (var i = 0; i < WALLETS.length; i++) if (WALLETS[i].id === id) return WALLETS[i];
    return null;
  }
  function category(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  }
  function cur(t) { return t.cur || wallet(t.wallet).currency; }
  /* Amount in the primary currency: `amount` when already primary, else the
     frozen base_amount (FR-02). Never recomputed from a rate. */
  function primaryAmount(t) { return cur(t) === PRIMARY ? t.amount : t.base; }

  /* The one place a wallet's money direction is decided (ADR-0025).
     value = is_liability ? -balance : +balance — so an expense on a credit
     card INCREASES its balance and DECREASES its value. Every rule below is
     written against `value`, never against `balance`. */
  function balanceDelta(w) {
    var d = 0;
    tx().forEach(function (t) {
      var v = valueDelta(t, w.id);
      d += (w.is_liability ? -v : v);
    });
    return d;
  }
  function valueDelta(t, walletId) {
    if (t.type === 'expense') return t.wallet === walletId ? -t.amount : 0;
    if (t.type === 'income')  return t.wallet === walletId ? t.amount : 0;
    if (t.type === 'transfer' || t.type === 'exchange') {
      if (t.wallet === walletId) return -t.amount;
      if (t.dest === walletId) return t.dest_amount === undefined ? t.amount : t.dest_amount;
    }
    return 0;
  }
  function balance(id) { var w = wallet(id); return w.opening + balanceDelta(w); }   /* stored positive, statement-shaped */
  function value(id) { var w = wallet(id); return w.is_liability ? -balance(id) : balance(id); }
  function toPrimary(walletValue, currency) { return walletValue * RATE[currency]; }
  function balances() {
    return WALLETS.map(function (w) {
      return { w: w, balance: balance(w.id), value: value(w.id), primary: toPrimary(value(w.id), w.currency) };
    });
  }
  /* Net worth is assets − liabilities, in one place (.hermes.md), not summed
     as two signs in the UI. */
  function totals() {
    var assets = 0, liabilities = 0;
    balances().forEach(function (b) {
      if (b.w.is_liability) liabilities += toPrimary(b.balance, b.w.currency);
      else assets += toPrimary(b.balance, b.w.currency);
    });
    return { assets: assets, liabilities: liabilities, net: assets - liabilities };
  }
  function monthTx(ym) {
    return tx().filter(function (t) { return t.date.slice(0, 7) === ym; })
      .sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
  }
  /* A transfer appears in neither income nor expense totals (FR-05). An
     exchange is also a move between the user's own wallets, so it is excluded
     from both too — the only rows that count are income and expense. */
  function monthTotals(ym) {
    var income = 0, expense = 0;
    monthTx(ym).forEach(function (t) {
      if (t.type === 'income') income += primaryAmount(t);
      else if (t.type === 'expense') expense += primaryAmount(t);
    });
    return { income: income, expense: expense, net: income - expense };
  }
  function spendByCategory(ym) {
    var map = {};
    monthTx(ym).forEach(function (t) {
      if (t.type !== 'expense') return;
      var k = t.cat || 'other';
      map[k] = (map[k] || 0) + primaryAmount(t);
    });
    return Object.keys(map).map(function (k) {
      return { id: k, name: category(k) ? category(k).name : 'Other', amount: map[k] };
    }).sort(function (a, b) { return b.amount - a.amount; });
  }
  /* §4: six slices plus "Other" — the top five by amount, then one grouped
     tail. Colours are assigned by RANK, which is the document's explicit rule
     (largest gets ink, second gets the highlighter). */
  function pieSlices(ym) {
    var rows = spendByCategory(ym), top = rows.slice(0, 5), tail = rows.slice(5);
    var slices = top.map(function (r, i) { return { name: r.name, amount: r.amount, rank: i + 1 }; });
    var rest = tail.reduce(function (s, r) { return s + r.amount; }, 0);
    if (rest > 0) slices.push({ name: 'Other', amount: rest, rank: 6, grouped: tail.map(function (t) { return t.name; }) });
    var total = slices.reduce(function (s, r) { return s + r.amount; }, 0);
    slices.forEach(function (s) { s.share = total ? s.amount / total : 0; });
    return { slices: slices, total: total };
  }
  /* FR-10: exactly 100% is warning, negative begins only ABOVE it. */
  function budgetStatus(spent, limit) {
    var ratio = limit ? spent / limit : 0;
    var status = ratio > 1 ? 'negative' : (ratio >= 0.8 ? 'warning' : 'positive');
    return { ratio: ratio, status: status, pct: Math.round(ratio * 100), remaining: limit - spent, limit: limit, spent: spent };
  }
  function budgets(ym) {
    var spend = {};
    spendByCategory(ym).forEach(function (r) { spend[r.id] = r.amount; });
    return BUDGETS.map(function (b) {
      var spent = spend[b.category_id] || 0;
      var s = budgetStatus(spent, b.amount);
      s.category = category(b.category_id);
      return s;
    }).sort(function (a, b) { return b.ratio - a.ratio; });
  }
  function monthCount(ym) { return monthTx(ym).length; }

  /* FR-06: nothing is stored; the rate is arithmetic, derived for display only. */
  function impliedRate(t) {
    var from = wallet(t.wallet).currency, to = wallet(t.dest).currency;
    return {
      from: from, to: to, source: t.amount, dest: t.dest_amount,
      oneFrom: t.dest_amount / t.amount,
      oneTo: t.amount / t.dest_amount,
      text: '1 ' + from + ' = ' + formatNumber(t.dest_amount / t.amount, 4) + ' ' + to +
            '  ·  1 ' + to + ' = ' + formatNumber(t.amount / t.dest_amount, 4) + ' ' + from
    };
  }

  /* The six-month series. Months the ledger actually holds rows for are
     recomputed from the rows — the seed figures are only for older months. */
  function trend() {
    return TREND.map(function (r) {
      var n = monthCount(r.m);
      if (!n) { return { m: r.m, expense: r.expense, income: r.income, n: 0 }; }
      var t = monthTotals(r.m);
      return { m: r.m, expense: t.expense, income: t.income, n: n };
    });
  }

  return {
    TODAY: TODAY, CURRENT_YM: CURRENT_YM,
    PRIMARY: PRIMARY, RATE: RATE, CUR: CUR, WALLETS: WALLETS, CATEGORIES: CATEGORIES, BUDGETS: BUDGETS,
    TX: TX, TREND: TREND, trend: trend,
    formatMoney: formatMoney, formatNumber: formatNumber, formatDate: formatDate,
    monthLabel: monthLabel, prevMonth: prevMonth, nextMonth: nextMonth,
    tx: tx, wallet: wallet, category: category, cur: cur, primaryAmount: primaryAmount,
    balance: balance, value: value, balances: balances, totals: totals, toPrimary: toPrimary,
    monthTx: monthTx, monthTotals: monthTotals, monthCount: monthCount,
    spendByCategory: spendByCategory, pieSlices: pieSlices,
    budgetStatus: budgetStatus, budgets: budgets, impliedRate: impliedRate
  };
})();
