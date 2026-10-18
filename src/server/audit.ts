import type { AuditAction, AuditEntity, Prisma } from '@prisma/client';

import { runAsCaller, type Caller } from './context';
import { db } from './db';

/**
 * The one place an audit row is written.
 *
 * `audit_log` is a user-scoped model, so this write needs a caller even when the event is a failed
 * sign-in for a user who is not signed in: the row is *about* an account, and `actor_user_id` records
 * who caused it.
 *
 * `user_id` must be the actor's own id. A row about an act on another account — an admin creating a
 * user, an admin resetting somebody else's password — belongs to the *actor's* ledger with `entity_id`
 * naming the account it concerns (ADR-0046). ADR-0020's guarantee that one account cannot reach
 * another's rows is enforced in the scoping extension this write goes through, so writing into
 * somebody else's ledger is refused rather than merely discouraged.
 *
 * `before`/`after` are recorded when the caller has them. They are what §14's retention compacts later,
 * and they must never carry a secret: a password hash or a raw token belongs in no column of a table
 * that is written once and never edited.
 */
export interface AuditEntry {
  actor: Caller;
  userId: string;
  entityType: AuditEntity;
  entityId?: string;
  action: AuditAction;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

/** An absent value is an absent column, and for a nullable Json column that is `undefined`, not `null`. */
function jsonOrUndefined(value: Prisma.InputJsonValue | null | undefined) {
  return value ?? undefined;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  await runAsCaller(entry.actor, () =>
    db.auditLog.create({
      data: {
        user_id: entry.userId,
        actor_user_id: entry.actor.id,
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        action: entry.action,
        before_value: jsonOrUndefined(entry.before),
        after_value: jsonOrUndefined(entry.after),
      },
    }),
  );
}

/** What an audited write hands back: what it wrote, and what the row about it should say. */
export interface AuditedResult<T> {
  written: T;
  entityId?: string;
  after?: Prisma.InputJsonValue | null;
}

/**
 * A write and its audit row, in one transaction (I17, FR-14).
 *
 * "Every write appends exactly one row" is a property of the structure, not of remembering to call
 * `writeAudit`: the only supported way to perform a money-changing write is to hand it to this
 * function, which performs it and appends the row inside a single transaction. One call cannot produce
 * two rows, and a write that throws leaves none, so "the handler forgot" is not a failure mode that
 * exists.
 */
export interface AuditedWrite<T> {
  actor: Caller;
  entityType: AuditEntity;
  action: AuditAction;
  before?: Prisma.InputJsonValue | null;
  /**
   * Performs the write, and says in the same breath what the row about it should say.
   *
   * Those two facts come back *inside* this return value rather than as sibling `(result: T) => …`
   * callbacks, and that shape is load-bearing. A sibling callback is itself an inference site for `T`,
   * and TypeScript resolves such a site to `unknown` before it looks at this return type — so every
   * write's result silently becomes `unknown` in files that look unrelated to the cause. One inference
   * site is one too few to argue with.
   */
  run: (tx: Transaction) => PromiseLike<AuditedResult<T>>;
}

/**
 * What a `writeAudited` callback is handed.
 *
 * The one cast in `writeAudited` below turns the extended client's transaction client into this type.
 * The extension changes the client's *type*, not its shape: it adds query hooks, it does not remove
 * model delegates. So the cast is typing-only, and the hooks that enforce ADR-0020 still run inside the
 * transaction — asserted with a query that would succeed if they did not (`test/audit.spec.ts`).
 */
export type Transaction = Prisma.TransactionClient;

export async function writeAudited<T>(spec: AuditedWrite<T>): Promise<T> {
  return runAsCaller(spec.actor, () =>
    db.$transaction(async (tx) => {
      const { written, entityId, after } = await spec.run(tx as unknown as Transaction);

      await tx.auditLog.create({
        data: {
          user_id: spec.actor.id,
          actor_user_id: spec.actor.id,
          entity_type: spec.entityType,
          entity_id: entityId ?? null,
          action: spec.action,
          before_value: jsonOrUndefined(spec.before),
          after_value: jsonOrUndefined(after),
        },
      });

      return written;
    }),
  );
}
