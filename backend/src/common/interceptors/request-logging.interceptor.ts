import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable, tap } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
      user?: { sub?: string };
    }>();
    const response = context.switchToHttp().getResponse<{
      statusCode?: number;
      setHeader?: (name: string, value: string) => void;
    }>();

    const method = request.method ?? 'UNKNOWN';
    const url = this.sanitizeUrl(request.originalUrl ?? request.url ?? '/');
    const ip = request.ip ?? 'unknown';
    const requestId = this.resolveRequestId(request.headers);
    response.setHeader?.('X-Request-Id', requestId);
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const elapsed = Date.now() - startedAt;
          this.logger.log(
            JSON.stringify({
              type: 'http_request',
              requestId,
              timestamp: new Date().toISOString(),
              environment: process.env.NODE_ENV ?? 'development',
              version: process.env.npm_package_version ?? '0.0.0',
              method,
              route: url,
              status: response.statusCode ?? 200,
              durationMs: elapsed,
              userId: request.user?.sub ?? null,
              ip,
            }),
          );
        },
        error: (error: unknown) => {
          const elapsed = Date.now() - startedAt;
          const message = error instanceof Error ? error.message : 'unknown';
          this.logger.error(
            JSON.stringify({
              type: 'http_request_error',
              requestId,
              timestamp: new Date().toISOString(),
              environment: process.env.NODE_ENV ?? 'development',
              version: process.env.npm_package_version ?? '0.0.0',
              method,
              route: url,
              status: response.statusCode ?? 500,
              durationMs: elapsed,
              userId: request.user?.sub ?? null,
              ip,
              error: this.maskSensitiveText(message),
            }),
          );
        },
      }),
    );
  }

  private resolveRequestId(
    headers: Record<string, string | string[] | undefined> | undefined,
  ) {
    const raw = headers?.['x-request-id'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.trim() || randomUUID();
  }

  private sanitizeUrl(value: string) {
    const withoutSensitiveQuery = value.replace(
      /([?&][^=]*(?:token|secret|password|authorization|cookie|code)[^=]*=)[^&]*/gi,
      '$1[redacted]',
    );
    return withoutSensitiveQuery
      .replace(
        /\/public\/service-reports\/(share|verify)\/[^/?#]+/gi,
        '/public/service-reports/$1/[redacted]',
      )
      .replace(
        /\/customer-portal\/service-reports\/[^/]+\/evidence\/[^/?#]+\/download/gi,
        '/customer-portal/service-reports/[id]/evidence/[id]/download',
      )
      .replace(
        /\/service-reports\/[^/]+\/evidence\/[^/?#]+\/download/gi,
        '/service-reports/[id]/evidence/[id]/download',
      );
  }

  private maskSensitiveText(value: string) {
    return value.replace(
      /(database_url|authorization|cookie|password|secret|token|storagekey|s3_[a-z_]*key)[^,\s]*/gi,
      '$1=[redacted]',
    );
  }
}
