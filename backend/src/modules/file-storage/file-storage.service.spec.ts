import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { S3StorageAdapter, S3Transport } from './external-storage.adapter';
import { FileStorageService } from './file-storage.service';

describe('FileStorageService', () => {
  let service: FileStorageService;
  let tempDir: string | undefined;

  beforeEach(() => {
    service = new FileStorageService({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true });
      tempDir = undefined;
    }
  });

  it('rejeita mimeType invalido', async () => {
    await expect(
      service.saveServiceReportFile({
        originalname: 'script.exe',
        mimetype: 'application/x-msdownload',
        size: 4,
        buffer: Buffer.from('MZ00'),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejeita arquivo acima do limite permitido', async () => {
    await expect(
      service.saveServiceReportFile({
        originalname: 'foto.jpg',
        mimetype: 'image/jpeg',
        size: 10 * 1024 * 1024 + 1,
        buffer: Buffer.concat([
          Buffer.from([0xff, 0xd8, 0xff]),
          Buffer.alloc(10 * 1024 * 1024),
        ]),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('usa storage local por padrao e permite salvar, carregar e remover', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'manitec-storage-'));
    service = new FileStorageService({
      get: jest.fn((key: string) =>
        key === 'FILE_STORAGE_LOCAL_PATH' ? tempDir : undefined,
      ),
    } as unknown as ConfigService);

    const stored = await service.saveServiceReportFile({
      originalname: 'foto.png',
      mimetype: 'image/png',
      size: 8,
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    });
    const loaded = await service.load(stored.storageKey, {
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      checksumSha256: stored.checksumSha256,
    });

    expect(service.getDriver()).toBe('local');
    expect(loaded.buffer.length).toBe(8);
    await expect(service.remove(stored.storageKey)).resolves.toBeUndefined();
  });

  it('falha claramente quando S3 e configurado sem credenciais', () => {
    expect(
      () =>
        new FileStorageService({
          get: jest.fn((key: string) =>
            key === 'FILE_STORAGE_DRIVER' ? 's3' : undefined,
          ),
        } as unknown as ConfigService),
    ).toThrow(ServiceUnavailableException);
  });
});

describe('S3StorageAdapter', () => {
  it('assina PUT, GET e DELETE em endpoint compativel S3', async () => {
    const transport: jest.MockedFunction<S3Transport> = jest
      .fn()
      .mockResolvedValueOnce({ statusCode: 200, body: Buffer.alloc(0) })
      .mockResolvedValueOnce({ statusCode: 200, body: Buffer.from('ok') })
      .mockResolvedValueOnce({ statusCode: 204, body: Buffer.alloc(0) });
    const adapter = new S3StorageAdapter({
      endpoint: 'http://127.0.0.1:9000',
      bucket: 'manitec-private',
      region: 'us-east-1',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
      forcePathStyle: true,
      transport,
      driver: 's3',
    });

    await adapter.save({
      storageKey: 'service-reports/2026/07/laudo.pdf',
      buffer: Buffer.from('%PDF'),
    });
    const loaded = await adapter.load('service-reports/2026/07/laudo.pdf');
    await adapter.remove('service-reports/2026/07/laudo.pdf');

    expect(loaded).toEqual(Buffer.from('ok'));
    expect(transport).toHaveBeenCalledTimes(3);
    const firstRequest = transport.mock.calls[0][0];
    expect(firstRequest.method).toBe('PUT');
    expect(firstRequest.url.pathname).toBe(
      '/manitec-private/service-reports/2026/07/laudo.pdf',
    );
    expect(firstRequest.headers.authorization).toContain('AWS4-HMAC-SHA256');
    expect(firstRequest.headers['x-amz-content-sha256']).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
});
