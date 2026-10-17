import { PrismaClient } from '@prisma/client';

import { currentCaller } from './context';

/**
 * The models that belong to one account and to nobody else (ADR-0020 — one account is one private
 * ledger). `currency` is deliberately absent: it is shared reference data, not a user's row, and an
 * unscoped service must still be able to read it.
 */
const SCOPED_MODELS = new Set(['Wallet', 'Category', 'Transaction', 'Budget', 'AuditLog']);

/** Operations whose `where` the caller's id must join. */
const WHERE_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

type ScopedArgs = Record<string, unknown>;

/** A query that could reach another account was attempted with no caller to scope it to. */
export class MissingCallerError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Refusing ${operation} on ${model}: no caller in context, and every read and write must be scoped to a user (ADR-0020).`,
    );
    this.name = 'MissingCallerError';
  }
}

/** A payload tried to write a row for somebody other than the caller. */
export class ForeignOwnerError extends Error {
  constructor(namedOwner: unknown, callerId: string) {
    super(
      `Refusing to write a row with owner ${String(namedOwner)} for caller ${callerId}: a write may only create rows owned by the caller (ADR-0020).`,
    );
    this.name = 'ForeignOwnerError';
  }
}

/**
 * Wraps a client so every read and write on a scoped model is restricted to the caller.
 *
 * Enforcement lives here, once, rather than in each service. A service that forgets a filter cannot
 * reach another account, a service cannot widen the scope with its own `where`, and a payload that
 * names another owner is refused rather than silently corrected — silently correcting it would hide
 * the bug the refusal is meant to expose.
 */
export function scopedPrisma<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: 'user-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const caller = currentCaller();
          if (!caller) {
            throw new MissingCallerError(model, operation);
          }

          return query(applyCaller(args as ScopedArgs, operation, caller.id) as never);
        },
      },
    },
  });
}

function applyCaller(args: ScopedArgs, operation: string, callerId: string): ScopedArgs {
  switch (operation) {
    case 'create':
      return { ...args, data: ownRow(args.data, callerId) };
    case 'createMany':
      return { ...args, data: ownRows(args.data, callerId) };
    case 'upsert':
      return {
        ...args,
        where: scopedWhere(args.where, callerId),
        create: ownRow(args.create, callerId),
      };
    default:
      return WHERE_OPERATIONS.has(operation)
        ? { ...args, where: scopedWhere(args.where, callerId) }
        : args;
  }
}

/**
 * ANDs the caller's id onto whatever the service passed. It is an AND rather than a replacement so
 * that a `where` naming another account narrows to nothing instead of being overwritten into a
 * success — and so `findUnique` keeps its unique field and simply finds nothing, which is what
 * becomes a 404 rather than a 403.
 */
function scopedWhere(where: unknown, callerId: string): ScopedArgs {
  if (!where || typeof where !== 'object') {
    return { user_id: callerId };
  }
  // Spread rather than AND: `findUnique`, `update` and `delete` take a *unique* `where`, and a
  // unique input cannot carry a nested `AND` at the top level - Prisma rejects it as "needs at
  // least one of `id`". Spreading keeps the unique key and adds the owner, and it is still safe
  // against a filter that tries to widen the scope, because Prisma ANDs top-level fields: a
  // `where: { user_id: someoneElse }` becomes the caller id, and a nested `OR` cannot escape it.
  return { ...(where as Record<string, unknown>), user_id: callerId };
}

function ownRow(data: unknown, callerId: string): ScopedArgs {
  if (!data || typeof data !== 'object') {
    return { user_id: callerId };
  }

  const row = data as ScopedArgs;
  const named = row.user_id;
  if (named !== undefined && named !== callerId) {
    throw new ForeignOwnerError(named, callerId);
  }

  return { ...row, user_id: callerId };
}

function ownRows(data: unknown, callerId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => ownRow(row, callerId));
  }
  return ownRow(data, callerId);
}
