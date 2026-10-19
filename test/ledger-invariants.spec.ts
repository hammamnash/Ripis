import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Task 3.11 — the invariants that no runtime test can watch.
 *
 * Three rules in this project are properties of the *source* rather than of any one request, and each of
 * them fails silently when it is broken: a second writer of `current_balance` leaves two figures that
 * disagree with no code path to notice; a money query that forgets `deleted_at IS NULL` inflates a total
 * that looks entirely plausible; and a stored exchange rate becomes a historical figure that cannot be
 * recomputed. A spec is the only thing that can hold those, so this file reads the tree.
 *
 * It is deliberately an allowlist rather than a search for the bad pattern. "No file writes
 * `current_balance` except this one" is a claim that a new file has to be argued against; "no file contains
 * a `-` in front of a balance" is a claim nobody can check.
 */
const REPO = join(import.meta.dirname, '..');

function sourcesUnder(...roots: string[]): { path: string; text: string }[] {
  const found: { path: string; text: string }[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== 'node_modules' && entry !== '__tests__') walk(full);
        continue;
      }
      if (full.endsWith('.ts') || full.endsWith('.tsx')) {
        found.push({ path: full.replace(`${REPO}\\`, '').replace(`${REPO}/`, ''), text: readFileSync(full, 'utf8') });
      }
    }
  };
  for (const root of roots) walk(join(REPO, root));

  return found;
}

describe('Task 3.11 — what the source may not contain', () => {
  const sources = sourcesUnder('src', 'app');

  it('found sources to check', () => {
    // An empty walk would make every assertion below vacuous — the failure mode this project has already
    // been bitten by once, in the Task 1.5 RED run.
    expect(sources.length).toBeGreaterThan(40);
  });

  it('writes current_balance in exactly one module, and only ever reads it elsewhere', () => {
    // The writer, stated as a shape rather than as a filename: an update or an upsert of a wallet that sets
    // `current_balance` in the same call. That is the only way the stored figure can change (ADR-0025).
    const WRITES = /\.wallet\.(update|upsert)\([^)]*current_balance/s;

    expect(sources.filter((source) => WRITES.test(source.text)).map((source) => source.path)).toEqual([
      join('src', 'server', 'wallets', 'balance.ts'),
    ]);
  });

  it('mentions current_balance in exactly these files, so a sixth has to be argued for', () => {
    const mentioning = sources
      .filter((source) => source.text.includes('current_balance'))
      .map((source) => source.path)
      .sort();

    // Each of these is a read or a statement of intent and none of them assigns the figure:
    //   balance.ts        — recomputes and stores it, the one writer
    //   create-wallet.ts  — states it once at birth; a wallet with no transactions holds its opening balance
    //   serialise.ts      — reads it to send it on the wire
    //   remove-wallet.ts  — reads it into the audit row for a deletion, so the figure is recorded as it was
    //   wallet-summary.ts — reads it to state what the wallets are worth; net worth is the sum of these
    //                       columns, and recomputing it by walking every wallet's transactions would be a
    //                       second arithmetic path for a figure that already has one (ADR-0025, ADR-0059)
    //   money/direction.ts — names it in the comment that explains what `value` is measured against
    expect(mentioning).toEqual(
      [
        join('src', 'server', 'money', 'direction.ts'),
        join('src', 'server', 'reports', 'wallet-summary.ts'),
        join('src', 'server', 'wallets', 'balance.ts'),
        join('src', 'server', 'wallets', 'create-wallet.ts'),
        join('src', 'server', 'wallets', 'remove-wallet.ts'),
        join('src', 'server', 'wallets', 'serialise.ts'),
      ].sort(),
    );
  });

  it('runs no query over money without a soft-delete filter, except the read that exists to find a hidden row', () => {
    // Limited to the two tables money moves through. A category lookup is not a money query: it carries no
    // amount, so a missing `deleted_at` there cannot inflate a total — it changes which name is refused.
    const MONEY_QUERY = /\.(transaction|wallet)\.(findMany|findFirst|count|aggregate|groupBy)\(/;

    // The exception is stated rather than tolerated: restoring a transaction has to be able to find the row
    // a delete hid, which is the whole point of restoring it.
    const ALLOWED = [join('src', 'server', 'transactions', 'update-transaction.ts')];

    const offenders = sources
      .filter((source) => MONEY_QUERY.test(source.text) && !source.text.includes('deleted_at'))
      .map((source) => source.path)
      .filter((path) => !ALLOWED.includes(path));

    expect(offenders).toEqual([]);
  });

  it('never queries User or Session without naming the row it means', () => {
    // ADR-0043 keeps both out of the scoping extension — a caller is established *by* looking one up — so
    // nothing narrows these two tables and an unfiltered `findFirst` returns whichever row the database
    // offers first. That is a bug the suite found: a month summary read the administrator's primary
    // currency, summed nothing, and reported a month of zeroes whenever another account happened to be
    // first in the table.
    //
    // The check is a heuristic and says so: it requires an `id`, `email` or `user_id` within the first
    // couple of hundred characters of the call. That is enough to catch the shape that bit, and it does
    // not pretend to be a type system.
    const CALL = /\.(user|session)\.(findFirst|findMany|count|updateMany|deleteMany)\(/g;
    const offenders: string[] = [];

    for (const source of sources) {
      for (const match of source.text.matchAll(CALL)) {
        const at = match.index ?? 0;
        const argument = source.text.slice(at, at + 260);

        if (!/(where|id:|email|user_id)/.test(argument)) {
          offenders.push(`${source.path}: ${argument.split('\n')[0]}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('stores no exchange rate anywhere the schema can see', () => {
    const schema = readFileSync(join(REPO, 'prisma', 'schema.prisma'), 'utf8');
    // Comments are stripped first: the schema *documents* that there is no such column, and a check that
    // tripped over the sentence forbidding it would be enforcing the opposite of what it says.
    const declarations = schema
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

    // A rate is arithmetic, derived for display only (ADR-0004). A column for it would be a historical
    // figure nothing can recompute, and every total that used it would be unverifiable afterwards.
    expect(declarations).not.toMatch(/\bexchange_rate\b/);
    expect(declarations).not.toMatch(/^\s*rate\s+\w/m);
    expect(declarations).toContain('base_amount');
  });

  it('has no adjustment transaction type (ADR-0017)', () => {
    const schema = readFileSync(join(REPO, 'prisma', 'schema.prisma'), 'utf8');
    const txType = /enum TxType \{([^}]*)\}/.exec(schema)?.[1] ?? '';

    expect(txType.split(/\s+/).filter((part) => part !== '')).toEqual([
      'expense',
      'income',
      'transfer',
      'exchange',
    ]);
  });

  it('never turns an amount into a JavaScript number', () => {
    // The one shape that matters: a `Number`/`parseFloat` applied to something named like money. Reading a
    // string tag or a page offset is not this, so the pattern is narrow on purpose.
    const OFFENDER = /(Number|parseFloat)\(\s*(amount|base_amount|baseAmount|current_balance|currentBalance|opening_balance|destination_amount)\b/;

    expect(sources.filter((source) => OFFENDER.test(source.text)).map((source) => source.path)).toEqual([]);
  });
});
