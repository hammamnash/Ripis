import { Injectable } from '@nestjs/common';
import { HealthResponse } from './health.types';

/**
 * Trivial on purpose, and *injected* on purpose: a controller with a constructor dependency is what
 * makes the decorator-metadata requirement (ADR-0035) a load-bearing assertion instead of a comment.
 * If the test transform ever stops emitting `design:paramtypes`, the e2e suite fails here first.
 */
@Injectable()
export class HealthService {
  check(): HealthResponse {
    return { status: 'ok' };
  }
}
