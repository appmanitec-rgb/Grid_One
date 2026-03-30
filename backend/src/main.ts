import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { runDatabaseSafetyChecks } from './database/db-safety';
import { AppModule } from './app.module';

function parseCorsOrigins() {
  const raw =
    process.env.CORS_ORIGINS || 'http://localhost:3001,http://127.0.0.1:3001';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

async function bootstrap() {
  await runDatabaseSafetyChecks();

  const app = await NestFactory.create(AppModule);
  const allowedOrigins = parseCorsOrigins();

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    }),
  );

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Telemetry-Key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new RequestLoggingInterceptor());

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
