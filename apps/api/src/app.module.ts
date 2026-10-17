import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CallerContextInterceptor } from './common/caller-context.interceptor';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

/**
 * The root module. Feature modules arrive in later phases and are imported here — nothing else
 * is wired at this point, and the health route is deliberately the only one that exists.
 */
@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    // Establishes the caller context that every scoped Prisma read and write depends on
    // (ADR-0020). It is an interceptor, not a guard, so that it runs *after* authentication has
    // put the caller on the request.
    { provide: APP_INTERCEPTOR, useClass: CallerContextInterceptor },
  ],
})
export class AppModule {}
