import { describe, expect, it } from 'vitest';

import { InvalidDurationError, parseDuration } from './duration';

/**
 * `JWT_ACCESS_TTL` and `JWT_REFRESH_TTL` are human strings in `.env` ("15m", "30d"), and nothing else
 * in the app reads them. The parse is strict on purpose: a value that silently became `0` would issue
 * tokens that are already expired, and the failure would surface as "sign-in does nothing".
 */
describe('parseDuration', () => {
  it('reads the four units the environment template allows', () => {
    expect(parseDuration('45s')).toBe(45);
    expect(parseDuration('15m')).toBe(900);
    expect(parseDuration('2h')).toBe(7_200);
    expect(parseDuration('30d')).toBe(2_592_000);
  });

  it('refuses anything it cannot read as a positive whole number of seconds', () => {
    const refused = ['', '15', '15 m', ' 15m', '15m ', 'm15', '15M', '0m', '0s', '-5m', '1.5h', 'abc', '15w'];

    for (const value of refused) {
      expect(() => parseDuration(value)).toThrow(InvalidDurationError);
    }
  });

  it('names the offending value, so a bad .env line is findable', () => {
    expect(() => parseDuration('15w')).toThrow(/15w/);
    expect(() => parseDuration('15w')).toThrow(/s, m, h, d/);
  });
});
