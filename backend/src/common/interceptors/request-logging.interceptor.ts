import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
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
    }>();

    const method = request.method ?? 'UNKNOWN';
    const url = request.originalUrl ?? request.url ?? '/';
    const ip = request.ip ?? 'unknown';
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const elapsed = Date.now() - startedAt;
          this.logger.log(`${method} ${url} - ${elapsed}ms - ip=${ip}`);
        },
        error: (error: unknown) => {
          const elapsed = Date.now() - startedAt;
          const message = error instanceof Error ? error.message : 'unknown';
          this.logger.error(
            `${method} ${url} - ${elapsed}ms - ip=${ip} - error=${message}`,
          );
        },
      }),
    );
  }
}
