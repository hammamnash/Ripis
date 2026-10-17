import { Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { defer, lastValueFrom } from 'rxjs';
import type { Observable } from 'rxjs';

import { runAsCaller } from './user-context';
import type { Caller } from './user-context';

/** What the auth layer puts on the request once it has authenticated the caller (Task 2.3). */
type RequestWithCaller = { user?: Caller };

/**
 * Establishes the caller context for the duration of one request.
 *
 * An interceptor rather than a guard, on purpose: guards run before interceptors, so the caller
 * only exists once the auth guard has run. A guard here would establish an empty context before
 * authentication and every scoped query would be refused for the wrong reason.
 *
 * With no authenticated caller the handler still runs, but there is no caller in context, so the
 * first scoped query fails loudly instead of quietly reading across accounts. Health and login are
 * unaffected, because neither touches a scoped model.
 */
@Injectable()
export class CallerContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithCaller>();
    const caller = request.user;

    if (!caller) {
      return next.handle();
    }

    // `defer` matters: the subscription is what runs the handler, so entering the context at
    // subscription time is the only way the context is still in scope when the handler runs.
    return defer(() => runAsCaller(caller, () => lastValueFrom(next.handle())));
  }
}
