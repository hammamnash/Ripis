import type { Category } from '@prisma/client';

/**
 * The category in its wire shape, mapped here and nowhere else (`02-context.md` §6).
 *
 * `archivedAt` is sent rather than an `archived` boolean, and the difference is not cosmetic: the
 * timestamp is what a screen needs to say when a category was retired, and a boolean is a fact the
 * client could have derived from it. There is no `deletedAt`, because there is no deleting a category —
 * a transaction references its category for the transaction's whole life, so a category is retired by
 * stamping `archived_at` and never by removing the row (ADR-0014).
 */
export interface CategoryResponse {
  id: string;
  name: string;
  type: Category['type'];
  color: string;
  icon: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export function serialiseCategory(category: Category): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    color: category.color,
    icon: category.icon,
    archivedAt: category.archived_at?.toISOString() ?? null,
    createdAt: category.created_at.toISOString(),
  };
}
