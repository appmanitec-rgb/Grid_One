import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/database/database.service';
import { FileStorageService } from '../file-storage/file-storage.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly fileStorage: FileStorageService,
  ) {}

  async status() {
    const database = await this.databaseStatus();
    const storage = this.storageStatus();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      version: process.env.npm_package_version ?? '0.0.0',
      environment: process.env.NODE_ENV ?? 'development',
      database: database.status,
      storage: storage.status,
    };
  }

  async databaseStatus() {
    await this.database.$queryRawUnsafe('SELECT 1;');
    const migrations = await this.readMigrationDiagnostics();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      provider: 'postgresql',
      migrations,
    };
  }

  storageStatus() {
    const driver = this.fileStorage.getDriver();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      driver,
      external: driver !== 'local',
      configured: true,
    };
  }

  private async readMigrationDiagnostics() {
    try {
      const rows = await this.database.$queryRawUnsafe<
        Array<{ total: number; latest: string | null }>
      >(
        'SELECT COUNT(*)::int AS total, MAX("migration_name") AS latest FROM "_prisma_migrations";',
      );
      return {
        available: true,
        total: Number(rows[0]?.total || 0),
        latest: rows[0]?.latest ?? null,
      };
    } catch {
      return {
        available: false,
        total: null,
        latest: null,
      };
    }
  }
}
