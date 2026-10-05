import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let database: { $queryRawUnsafe: jest.Mock };
  let fileStorage: { getDriver: jest.Mock; probe: jest.Mock };

  beforeEach(() => {
    database = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ ok: 1 }])
        .mockResolvedValueOnce([
          { total: 44, latest: '20260715210000_ciclo_16' },
        ]),
    };
    fileStorage = {
      getDriver: jest.fn().mockReturnValue('local'),
      probe: jest.fn().mockResolvedValue(undefined),
    };
    service = new HealthService(database as never, fileStorage as never);
  });

  it('keeps the public health check lightweight', async () => {
    const result = await service.status();

    expect(result).toEqual(
      expect.objectContaining({
        status: 'ok',
        database: 'ok',
        storage: 'ok',
      }),
    );
    expect(database.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(database.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1;');
  });

  it('returns database migration diagnostics without exposing secrets', async () => {
    const result = await service.databaseStatus();

    expect(result).toEqual(
      expect.objectContaining({
        status: 'ok',
        provider: 'postgresql',
        migrations: {
          available: true,
          total: 44,
          latest: '20260715210000_ciclo_16',
        },
      }),
    );
    expect(JSON.stringify(result)).not.toContain('DATABASE_URL');
  });

  it('returns storage driver diagnostics', () => {
    const result = service.storageStatus();

    expect(result).toEqual(
      expect.objectContaining({
        status: 'ok',
        driver: 'local',
        external: false,
        configured: true,
      }),
    );
  });

  it('verifies storage read and write for the protected health endpoint', async () => {
    await expect(service.storageProbeStatus()).resolves.toEqual(
      expect.objectContaining({ status: 'ok', verified: true }),
    );
    expect(fileStorage.probe).toHaveBeenCalledTimes(1);
  });

  it('reports storage probe failures as unavailable', async () => {
    fileStorage.probe.mockRejectedValue(new Error('bucket offline'));
    await expect(service.storageProbeStatus()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
