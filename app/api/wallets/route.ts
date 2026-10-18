import { withCaller } from '../../../src/server/auth/require-user';
import { readJsonObject, readOptionalBoolean, readOptionalString, readString, rejectUnknownFields } from '../../../src/server/http/request';
import { createWallet } from '../../../src/server/wallets/create-wallet';
import { listWallets } from '../../../src/server/wallets/list-wallets';

/**
 * Wallets (FR-08).
 *
 * The route does three things and nothing else: parse, delegate, serialise (ADR-0039). Every rule about
 * what a wallet may be — which type implies which liability answer, what a balance may look like, what
 * `openingBalance` means — lives in `src/server/wallets/**`, because the screens call those same modules
 * rather than re-deriving anything.
 *
 * `openingBalance` arrives as a **string** and is parsed into a `Decimal` on the way in (ADR-0012). A
 * JSON number would already have been through a float by the time this line ran, and 0.1 + 0.2 is not
 * the only pair that loses.
 */
export const GET = withCaller(async (request) => {
  const query = new URL(request.url).searchParams;

  return Response.json({
    data: await listWallets({
      includeArchived: query.get('includeArchived') === 'true',
      includeDeleted: query.get('includeDeleted') === 'true',
    }),
  });
});

export const POST = withCaller(async (request, { caller }) => {
  const body = await readJsonObject(request);

  rejectUnknownFields(body, [
    'name',
    'walletType',
    'currencyId',
    'openingBalance',
    'isLiability',
    'institution',
    'notes',
  ]);

  const created = await createWallet({
    actor: caller,
    name: readString(body, 'name'),
    walletType: readString(body, 'walletType'),
    currencyId: readString(body, 'currencyId'),
    openingBalance: readString(body, 'openingBalance'),
    isLiability: readOptionalBoolean(body, 'isLiability'),
    institution: readOptionalString(body, 'institution') ?? null,
    notes: readOptionalString(body, 'notes') ?? null,
  });

  return Response.json(created, { status: 201 });
});
