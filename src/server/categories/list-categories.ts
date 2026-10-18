import { db } from '../db';
import { serialiseCategory, type CategoryResponse } from './serialise';

/**
 * The categories a screen offers (FR-01).
 *
 * Archived categories are excluded by default and can be asked for, which is the same shape the wallet
 * list has — a picker wants what is usable, a settings screen wants everything. The `type` filter is
 * here rather than in each screen because the transaction form needs *income categories* or *expense
 * categories* depending on what is being entered, and a client that filtered the full list itself would
 * be deciding which categories are legal (ADR-0039).
 */
export interface CategoryListOptions {
  type?: string;
  includeArchived?: boolean;
}

export async function listCategories(options: CategoryListOptions = {}): Promise<CategoryResponse[]> {
  const categories = await db.category.findMany({
    where: {
      type: options.type === undefined ? undefined : (options.type as never),
      archived_at: options.includeArchived === true ? undefined : null,
    },
    // Alphabetical, because a list of names is something a person scans rather than one whose order
    // carries meaning. `created_at` breaks ties so two categories cannot swap places between renders.
    orderBy: [{ name: 'asc' }, { created_at: 'asc' }],
  });

  return categories.map(serialiseCategory);
}
