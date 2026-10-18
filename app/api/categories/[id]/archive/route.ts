import { withCaller } from '../../../../../src/server/auth/require-user';
import { archiveCategory } from '../../../../../src/server/categories/update-category';

/**
 * Retiring a category (FR-01, ADR-0014).
 *
 * The only way a category leaves the list, and it is not a delete: the row stays, every transaction that
 * points at it keeps pointing at it, and the category simply stops being offered for new ones. There is no
 * unarchive endpoint — a retired category stays retired, and a new one is created under a free name.
 */
export const POST = withCaller<{ params: Promise<{ id: string }> }>(
  async (_request, { caller }, context) => {
    const { id } = await context.params;

    return Response.json(await archiveCategory({ actor: caller, id }));
  },
);
