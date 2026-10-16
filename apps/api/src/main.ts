import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // The `/api` base path of the contract (02-context.md §6). It lives here, in bootstrap, so the
  // e2e harness boots the module graph without it — see test/health.e2e-spec.ts.
  app.setGlobalPrefix('api');

  // PORT is the contract's variable (.env.example). 3000 is the documented default, not a fallback
  // of convenience: the web app's proxy targets it.
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
