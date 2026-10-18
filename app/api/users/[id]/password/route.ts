import { withCaller } from '../../../../../src/server/auth/require-user';
import { resetPassword } from '../../../../../src/server/users/reset-password';

/**
 * Admin-only: hand back a new password for the account in the path, once (§14, ADR-0047).
 *
 * The plaintext exists in this response and nowhere else — not in the database, not in the audit row,
 * and not in a log. There is no route that shows an existing password, because one cannot: the stored
 * value is a hash.
 *
 * `app/api/users/[id]/password/route.ts` is five directories under the repo root, which is why this
 * file's imports have one more `../` than `app/api/auth/password/route.ts` does.
 */
export const POST = withCaller<{ params: Promise<{ id: string }> }>(
  async (_request, { caller }, context) => {
    const { id } = await context.params;

    return Response.json(await resetPassword({ actor: caller, userId: id }));
  },
);
