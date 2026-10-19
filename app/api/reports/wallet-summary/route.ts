import { withCaller } from '../../../../src/server/auth/require-user';
import { readReportQuery } from '../../../../src/server/reports/filter';
import { walletSummary } from '../../../../src/server/reports/wallet-summary';

/**
 * What the wallets are worth now, and what the hero figure leaves out (ADR-0059, Task 7.4a).
 *
 * The route parses, delegates and serialises (ADR-0039); the tally, the sign and the per-currency buckets
 * all live in `src/server/reports/wallet-summary.ts`, which is the same module the dashboard screen calls,
 * so the card rows and the hero cannot disagree. The query string is read for one reason only — to refuse
 * it. A wallet summary is a current figure and takes no window and no narrowing; the module names the field
 * it was given and returns a `400`.
 *
 * Nothing here converts a `Decimal` for the wire: every amount leaves as the string `money()` produced
 * (ADR-0012) and every wallet row is `serialiseWallet`'s output, the same function `GET /api/wallets` uses.
 */
export const GET = withCaller(async (request) => {
  const query = new URL(request.url).searchParams;

  return Response.json({ data: await walletSummary(readReportQuery(query)) });
});
