# Ripis - Phase 7 handoff (remaining work)

Repo: `C:/Users/ATDSOL/Working Directory/Personal Project/Ripis`
Branch: local `main`, HEAD `53be5b2`. Not pushed.
Last green: gate 0, build 0, Playwright 25 passed.

## Verify before you change anything

```
npm run build      # after ANY app/ change: Playwright runs against the build
npm run gate       # typecheck (incl. e2e) + token/doc checks + vitest invariants
npx playwright test
```

Progress log: `.hermes/plans/2026-10-19_090231-ripis-phase-7-shell-theming-pwa.md`

## Done - do not rebuild

| Area | Files | Commit |
|---|---|---|
| Shell, themes, PWA, sign-in, guard | `components/shell/`, `app/(app)/layout.tsx` | 0925016 |
| Dashboard | `app/(app)/page.tsx` | earlier |
| List, filters, pagination | `app/(app)/transactions/page.tsx` | 287b344, 3dc5b3c, 44bdb6e |
| Detail + delete | `app/(app)/transactions/[id]/` | c2c580e, 53be5b2 |
| Add expense/income/transfer | `app/(app)/transactions/new/` | 0925016 |
| Budgets | `app/(app)/budgets/page.tsx` | a61bd91 |
| Wallets list + detail | `app/(app)/wallets/` | bd07313 |

## Task A - Edit a transaction (do this first)

`updateTransaction` exists in `src/server/transactions/update-transaction.ts`; no UI reaches it.

1. `app/(app)/transactions/[id]/edit/actions.ts` - `"use server"`, `requireScreenSession`, `runAsCaller`, call `updateTransaction`, `revalidatePath("/transactions")`, redirect back to the detail page.
2. `app/(app)/transactions/[id]/edit/page.tsx` - `connection()`, load the row, `notFound()` if absent, render the form pre-filled.
3. `components/transaction-form.tsx` - take `initial?` and an `action` prop; today it imports the create action directly.
4. Add an "Edit" link on the detail page, beside the delete disclosure.

**The spec that matters:** edit an expense 250000 -> 300000 and assert the wallet
`current_balance` moved by +50000, not +300000. Pass means the old amount was reversed first;
fail means the ledger double-counted and that is a corruption bug, not a UI bug. Read the module body
before writing the spec - this document has not verified it.

## Task B - Reconcile a wallet (ADR-0017)

`app/(app)/wallets/[id]/page.tsx` reads its balance from `getWallet` (`src/server/wallets/list-wallets.ts`). There is no way to correct a drifted balance.

Reconcile posts an ordinary income or expense described "Balance Difference" for the gap. Reuse the
existing create path - do not add a new transaction type and do not write `current_balance` from a screen.
Then a spec: type the real balance, assert `current_balance` equals it and exactly one row exists.

## Task C - Cross-currency transfer (unproven)

Same-currency is proven (`e2e/transactions-transfer.spec.ts`). The exchange leg - two wallets in different currencies plus `destinationAmount` - has never run.

Seed a wallet in a second currency, drive the form, assert both balances moved. If it fails, hide transfer between differing currencies until it works.

## Task D - Export (one product decision pending)

ADR-0008: export then import must round-trip. The server half is tested (`test/import-cashbook.spec.ts`). Decided default: one Settings -> Data section, Export above Import.

## Task E - Settings, change password, cookie ADR (7.4g)

Settings screen, change-password action, and an ADR for the session cookie: it carries a session id (httpOnly) re-checked against the database on every server render, so revocation is immediate.

## Tooling traps on this host (these cost hours)

1. **Every write path truncates.** `write_file`, `patch`, `execute_code` and `terminal` payloads cut off at random - sometimes at 200 bytes, sometimes 1500.
   A truncated `patch` leaves the file torn mid-attribute. Write via `execute_code` + `Path.write_text` in chunks under ~600 chars, print `p.stat().st_size`, read the tail back. To repair a torn file, cut at the damaged line and rebuild the tail.
2. **Terminal stdout collapses to a byte count** (`-> exit 0, 1 lines output`). Redirect to `$LOCALAPPDATA/Temp/x.log`, then `read_file` it.
3. `npm run gate` pins the string `current_balance` to six files (Task 3.11). A seventh mention - even in a comment - fails the gate. Read balances through `getWallet`.
4. DB check constraint `income_expense_need_category`: an expense or income with no `category_id` is refused by Postgres - validate it in the action so the message is human.
5. Prisma enums in specs need `as const` (`wallet_type: "cash" as const`), or the gate's typecheck fails even though Playwright passes.
6. Playwright strict mode: seeded names and amounts match several nodes - use `{ exact: true }` plus `.first()`.
7. A route you assume is a stub may be committed and working - check `git status`/`git log` before deleting anything under `app/`.

## State of the tree

Clean at `53be5b2`; nothing is half-built - every route either works or was never started. Keep commits small and run the gate before each one, so a fresh session can stop at any commit.
