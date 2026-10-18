import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  codeOfRefusal,
  columnsOf,
  createTestUser,
  indexesOf,
  prisma,
  seedCurrencies,
  teardownTestData,
} from './helpers/db';

// ADR-0040 names this row and its columns. This is that decision written where it can fail.
beforeAll(seedCurrencies);
afterAll(teardownTestData);

describe('the session table', () => {
  it('carries exactly the six columns ADR-0040 names', async () => {
    const columns = await columnsOf('session');
    expect(columns.map((c) => c.column_name)).toEqual([
      'created_at',
      'expires_at',
      'id',
      'refresh_token_hash',
      'revoked_at',
      'user_id',
    ]);
  });

  it('is two uuids, a text hash and three timestamptz instants', async () => {
    const columns = await columnsOf('session');
    const types = Object.fromEntries(columns.map((c) => [c.column_name, c.data_type]));
    expect(types).toEqual({
      created_at: 'timestamp with time zone',
      expires_at: 'timestamp with time zone',
      id: 'uuid',
      refresh_token_hash: 'text',
      revoked_at: 'timestamp with time zone',
      user_id: 'uuid',
    });
  });

  it('is nullable in exactly one place — a session not yet revoked', async () => {
    const columns = await columnsOf('session');
    const nullable = columns.filter((c) => c.is_nullable === 'YES').map((c) => c.column_name);
    expect(nullable).toEqual(['revoked_at']);
  });

  it('refuses a session belonging to a user who does not exist', async () => {
    const code = await codeOfRefusal(() =>
      prisma.session.create({
        data: {
          user_id: '00000000-0000-4000-8000-000000000000',
          refresh_token_hash: 'x',
          expires_at: new Date(Date.now() + 60_000),
        },
      }),
    );
    expect(code).toBe('P2003');
  });

  it('takes the sessions with the user they belong to', async () => {
    const userId = await createTestUser();
    await prisma.session.create({
      data: {
        user_id: userId,
        refresh_token_hash: 'x',
        expires_at: new Date(Date.now() + 60_000),
      },
    });
    await prisma.user.delete({ where: { id: userId } });
    expect(await prisma.session.count({ where: { user_id: userId } })).toBe(0);
  });

  it('indexes the user, so "every session this account holds" is a lookup', async () => {
    const definitions = (await indexesOf('session')).map((row) => row.indexdef).join('\n');
    expect(definitions).toContain('(user_id)');
  });
});
