import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

/**
 * Argon2id, the variant ADR-0001 names for stored passwords.
 *
 * `@node-rs/argon2` rather than `argon2`: it ships prebuilt binaries, so cloning this repo does not
 * require a C++ toolchain. A password hash is not a place to accept a build that "usually" works.
 *
 * The cost is stated rather than inherited. These values are the OWASP recommendation (19 MiB,
 * 2 iterations, 1 lane) and happen to match the library's current defaults — which is exactly the
 * reason to write them down: a dependency bump that lowered a default would otherwise weaken every
 * *new* hash while every stored hash kept its old cost, and nothing would report it. The spec pins
 * the recorded parameters for the same reason.
 */
// The variant is deliberately NOT set here: `Algorithm` is an ambient const enum, which
// isolatedModules refuses to read — the transform compiles one file at a time and cannot inline
// it. Argon2id is this library's default, and the spec asserts the stored digest begins
// `$argon2id$` — a test on the actual output survives a dependency bump that a constant here
// would not.
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hashes a plaintext password. The salt is generated per call, so equal passwords differ. */
export async function hash(password: string): Promise<string> {
  return argonHash(password, OPTIONS);
}

/** True only when `password` is the password behind `storedHash`. */
export async function verify(storedHash: string, password: string): Promise<boolean> {
  return argonVerify(storedHash, password);
}
