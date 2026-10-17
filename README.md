# Ripis

**A private finance tracker you run yourself.** Every wallet, currency and transaction you have, in one
ledger — on your own hardware, with nobody else's data in it.

> **Status: foundations built, no screens yet.** The database schema and its eight migrations, the
> seed, the one money formatter and the server-side scoping layer exist and are covered by
> `npm run gate`; the interface is not built, so there is nothing to click yet. What follows describes
> the application being built.

## What it's for

Ripis tracks a whole financial life in one place: money you have, money you owe, what you spend, what
you earn, what you move between accounts, and what you're saving toward.

It takes seriously two things about real money that simple trackers handle badly.

**Money lives in more than one currency.** A wallet holds its own balance in its own currency, and each
transaction also stores what it was worth in your primary currency at the moment you entered it —
frozen, so changing your primary currency later never rewrites your history.

**Some balances are debts.** A credit card holding Rp 2.000.000 of debt is stored as **2.000.000**, the
figure the statement prints. Ripis subtracts it from your net worth because the wallet *is marked as a
liability* — not because of a minus sign — so a card you've overpaid shows as money you have instead of
being clamped to zero.

## What you can do

### Keep your wallets

Eleven account types: Cash, Debit Account, Savings, Checking, Prepaid Card, E-Wallet, Credit Card, Loan,
Debt, Investment Account, and Other. Each holds a balance in its own currency and can be reconciled.

Nine of the eleven know whether they're an asset or a debt. For **Investment Account** and **Other**,
Ripis asks rather than guesses — because a wrong guess moves your net worth with nothing on screen to
notice, and one required click is the cheaper mistake.

### Record what happens

- **Expense** and **Income**, against a wallet and a category
- **Transfer** between two wallets
- **Currency exchange**, at whatever rate it implies — there's no rate to type

### Reconcile against reality

Tell Ripis the real balance and it works out the difference, shows you the before, the after and the
delta, asks why, and writes the adjustment. Your records match the statement, and the correction is
visible in the history rather than silently absorbed.

### Set a budget and know where you stand

Monthly, per category. Ripis states your position in words as well as a percentage, and warns you on the
way to the limit rather than after you've passed it.

### Find anything

Search descriptions, notes and merchant names — on the server, so it stays quick as your history grows.
Filter by date range, wallet, category, amount range, currency, tags, or transaction type. Because one
account is one private ledger, there's deliberately no filter for *whose* transactions these are: they
are always yours.

### See the shape of it

A dashboard with this month's income, expense, savings and transaction count, alongside total assets,
total liabilities, and net worth — what's actually yours. Months follow your timezone, so a 23:30
purchase on the 31st lands in the month you'd expect no matter where the server sits.

### Take your data back out

Excel export laid out like the cashbook people already keep — export it, import it again, and the
balances agree. An audit trail records every create, edit, delete, restore and export. Deleted entries
leave your lists, balances and totals but stay visible to the log, and they can be brought back.

### Never forget a bill *(coming next, after V1)*

Set a monthly bill due on the 4th and Ripis tells you it's coming — on the day, or 1, 3 or 7 days ahead.

## What it deliberately doesn't do

- **Reminders only appear when you open the app.** There is no background process and no push
  notification, so nothing will interrupt you on the 4th. That's the accepted trade, and it's what keeps
  Ripis free of a job queue, a scheduler and a push-subscription service.
- **No bank connections.** Nothing syncs by itself. You record, or import, what happened.
- **No sharing.** One account is one private ledger — no household, no joint view, no way to see
  another person's rows. That's enforced where the data is read, not in the interface.
- **No offline writing yet.** Ripis installs like an app and works on a phone, but offline caching and an
  offline write queue are deferred.

## How it looks

Built for a phone first and still complete on a desktop browser. Light and dark themes carry the same
information, text meets WCAG AA contrast, and nothing you can tap is smaller than 44×44px.

Money reads the way your currency does: an Indonesian rupiah amount shows as **Rp 1.250.000**, never
`Rp 1.250.000,00`. Dates are dd/mm/yyyy.

Before your first transaction, you set the primary currency — the one your totals and net worth are
reported in.

## Where it's going

**First release:** signing in and setting your primary currency, wallets with reconciliation, the four
transaction types, the dashboard, budgets, search, Excel export, the audit trail, and an installable
interface.

**After that:** recurring bills and reminders, a net worth trend over time, and tooling to import a real
9,174-row historical cashbook.

## The small print

Ripis is specified, and its foundations are built: the schema, the seed and the money rules run today,
while the screens do not. The binding description — requirements, data model, screens, and the
decisions behind them including the alternatives that were rejected — lives in [`.ai/`](./.ai/). This
page describes the application to the person who will use it; that folder is what it gets built from.
