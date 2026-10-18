import { describe, expect, it } from 'vitest';

import { MIN_SECRET_LENGTH, MissingAuthConfigError, readAuthConfig } from './config';

/**
 * The auth configuration is read from the environment and never defaulted. ADR-0013 rejects a default
 * credential in writing; the same argument applies to a signing key, and more so — a hardcoded fallback
 * secret would let anybody mint a token for anybody, and nothing in the app would look wrong.
 */
const VALID = {
  JWT_ACCESS_SECRET: 'a'.repeat(MIN_SECRET_LENGTH),
  JWT_REFRESH_SECRET: 'b'.repeat(MIN_SECRET_LENGTH),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '30d',
};

describe('readAuthConfig', () => {
  it('reads the four variables and parses both lifetimes to seconds', () => {
    expect(readAuthConfig(VALID)).toEqual({
      accessSecret: VALID.JWT_ACCESS_SECRET,
      refreshSecret: VALID.JWT_REFRESH_SECRET,
      accessTtlSeconds: 900,
      refreshTtlSeconds: 2_592_000,
    });
  });

  it('aborts loudly when a variable is unset, naming it', () => {
    for (const key of Object.keys(VALID)) {
      const env: Record<string, string> = { ...VALID };
      delete env[key];

      expect(() => readAuthConfig(env)).toThrow(MissingAuthConfigError);
      expect(() => readAuthConfig(env)).toThrow(new RegExp(key));
    }
  });

  it('treats an empty value as unset', () => {
    expect(() => readAuthConfig({ ...VALID, JWT_ACCESS_SECRET: '' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('refuses the template placeholder and anything else too short to be a key', () => {
    expect(() => readAuthConfig({ ...VALID, JWT_ACCESS_SECRET: 'CHANGE_ME_ACCESS_SECRET' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
    expect(() => readAuthConfig({ ...VALID, JWT_ACCESS_SECRET: 'a'.repeat(MIN_SECRET_LENGTH - 1) })).toThrow(
      new RegExp(String(MIN_SECRET_LENGTH)),
    );
  });

  it('refuses one secret doing both jobs', () => {
    const shared = 'c'.repeat(MIN_SECRET_LENGTH);

    expect(() => readAuthConfig({ ...VALID, JWT_ACCESS_SECRET: shared, JWT_REFRESH_SECRET: shared })).toThrow(
      /must differ/,
    );
  });

  it('names the variable and the value when a lifetime is unreadable', () => {
    expect(() => readAuthConfig({ ...VALID, JWT_ACCESS_TTL: '15' })).toThrow(/JWT_ACCESS_TTL/);
    expect(() => readAuthConfig({ ...VALID, JWT_REFRESH_TTL: '30' })).toThrow(/JWT_REFRESH_TTL/);
  });
});
