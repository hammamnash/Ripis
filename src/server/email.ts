/**
 * One spelling per address.
 *
 * `User.email` is `@unique`, and PostgreSQL compares text case-sensitively, so without this rule
 * `Admin@Ripis.test` and `admin@ripis.test` are two different accounts. The person who typed the second
 * one cannot sign in to the first, nothing anywhere reports a problem, and the admin's own view of the
 * account list shows two plausible-looking entries. Folding case at the boundary is cheaper than
 * explaining that to somebody.
 *
 * The rule is applied at **both** ends, and it has to be. Normalising only on the way in leaves rows
 * written before the rule existed in their original spelling; normalising only on the way out leaves the
 * uniqueness constraint itself case-sensitive, so two accounts could still be created that differ only in
 * case. Doing both means the stored address is lowercase and a submitted address is lowered before it is
 * compared, which holds for old rows and new ones without a migration.
 *
 * Deliberately not applied to the name, the institution, or anything else a person typed: this is about
 * an identifier, and lowercasing prose would be a different decision.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}
