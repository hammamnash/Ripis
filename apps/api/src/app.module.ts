import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

/**
 * The root module. Feature modules arrive in later phases and are imported here — nothing else
 * is wired at this point, and the health route is deliberately the only one that exists.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class AppModule {}
