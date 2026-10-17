import { describe, expect, it } from 'vitest';

import { hash, verify } from './password.service';

/**
 * Task 2.1 — Argon2id (ADR-0001).
 *
 * Three claims are what make a stored hash worth anything: it round-trips, it is salted per call
 * (so two people who chose the same password do not share a hash, and a precomputed table for this
 * application cannot exist), and a near miss does not pass. The fourth claim pins the algorithm
 * itself: ADR-0001 names Argon2id, and `$argon2id$` is the only thing in the database that can
 * testify to which variant was actually used.
 */
describe('Password hashing (Task 2.1, ADR-0001)', () => {
  it('accepts the password it hashed', async () => {
    const digest = await hash('correct horse battery staple');

    expect(await verify(digest, 'correct horse battery staple')).toBe(true);
  });

  it('salts every call, so the same password never hashes twice the same', async () => {
    const first = await hash('same-password');
    const second = await hash('same-password');

    expect(first).not.toBe(second);
    expect(await verify(first, 'same-password')).toBe(true);
    expect(await verify(second, 'same-password')).toBe(true);
  });

  it('refuses a near miss', async () => {
    const digest = await hash('correct horse battery staple');

    expect(await verify(digest, 'correct horse battery staplex')).toBe(false);
    expect(await verify(digest, 'Correct horse battery staple')).toBe(false);
  });

  it('stores a self-describing Argon2id string, so the variant is verifiable later', async () => {
    const digest = await hash('whatever');

    expect(digest.startsWith('$argon2id$')).toBe(true);
    // The cost is recorded inside the hash. A dependency upgrade that quietly lowered these
    // defaults would leave old rows at the old cost while new ones got weaker — this is what
    // makes that visible instead of silent.
    expect(digest).toContain('m=19456,t=2,p=1');
  });
});
