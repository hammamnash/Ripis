import { parseDuration } from './duration';

/**
 * The auth configuration, read once per call and never defaulted.
 *
 * ADR-0013 refuses a default credential in writing; the argument is stronger for a signing key, because
 * a fallback secret would let anybody mint a token for anybody and nothing in the app would look wrong.
 * There is therefore no `?? 'development-secret'` anywhere below: an unset variable is an exception that
 * names the variable, in the same spirit as the seed aborting on an unset `ADMIN_PASSWORD` (ADR-0019).
 */
export interface AuthConfig {
  /** Signs access tokens (HS256). */
  accessSecret: string;
  /** Keys the digest of a stored refresh token. Never signs anything. */
  refreshSecret: string;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

/** 32 characters is the floor, not the recommendation; a 32-byte secret in hex is 64. */
export const MIN_SECRET_LENGTH = 32;

export class MissingAuthConfigError extends Error {
  constructor(name: string, detail: string) {
    super(`${name} is unusable: ${detail}`);
    this.name = 'MissingAuthConfigError';
  }
}

type Env = Record<string, string | undefined>;

export function readAuthConfig(env: Env = process.env): AuthConfig {
  const accessSecret = readSecret('JWT_ACCESS_SECRET', env);
  const refreshSecret = readSecret('JWT_REFRESH_SECRET', env);

  if (accessSecret === refreshSecret) {
    throw new MissingAuthConfigError(
      'JWT_REFRESH_SECRET',
      'it holds the same value as JWT_ACCESS_SECRET; the two keys do different jobs and must differ',
    );
  }

  return {
    accessSecret,
    refreshSecret,
    accessTtlSeconds: readLifetime('JWT_ACCESS_TTL', env),
    refreshTtlSeconds: readLifetime('JWT_REFRESH_TTL', env),
  };
}

function readSecret(name: string, env: Env): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new MissingAuthConfigError(name, 'it is unset or empty');
  }

  if (value.length < MIN_SECRET_LENGTH) {
    throw new MissingAuthConfigError(
      name,
      `it is ${value.length} characters long; at least ${MIN_SECRET_LENGTH} are required so that it cannot be guessed`,
    );
  }

  return value;
}

function readLifetime(name: string, env: Env): number {
  const value = env[name]?.trim();

  if (!value) {
    throw new MissingAuthConfigError(name, 'it is unset or empty');
  }

  try {
    return parseDuration(value);
  } catch (error) {
    throw new MissingAuthConfigError(name, error instanceof Error ? error.message : String(error));
  }
}
