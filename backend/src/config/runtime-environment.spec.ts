import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { validateRuntimeEnvironment } from './runtime-environment';

describe('production environment validation', () => {
  const production = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://app:test@localhost:5432/gridone',
    DB_NAME: 'gridone',
    JWT_SECRET: 'a-secure-and-long-test-only-key-123456789',
    CORS_ORIGINS: 'https://erp.example.com',
    APP_BASE_URL: 'https://erp.example.com',
    FRONTEND_BASE_URL: 'https://erp.example.com',
    FILE_STORAGE_DRIVER: 'local',
    FILE_STORAGE_LOCAL_PATH: resolve(process.cwd(), 'storage/private'),
    API_TRUST_PROXY: 'loopback',
  };
  it('accepts persistent local storage without optional external integrations', () => {
    expect(validateRuntimeEnvironment(production)).toEqual({
      environment: 'production',
      storage: 'local',
    });
  });
  it.each([
    { JWT_SECRET: 'short' },
    { JWT_SECRET: 'REPLACE_WITH_64_PLUS_RANDOM_CHARS' },
    { DB_NAME: 'another_database' },
    { EXPECTED_DB_NAME: 'another_database' },
    { CORS_ORIGINS: '*' },
    { CORS_ORIGINS: 'https://erp.example.com/path' },
    { APP_BASE_URL: 'http://erp.example.com' },
    { APP_BASE_URL: 'https://user:password@erp.example.com' },
    { FILE_STORAGE_LOCAL_PATH: 'relative/path' },
    { FILE_STORAGE_LOCAL_PATH: resolve(tmpdir(), 'gridone-files') },
    { FILE_STORAGE_DRIVER: 'unknown' },
    { FILE_STORAGE_DRIVER: 's3' },
    { API_TRUST_PROXY: 'true' },
    { API_TRUST_PROXY: '127.0.0.1/99' },
    { ALLOW_DB_RESTORE: 'yes' },
  ])('rejects invalid production configuration %j', (override) => {
    expect(() =>
      validateRuntimeEnvironment({ ...production, ...override }),
    ).toThrow();
  });
  it('allows loopback URLs and explicitly trusted proxies', () => {
    expect(() =>
      validateRuntimeEnvironment({
        ...production,
        APP_BASE_URL: 'http://127.0.0.1:3001',
        FRONTEND_BASE_URL: 'http://localhost:3001',
        CORS_ORIGINS: 'http://localhost:3001',
        API_TRUST_PROXY: 'loopback,10.20.0.0/16',
      }),
    ).not.toThrow();
  });
  it('keeps development and isolated tests independent of production storage', () => {
    expect(() =>
      validateRuntimeEnvironment({
        DATABASE_URL: production.DATABASE_URL,
        JWT_SECRET: 'test-secret',
        NODE_ENV: 'test',
      }),
    ).not.toThrow();
  });
});
