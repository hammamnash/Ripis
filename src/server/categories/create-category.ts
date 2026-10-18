import type { CategoryType } from '@prisma/client';

import { writeAudited } from '../audit';
import type { Caller } from '../context';
import { db } from '../db';
import { ApiError } from '../http/errors';
import { serialiseCategory, type CategoryResponse } from './serialise';

/**
 * A new category (FR-01, ADR-0014, Task 3.12).
 *
 * **One level, always.** There is no `parent_id` parameter and no sub-category endpoint, because
 * ADR-0014 decided that a category is a single level and the way to keep a decision is to leave no
 * parameter that could contradict it.
 *
 * **`type` is required and permanent.** It is what makes a category usable for an `income` or an
 * `expense` and nothing else, so a category whose type could be edited is a category that could silently
 * re-file every transaction that already points at it.
 *
 * **Colour is the user's.** Nothing here picks a colour by rank or palette position (ADR-0030): the value
 * arrives with the request and is stored as given, and a request without one is refused rather than
 * assigned a default. A generated colour is indistinguishable from a chosen one in the database, and the
 * point of ADR-0030 is that the user's choice is not overwritten by a later design decision.
 *
 * The name is unique per account **per type** (`@@unique([user_id, name, type])`), so "Gift" can be both
 * an income and an expense category. The duplicate check is done here so the refusal is a 409 naming the
 * field rather than a unique-violation rendered as a 500.
 */
export interface NewCategory {
  actor: Caller;
  name: string;
  type: string;
  color: string;
  icon?: string | null;
}

const CATEGORY_TYPES: CategoryType[] = ['income', 'expense'];

function requireCategoryType(value: string): CategoryType {
  if (!(CATEGORY_TYPES as string[]).includes(value)) {
    throw new ApiError('validation_failed', 400, 'A category is either income or expense.', 'type');
  }

  return value as CategoryType;
}

export async function createCategory(input: NewCategory): Promise<CategoryResponse> {
  const type = requireCategoryType(input.type);
  const name = input.name.trim();

  if (name === '') {
    throw new ApiError('validation_failed', 400, 'name is required.', 'name');
  }

  const existing = await db.category.findFirst({ where: { name, type } });
  if (existing !== null) {
    throw new ApiError(
      'duplicate_category',
      409,
      `There is already a ${type} category called ${name}.`,
      'name',
    );
  }

  return writeAudited({
    actor: input.actor,
    entityType: 'category',
    action: 'created',
    run: async (tx) => {
      const category = await tx.category.create({
        data: {
          user_id: input.actor.id,
          name,
          type,
          color: input.color,
          icon: input.icon ?? null,
        },
      });

      return {
        written: category,
        entityId: category.id,
        after: {
          name: category.name,
          type: category.type,
          color: category.color,
          icon: category.icon,
        },
      };
    },
  }).then(serialiseCategory);
}
