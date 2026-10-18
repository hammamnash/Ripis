import { withCaller } from '../../../src/server/auth/require-user';
import { readJsonObject, readString, rejectUnknownFields } from '../../../src/server/http/request';
import { reconcile } from '../../../src/server/reconciliation/reconcile';

/**
 * Reconciling a wallet (FR-09, ADR-0017).
 *
 * `actualBalance` is the figure on the statement, stated the way a statement states it — a credit card's
 * debt is positive. The direction of the correction is **not** a parameter: `reconcile` derives it from
 * which way the figure has to move, because on a liability the same arithmetic is the opposite transaction
 * type and a caller who could name the type could file a correction that moves the balance away from the
 * number they just entered.
 */
export const POST = withCaller(async (request, { caller }) => {
  const body = await readJsonObject(request);

  rejectUnknownFields(body, ['walletId', 'actualBalance', 'occurredOn', 'categoryId']);

  return Response.json(
    await reconcile({
      actor: caller,
      walletId: readString(body, 'walletId'),
      actualBalance: readString(body, 'actualBalance'),
      occurredOn: readString(body, 'occurredOn'),
      categoryId: readString(body, 'categoryId'),
    }),
  );
});
