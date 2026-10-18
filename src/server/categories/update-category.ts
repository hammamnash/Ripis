import { writeAudited } from '../audit';
import type { Caller } from '../context';
import { ApiError } from '../http/errors';
import { readOptionalString } from '../http/request';
import { requireCategory } from './get-category';
import { serialiseCategory, type CategoryResponse } from './serialise';

/**
 * Renaming, recolouring and retiring a category (FR-01, ADR-0014, Task 3.12).
 *
 * **`type` cannot be edited**, and the refusal is a rule rather than a tidy API: every transaction that
 * already points at this category was filed as an income or an expense *because of that type*. Flipping it
 * would silently re-file all of them at once, moving money between the two halves of every monthly
 * summary, with nothing in the ledger to say it happened.
 *
 * **A category is archived, never deleted.** A transaction references its category for its whole life, so
 * removing the row would either take history with it or leave rows pointing at nothing. `archived_at` is
 * stamped instead: the category stops being offered for new transactions and stays exactly where it is on
 * every existing one (ADR-0014).
 *
 * As with the wallet edit, the body is read here rather than in the route: "which fields may this request
 * name" *is* the rule this module owns.
 */
const IMMUTABLE = new Set(['type']);

const MUTABLE = new Set(['name', 'color', 'icon']);

export interface CategoryEdit {
  actor: Caller;
  id: string;
  body: Record<string, unknown>;
}

export async function updateCategory(edit: CategoryEdit): Promise<CategoryResponse> {
  for (const field of Object.keys(edit.body)) {
    if (IMMUTABLE.has(field)) {
      throw new ApiError(
        'immutable_field',
        400,
        `A category's ${field} cannot be changed after it is created.`,
        field,
      );
    }

    if (!MUTABLE.has(field)) {
      throw new ApiError('validation_failed', 400, `${field} is not a category field.`, field);
    }
  }

  const before = await requireCategory(edit.id);

  const name = readOptionalString(edit.body, 'name');
  const color = readOptionalString(edit.body, 'color');
  const icon = readOptionalString(edit.body, 'icon');

  const data: Record<string, string | null> = {};
  if (name !== undefined) {
    if (name === null || name.trim() === '') {
      throw new ApiError('validation_failed', 400, 'name cannot be empty.', 'name');
    }
    data.name = name.trim();
  }
  if (color !== undefined) {
    if (color === null) {
      throw new ApiError('validation_failed', 400, 'color cannot be cleared.', 'color');
    }
    data.color = color;
  }
  if (icon !== undefined) data.icon = icon;

  if (Object.keys(data).length === 0) {
    throw new ApiError('validation_failed', 400, 'Nothing to change.');
  }

  return writeAudited({
    actor: edit.actor,
    entityType: 'category',
    action: 'updated',
    before: { name: before.name, color: before.color, icon: before.icon },
    run: async (tx) => {
      const category = await tx.category.update({ where: { id: edit.id }, data });

      return {
        written: category,
        entityId: category.id,
        after: { name: category.name, color: category.color, icon: category.icon },
      };
    },
  }).then(serialiseCategory);
}

export async function archiveCategory(input: {
  actor: Caller;
  id: string;
}): Promise<CategoryResponse> {
  const before = await requireCategory(input.id);

  return writeAudited({
    actor: input.actor,
    entityType: 'category',
    action: 'archived',
    before: { name: before.name, archived_at: before.archived_at?.toISOString() ?? null },
    run: async (tx) => {
      const category = await tx.category.update({
        where: { id: input.id },
        data: { archived_at: new Date() },
      });

      return {
        written: category,
        entityId: category.id,
        after: { archived_at: category.archived_at?.toISOString() ?? null },
      };
    },
  }).then(serialiseCategory);
}
