import { withCaller } from '../../../../src/server/auth/require-user';
import { updateCategory } from '../../../../src/server/categories/update-category';
import { readJsonObject } from '../../../../src/server/http/request';

/**
 * Editing a category (FR-01, Task 3.12).
 *
 * The parsed body goes straight to `updateCategory`, which owns the rule about which fields a category
 * edit may name — `type` is refused, because every transaction pointing at this category was filed as an
 * income or an expense *because of* it (ADR-0039).
 */
export const PATCH = withCaller<{ params: Promise<{ id: string }> }>(
  async (request, { caller }, context) => {
    const { id } = await context.params;
    const body = await readJsonObject(request);

    return Response.json(await updateCategory({ actor: caller, id, body }));
  },
);
