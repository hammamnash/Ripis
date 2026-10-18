import type { Prisma } from '@prisma/client';

import { runAsCaller, type Caller } from './context';
import { db } from './db';

/**
 * §14: "Default retention is 24 months, with `before_value`/`after_value` older than 90 days compacted
 * to a summary. Both are configurable."
 *
 * Nothing calls `applyAuditRetention` yet, and that is deliberate. ADR-0011 and ADR-0039 leave no worker
 * and no third process, so a sweep happens when something asks for it — a scheduled route under
 * `app/api/**`, or a command — and today there is no history old enough to be worth sweeping. The
 * mechanism and its settings exist so that the day there is, the sweep is a call and not a project.
 */
export interface AuditRetention {
  retentionMonths: number;
  compactAfterDays: number;
}

export const DEFAULT_AUDIT_RETENTION: AuditRetention = {
  retentionMonths: 24,
  compactAfterDays: 90,
};

const DAY_MS = 86_400_000;

function positiveInteger(raw: string | undefined, fallback: number, variable: string): number {
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${variable} must be a positive whole number, but it is "${raw}".`);
  }

  return value;
}

export function readAuditRetention(
  env: Record<string, string | undefined> = process.env,
): AuditRetention {
  return {
    retentionMonths: positiveInteger(
      env.AUDIT_RETENTION_MONTHS,
      DEFAULT_AUDIT_RETENTION.retentionMonths,
      'AUDIT_RETENTION_MONTHS',
    ),
    compactAfterDays: positiveInteger(
      env.AUDIT_COMPACT_AFTER_DAYS,
      DEFAULT_AUDIT_RETENTION.compactAfterDays,
      'AUDIT_COMPACT_AFTER_DAYS',
    ),
  };
}

/** What replaces a compacted value: the row keeps its identity, its action and its entities, not its payload. */
export function compactionSummary(now: Date, retention: AuditRetention): Prisma.InputJsonValue {
  return {
    compacted: true,
    compacted_at: now.toISOString(),
    note: `before and after values are removed ${retention.compactAfterDays} days after the event (§14)`,
  };
}

export interface RetentionResult {
  compacted: number;
  pruned: number;
}

function isCompacted(value: Prisma.JsonValue | null): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return (value as { compacted?: unknown }).compacted === true;
}

export async function applyAuditRetention(
  now = new Date(),
  retention: AuditRetention = readAuditRetention(),
): Promise<RetentionResult> {
  const compactBefore = new Date(now.getTime() - retention.compactAfterDays * DAY_MS);
  const pruneBefore = new Date(now);
  pruneBefore.setMonth(pruneBefore.getMonth() - retention.retentionMonths);

  const summary = compactionSummary(now, retention);
  const result: RetentionResult = { compacted: 0, pruned: 0 };

  // `user` is deliberately not a scoped model (ADR-0043), so the sweep can find the ledgers. Every audit
  // row is then read and written *as its own ledger*, which is what keeps ADR-0020 true for a job that
  // spans accounts: it never gains a wider view than any single account has.
  const users = await db.user.findMany({ select: { id: true, role: true } });

  for (const user of users) {
    const caller: Caller = { id: user.id, role: user.role };

    await runAsCaller(caller, async () => {
      const pruned = await db.auditLog.deleteMany({
        where: { created_at: { lt: pruneBefore } },
      });
      result.pruned += pruned.count;

      const stale = await db.auditLog.findMany({
        where: { created_at: { lt: compactBefore } },
        select: { id: true, before_value: true, after_value: true },
      });

      for (const row of stale) {
        if (isCompacted(row.before_value) && isCompacted(row.after_value)) {
          continue;
        }

        await db.auditLog.update({
          where: { id: row.id },
          data: {
            // `undefined` leaves an already-null column null, which is the same outcome as writing null
            // and is the only spelling Prisma's Json input type accepts.
            before_value: row.before_value === null ? undefined : summary,
            after_value: row.after_value === null ? undefined : summary,
          },
        });

        result.compacted += 1;
      }
    });
  }

  return result;
}
