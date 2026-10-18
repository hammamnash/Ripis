import type { Category } from '@prisma/client';

import { db } from '../db';
import { ApiError } from '../http/errors';

/**
 * Reading one category that must exist, must be the caller's, and must be usable for what it is being
 * asked to do.
 *
 * Every one of these refusals is a 404 rather than a 403, for the reason `get-wallet.ts` gives: the
 * scoping extension has already narrowed this to the caller's rows, so a category that is not the
 * caller's is indistinguishable from one that does not exist, and that is the point — a distinct status
 * would confirm an id exists in somebody else's ledger.
 *
 * `requireCategoryForType` is the one that matters for the ledger. A transaction's `category_id` must
 * name a category of the same type, because the alternative is an *income* row filed under a *expense*
 * category, which then counts toward the wrong half of a monthly summary and cannot be told apart from a
 * correct row afterwards. The database cannot enforce this — the check spans two tables — so it is
 * enforced here, which is where the rule lives (ADR-0039).
 */
export async function findCategory(id: string): Promise<Category | null> {
  return db.category.findFirst({ where: { id } });
}

export async function requireCategory(id: string): Promise<Category> {
  const category = await findCategory(id);

  if (category === null) {
    throw new ApiError('not_found', 404, 'No such category.');
  }

  return category;
}

/**
 * `use` names the act being refused, and exists so the sentence can be true.
 *
 * The rule is one rule wherever a category is attached to something — not archived, and of the right
 * type — but the message has to name what the caller was doing, or the refusal reads as a bug in an
 * unrelated feature. Budgets pass `'a budget'` and are otherwise checked identically (Task 5.1).
 */
export async function requireCategoryForType(
  id: string,
  type: Category['type'],
  use = 'a new transaction',
): Promise<Category> {
  const category = await requireCategory(id);

  if (category.archived_at !== null) {
    throw new ApiError(
      'category_archived',
      400,
      `That category is archived, so it cannot be used on ${use}.`,
      'categoryId',
    );
  }

  if (category.type !== type) {
    throw new ApiError(
      'category_type_mismatch',
      400,
      `That category is for ${category.type}, not ${type}.`,
      'categoryId',
    );
  }

  return category;
}
