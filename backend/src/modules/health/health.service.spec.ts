import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let database: { $queryRawUnsafe: jest.Mock };
  let fileStorage: { getDriver: jest.Mock };

  beforeEach(() => {
    database = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ ok: 1 }])
        .mockResolvedValueOnce([
          { total: 44, latest: '20260715210000_ciclo_16' },
        ]),
    };
    fileStorage = { getDriver: jest.fn().mockReturnValue('local') };
    service = new HealthService(database as never, fileStorage as never);
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
});
