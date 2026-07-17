import { Logger } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

function createContext(url: string, statusCode = 200): ExecutionContext {
  const request = {
    method: 'GET',
    originalUrl: url,
    ip: '127.0.0.1',
    headers: { 'x-request-id': 'req-test-1' },
    user: { sub: 'user-1' },
  };
  const response = {
    statusCode,
    setHeader: jest.fn(),
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('RequestLoggingInterceptor', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs structured request data without exposing public tokens', async () => {
    const interceptor = new RequestLoggingInterceptor();

    await lastValueFrom(
      interceptor.intercept(
        createContext('/public/service-reports/share/secret-token?code=123'),
        { handle: () => of({ ok: true }) },
      ),
    );

    const payload = String(logSpy.mock.calls[0][0]);
    expect(payload).toContain('"requestId":"req-test-1"');
    expect(payload).toContain('/public/service-reports/share/[redacted]');
    expect(payload).toContain('code=[redacted]');
    expect(payload).not.toContain('secret-token');
    expect(payload).not.toContain('123');
  });

  it('masks sensitive error text', async () => {
    const interceptor = new RequestLoggingInterceptor();

    await expect(
      lastValueFrom(
        interceptor.intercept(createContext('/health/db', 500), {
          handle: () =>
            throwError(() => new Error('DATABASE_URL=postgres://secret')),
        }),
      ),
    ).rejects.toThrow('DATABASE_URL');

    const payload = String(errorSpy.mock.calls[0][0]);
    expect(payload).toContain('DATABASE_URL=[redacted]');
    expect(payload).not.toContain('postgres://secret');
  });
});
