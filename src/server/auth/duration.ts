/**
 * `JWT_ACCESS_TTL` and `JWT_REFRESH_TTL` are written the way a person writes a lifetime ("15m", "30d"),
 * and this is the only place that reads them. The parse is strict on purpose: a value that quietly
 * became `0` would issue tokens that are already expired, and the symptom would be "sign-in does
 * nothing" rather than a configuration error.
 */
const SECONDS_PER_UNIT: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400 };

export class InvalidDurationError extends Error {
  constructor(value: string, reason: string) {
    super(`"${value}" is not a duration: ${reason}`);
    this.name = 'InvalidDurationError';
  }
}

/** Reads `15m`, `30d`, `45s`, `2h` into seconds. Throws rather than defaulting. */
export function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);

  if (!match) {
    throw new InvalidDurationError(
      value,
      'expected a whole number followed by one of s, m, h, d (for example "15m")',
    );
  }

  const seconds = Number(match[1]) * SECONDS_PER_UNIT[match[2] as string]!;

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new InvalidDurationError(value, 'a lifetime must be longer than zero seconds');
  }

  return seconds;
}
