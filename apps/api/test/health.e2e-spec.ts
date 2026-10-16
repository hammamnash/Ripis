import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
// `expect` is deliberately absent: the assertions come from supertest's own chain (`.expect(200)`).
import { afterAll, beforeAll, describe, it } from 'vitest';
import { AppModule } from '../src/app.module';

/**
 * The contracts asserted here are the ones Task 0.4 exists to prove:
 * the module graph boots, and `GET /health` answers `{ status: "ok" }` with 200.
 *
 * The `/api` global prefix is applied in `main.ts`'s bootstrap, not in `AppModule`, so this
 * harness exercises the bare route. Adding the prefix to the app under test would make this
 * assertion test the harness instead of the controller.
 */
describe('health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok' });
  });
});
