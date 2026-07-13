import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStorageService } from './file-storage.service';

describe('FileStorageService', () => {
  let service: FileStorageService;

  beforeEach(() => {
    service = new FileStorageService({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);
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
});
