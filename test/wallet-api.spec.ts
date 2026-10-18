import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { POST as archiveWallet } from '../app/api/wallets/[id]/archive/route';
import {
  DELETE as deleteWallet,
  GET as readWallet,
  PATCH as editWallet,
} from '../app/api/wallets/[id]/route';
import { GET as listWallets, POST as createWallet } from '../app/api/wallets/route';
import { prisma, teardownTestData } from './helpers/db';
import { closeLedger, signedInLedger, type SpecLedger } from './helpers/session';

/**
 * Task 3.3 through the real endpoints (FR-08, ADR-0025).
 *
 * Every claim here is made against a route handler called with a real access token, so the `withCaller`
 * guard and the scoping extension are both in the path. What these specs are for is the part of the
 * wallet that is a *decision* rather than a shape: which liability answer each type implies, which three
 * fields cannot be edited after creation, and what archiving and deleting each mean.
 */
const EMAIL = 'phase-3-wallet@ripis.test';
const OTHER_EMAIL = 'phase-3-wallet-other@ripis.test';

let ledger: SpecLedger;
let other: SpecLedger;

beforeAll(async () => {
  ledger = await signedInLedger(EMAIL);
  other = await signedInLedger(OTHER_EMAIL);
});

afterAll(async () => {
  await closeLedger(ledger);
  await closeLedger(other);
  await teardownTestData();
  await prisma.$disconnect();
});

/** The route's context for a dynamic segment, spelled the way Next hands it over. */
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

interface WalletBody {
  id: string;
  name: string;
  walletType: string;
  isLiability: boolean;
  openingBalance: string;
  currentBalance: string;
  value: string;
  active: boolean;
}

async function create(ledgerToUse: SpecLedger, overrides: Record<string, unknown> = {}) {
  const response = await createWallet(
    ledgerToUse.request('/api/wallets', {
      method: 'POST',
      body: {
        name: 'Spec wallet',
        walletType: 'cash',
        currencyId: 'TST',
        openingBalance: '0.0000',
        ...overrides,
      },
    }),
    undefined,
  );

  return { status: response.status, body: (await response.json()) as WalletBody & { error?: { code: string; field?: string } } };
}

async function listedNames(
  ledgerToUse: SpecLedger = ledger,
  options: { includeArchived?: boolean; includeDeleted?: boolean } = {},
): Promise<string[]> {
  const query = new URLSearchParams();
  if (options.includeArchived === true) query.set('includeArchived', 'true');
  if (options.includeDeleted === true) query.set('includeDeleted', 'true');

  const response = await listWallets(ledgerToUse.request(`/api/wallets?${query.toString()}`), undefined);
  const body = (await response.json()) as { data: { name: string }[] };

  return body.data.map((wallet) => wallet.name);
}

describe('the pre-fill table is the endpoint’s behaviour, not a constant (§3, ADR-0025)', () => {
  const PREFILLED: [string, boolean][] = [
    ['cash', false],
    ['debit_account', false],
    ['savings_account', false],
    ['checking_account', false],
    ['prepaid_card', false],
    ['e_wallet', false],
    ['credit_card', true],
    ['loan', true],
    ['debt', true],
  ];

  it.each(PREFILLED)('%s stores isLiability %s without being told', async (walletType, expected) => {
    const created = await create(ledger, { name: `Prefill ${walletType}`, walletType });

    expect(created.status).toBe(201);
    expect(created.body.isLiability).toBe(expected);
  });

  it.each([
    ['investment_account', true],
    ['investment_account', false],
    ['other', true],
    ['other', false],
  ])('%s takes the answer it was given (%s)', async (walletType, stated) => {
    const created = await create(ledger, {
      name: `Chosen ${walletType} ${String(stated)}`,
      walletType,
      isLiability: stated,
    });

    expect(created.status).toBe(201);
    expect(created.body.isLiability).toBe(stated);
  });

  it.each(['investment_account', 'other'])(
    '%s is refused without an answer rather than defaulted',
    async (walletType) => {
      const created = await create(ledger, { name: `Unanswered ${walletType}`, walletType });

      expect(created.status).toBe(400);
      expect(created.body.error?.code).toBe('wallet_type_requires_liability_answer');
      expect(created.body.error?.field).toBe('isLiability');
    },
  );

  it('refuses an answer that contradicts the type instead of correcting it', async () => {
    const created = await create(ledger, {
      name: 'Cash that claims to be debt',
      walletType: 'cash',
      isLiability: true,
    });

    expect(created.status).toBe(400);
    expect(created.body.error?.code).toBe('liability_contradicts_wallet_type');

    // And nothing was written — a refusal that leaves a row behind is not a refusal.
    expect(await prisma.wallet.count({ where: { name: 'Cash that claims to be debt' } })).toBe(0);
  });

  it('refuses a wallet type this app does not know, naming the field', async () => {
    const created = await create(ledger, { name: 'Crypto wallet', walletType: 'crypto_wallet' });

    expect(created.status).toBe(400);
    expect(created.body.error?.code).toBe('validation_failed');
    expect(created.body.error?.field).toBe('walletType');
  });
});

describe('three fields cannot be edited after creation (FR-08, ADR-0015)', () => {
  it.each(['openingBalance', 'currencyId', 'walletType'])(
    '%s is refused by name and the row is left exactly as it was',
    async (field) => {
      const created = await create(ledger, {
        name: `Immutable ${field}`,
        walletType: 'savings_account',
        openingBalance: '1000.0000',
      });
      expect(created.status).toBe(201);

      const before = await prisma.wallet.findUniqueOrThrow({ where: { id: created.body.id } });

      const response = await editWallet(
        ledger.request(`/api/wallets/${created.body.id}`, {
          method: 'PATCH',
          body: { [field]: field === 'walletType' ? 'cash' : '9999.0000' },
        }), ctx(created.body.id),
      );

      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: { code: string; field: string } }).error).toMatchObject({
        code: 'immutable_field',
        field,
      });

      const after = await prisma.wallet.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(after).toEqual(before);
    },
  );

  it('moves isLiability on its own and never re-reads walletType to decide it', async () => {
    const created = await create(ledger, {
      name: 'Card that is edited into an asset',
      walletType: 'credit_card',
      openingBalance: '2000000.0000',
    });
    expect(created.body.isLiability).toBe(true);
    expect(created.body.value).toBe('-2000000.0000');

    const response = await editWallet(
      ledger.request(`/api/wallets/${created.body.id}`, { method: 'PATCH', body: { isLiability: false } }), ctx(created.body.id),
    );
    const body = (await response.json()) as WalletBody;

    expect(response.status).toBe(200);
    expect(body.isLiability).toBe(false);
    // The type is untouched, and the balance is still the statement's positive figure — only value moved.
    expect(body.walletType).toBe('credit_card');
    expect(body.currentBalance).toBe('2000000.0000');
    expect(body.value).toBe('2000000.0000');
  });

  it('records exactly one audit row per write (FR-14, §14)', async () => {
    const created = await create(ledger, { name: 'Audited cash', walletType: 'cash' });

    await editWallet(
      ledger.request(`/api/wallets/${created.body.id}`, { method: 'PATCH', body: { name: 'Audited cash, renamed' } }),
      ctx(created.body.id),
    );

    const rows = await prisma.auditLog.findMany({
      where: { user_id: ledger.userId, entity_id: created.body.id },
    });

    // Two writes, two rows — the create and the edit. Asserted as a set rather than by position, because
    // nothing orders these rows and both writes can land in the same millisecond.
    expect(rows.map((row) => row.action).sort()).toEqual(['created', 'updated']);

    const updated = rows.find((row) => row.action === 'updated');
    expect(updated?.before_value).toMatchObject({ name: 'Audited cash' });
    expect(updated?.after_value).toMatchObject({ name: 'Audited cash, renamed' });
  });
});

describe('archiving and deleting are different acts (§3)', () => {
  it('archiving leaves the wallet readable and drops it from the default list', async () => {
    const created = await create(ledger, { name: 'Archived cash', walletType: 'cash' });

    const archived = await archiveWallet(
      ledger.request(`/api/wallets/${created.body.id}/archive`, { method: 'POST' }), ctx(created.body.id),
    );

    expect(archived.status).toBe(200);
    expect(((await archived.json()) as WalletBody).active).toBe(false);

    const read = await readWallet(
      ledger.request(`/api/wallets/${created.body.id}`), ctx(created.body.id),
    );
    expect(read.status).toBe(200);

    expect(await listedNames()).not.toContain('Archived cash');
    expect(await listedNames(ledger, { includeArchived: true })).toContain('Archived cash');
  });

  it('deleting takes it out of every list while the row and its transactions stay', async () => {
    const created = await create(ledger, { name: 'Deleted cash', walletType: 'cash' });

    // A transaction first, so the delete has history to preserve. An `expense` needs a category — the
    // database enforces that — and it is created directly here because `POST /api/transactions` is
    // Task 3.5's endpoint, not this spec's subject.
    const category = await prisma.category.create({
      data: { user_id: ledger.userId, name: `Groceries ${created.body.id}`, type: 'expense', color: '#D22129' },
    });
    await prisma.transaction.create({
      data: {
        user_id: ledger.userId,
        transaction_type: 'expense',
        occurred_on: new Date('2026-10-01T00:00:00.000Z'),
        wallet_id: created.body.id,
        category_id: category.id,
        amount: '50000.0000',
        currency_id: 'TST',
        base_amount: '50000.0000',
        base_currency_id: 'TST',
      },
    });

    const deleted = await deleteWallet(
      ledger.request(`/api/wallets/${created.body.id}`, { method: 'DELETE' }), ctx(created.body.id),
    );

    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ status: 'ok' });

    const read = await readWallet(
      ledger.request(`/api/wallets/${created.body.id}`), ctx(created.body.id),
    );
    expect(read.status).toBe(404);

    expect(await listedNames()).not.toContain('Deleted cash');
    expect(await listedNames(ledger, { includeDeleted: true })).toContain('Deleted cash');

    const row = await prisma.wallet.findUnique({ where: { id: created.body.id } });
    expect(row?.deleted_at).not.toBeNull();
    expect(await prisma.transaction.count({ where: { wallet_id: created.body.id } })).toBe(1);
  });
});

describe('a wallet is only reachable by its owner (ADR-0020)', () => {
  it('another account can neither read, edit, delete nor list it', async () => {
    const created = await create(ledger, { name: 'Private cash', walletType: 'cash' });

    expect(
      (await readWallet(other.request(`/api/wallets/${created.body.id}`), ctx(created.body.id))).status,
    ).toBe(404);

    expect(
      (
        await editWallet(
          other.request(`/api/wallets/${created.body.id}`, { method: 'PATCH', body: { name: 'Stolen' } }), ctx(created.body.id),
        )
      ).status,
    ).toBe(404);

    expect(
      (await deleteWallet(other.request(`/api/wallets/${created.body.id}`, { method: 'DELETE' }), ctx(created.body.id)))
        .status,
    ).toBe(404);

    expect(await listedNames(other)).not.toContain('Private cash');

    // And the owner's row is untouched by any of it.
    const row = await prisma.wallet.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row.name).toBe('Private cash');
    expect(row.deleted_at).toBeNull();
  });
});
