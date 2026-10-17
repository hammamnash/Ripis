import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The caller of the request being served, as established by the auth layer (Task 2.3).
 *
 * This is what lets scoping live in the data layer instead of in every service signature: the
 * Prisma extension reads it, so a service cannot forget to pass a user id — it never passes one.
 */
export type Caller = {
  id: string;
  role: 'admin' | 'user';
};

const storage = new AsyncLocalStorage<Caller>();

/**
 * Runs `work` as `caller`, and keeps the context alive until that work has actually finished.
 *
 * The `await` inside is the whole point, not a formality: Prisma hands back a lazy PrismaPromise,
 * so a synchronous `storage.run(caller, work)` returns before the query is ever sent. The
 * extension would then look for a caller, find none, and refuse the read — which is exactly the
 * failure this repository hit on its first run. The context has to span *execution*, not just the
 * construction of the promise.
 */
export async function runAsCaller<T>(caller: Caller, work: () => T): Promise<T> {
  return storage.run(caller, async () => await work());
}

/** The caller of the work in progress, or `undefined` when there is none. */
export function currentCaller(): Caller | undefined {
  return storage.getStore();
}
