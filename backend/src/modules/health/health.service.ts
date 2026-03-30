import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  async status() {
    const startedAt = process.uptime();
    const now = new Date().toISOString();

    await this.database.$queryRawUnsafe('SELECT 1;');

    return {
      status: 'ok',
      timestamp: now,
      uptimeSeconds: Number(startedAt.toFixed(2)),
      version: process.env.npm_package_version ?? '0.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      database: 'ok',
    };
  }
}
