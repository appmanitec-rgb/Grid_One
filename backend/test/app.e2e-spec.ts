import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { App } from 'supertest/types';
import { RequireAccessPolicy } from '../src/modules/auth/access-policy.decorator';
import { AccessPolicyGuard } from '../src/modules/auth/access-policy.guard';

type TestUser = {
  sub: string;
  role: string;
  isSystemMaster: boolean;
  accessPolicy: {
    pages: {
      catalog: boolean;
    };
  };
};

@Controller()
class E2eAuthController {
  @Get('public/ping')
  ping() {
    return { ok: true };
  }

  @UseGuards(AccessPolicyGuard)
  @RequireAccessPolicy('pages.catalog')
  @Get('secure/catalog')
  catalog() {
    return { ok: true };
  }
}

describe('Access Policy E2E', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [E2eAuthController],
      providers: [AccessPolicyGuard],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.use(
      (
        req: Request & { user?: TestUser },
        _res: Response,
        next: NextFunction,
      ) => {
        const role = req.header('x-test-role');
        const catalogAccess = req.header('x-test-catalog-access');

        if (role) {
          req.user = {
            sub: 'test-user',
            role,
            isSystemMaster: false,
            accessPolicy: {
              pages: {
                catalog: catalogAccess === 'true',
              },
            },
          };
        }

        next();
      },
    );

    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 for public endpoint', async () => {
    await request(app.getHttpServer()).get('/public/ping').expect(200);
  });

  it('returns 401 for protected endpoint without user', async () => {
    await request(app.getHttpServer()).get('/secure/catalog').expect(401);
  });

  it('returns 403 for user without required policy', async () => {
    await request(app.getHttpServer())
      .get('/secure/catalog')
      .set('x-test-role', 'SALES')
      .set('x-test-catalog-access', 'false')
      .expect(403);
  });

  it('returns 200 for user with required policy', async () => {
    await request(app.getHttpServer())
      .get('/secure/catalog')
      .set('x-test-role', 'SALES')
      .set('x-test-catalog-access', 'true')
      .expect(200);
  });

  it('returns 200 for admin user', async () => {
    await request(app.getHttpServer())
      .get('/secure/catalog')
      .set('x-test-role', 'ADMIN')
      .set('x-test-catalog-access', 'false')
      .expect(200);
  });
});
