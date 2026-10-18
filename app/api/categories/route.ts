import { withCaller } from '../../../src/server/auth/require-user';
import { createCategory } from '../../../src/server/categories/create-category';
import { listCategories } from '../../../src/server/categories/list-categories';
import { readJsonObject, readOptionalString, readString, rejectUnknownFields } from '../../../src/server/http/request';

/**
 * Categories (FR-01, ADR-0014).
 *
 * Two endpoints, and the absence of a third is the design: there is no `GET /api/categories/:id` because
 * nothing needs one, and no `DELETE` because a category is archived rather than deleted — a transaction
 * references its category for the transaction's whole life.
 *
 * Parse, delegate, serialise (ADR-0039). The one-level rule, the permanent type, and the user's choice of
 * colour all live in `src/server/categories/**`.
 */
export const GET = withCaller(async (request) => {
  const query = new URL(request.url).searchParams;
  const type = query.get('type');

  return Response.json({
    data: await listCategories({
      type: type === null ? undefined : type,
      includeArchived: query.get('includeArchived') === 'true',
    }),
  });
});

export const POST = withCaller(async (request, { caller }) => {
  const body = await readJsonObject(request);

  rejectUnknownFields(body, ['name', 'type', 'color', 'icon']);

  const created = await createCategory({
    actor: caller,
    name: readString(body, 'name'),
    type: readString(body, 'type'),
    // Required, not defaulted: the colour belongs to the user (ADR-0030), and a request that did not
    // choose one has not made that choice.
    color: readString(body, 'color'),
    icon: readOptionalString(body, 'icon') ?? null,
  });

  return Response.json(created, { status: 201 });
});
