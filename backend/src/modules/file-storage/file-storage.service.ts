import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { extname, join, resolve } from 'path';
import { S3StorageAdapter } from './external-storage.adapter';
import { LocalStorageAdapter } from './local-storage.adapter';
import { StorageAdapter } from './storage-adapter';

type UploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

export type StoredFile = {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
};

export type LoadedFile = StoredFile & {
  buffer: Buffer;
};

const IMAGE_LIMIT_BYTES = 10 * 1024 * 1024;
const PDF_LIMIT_BYTES = 20 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const DOCUMENT_MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
};

@Injectable()
export class FileStorageService {
  private readonly adapter: StorageAdapter;

  constructor(configService: ConfigService) {
    const driver = (
      configService.get<string>('FILE_STORAGE_DRIVER') || 'local'
    ).toLowerCase();
    if (driver === 'local') {
      const baseDir = resolve(
        configService.get<string>('FILE_STORAGE_LOCAL_PATH') ||
          configService.get<string>('FILE_STORAGE_DIR') ||
          join(process.cwd(), 'storage', 'private'),
      );
      this.adapter = new LocalStorageAdapter(baseDir);
    } else {
      this.adapter = S3StorageAdapter.fromConfig(configService, driver);
    }
  }

  getDriver() {
    return this.adapter.driver;
  }

  async saveServiceReportFile(file: UploadFile): Promise<StoredFile> {
    this.validateFile(file);
    const mimeType = file.mimetype!;
    const buffer = file.buffer!;
    const extension = MIME_EXTENSIONS[mimeType];
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const randomName = `${randomBytes(16).toString('hex')}${extension}`;
    const storageKey = ['service-reports', year, month, randomName].join('/');
    await this.adapter.save({ storageKey, buffer });

    return {
      storageKey,
      fileName: this.sanitizeFileName(file.originalname || randomName),
      mimeType,
      sizeBytes: buffer.length,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  async saveServiceReportPdf(
    fileName: string,
    buffer: Buffer,
  ): Promise<StoredFile> {
    return this.savePdfInFolder('service-report-pdfs', fileName, buffer);
  }

  async saveDocumentPdf(
    folder: string,
    fileName: string,
    buffer: Buffer,
  ): Promise<StoredFile> {
    return this.savePdfInFolder(
      ['documents', folder].join('/'),
      fileName,
      buffer,
    );
  }

  async saveDocumentFile(
    folder: string,
    fileName: string,
    buffer: Buffer,
    mimeType: keyof typeof DOCUMENT_MIME_EXTENSIONS,
  ): Promise<StoredFile> {
    const file: UploadFile = {
      originalname: fileName,
      mimetype: mimeType,
      size: buffer.length,
      buffer,
    };
    this.validateFile(file, DOCUMENT_MIME_EXTENSIONS);
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const extension = DOCUMENT_MIME_EXTENSIONS[mimeType];
    const randomName = `${randomBytes(16).toString('hex')}${extension}`;
    const storageKey = ['documents', folder, year, month, randomName].join('/');
    await this.adapter.save({ storageKey, buffer });
    return {
      storageKey,
      fileName: this.sanitizeFileName(fileName || randomName),
      mimeType,
      sizeBytes: buffer.length,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  private async savePdfInFolder(
    folder: string,
    fileName: string,
    buffer: Buffer,
  ): Promise<StoredFile> {
    const file: UploadFile = {
      originalname: fileName,
      mimetype: 'application/pdf',
      size: buffer.length,
      buffer,
    };
    this.validateFile(file);
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const randomName = `${randomBytes(16).toString('hex')}.pdf`;
    const storageKey = [folder, year, month, randomName].join('/');
    await this.adapter.save({ storageKey, buffer });
    return {
      storageKey,
      fileName: this.sanitizeFileName(fileName || randomName),
      mimeType: 'application/pdf',
      sizeBytes: buffer.length,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  async load(storageKey: string, metadata: Omit<StoredFile, 'storageKey'>) {
    try {
      const buffer = await this.adapter.load(storageKey);
      return {
        ...metadata,
        storageKey,
        buffer,
      } satisfies LoadedFile;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException('Arquivo nao encontrado.');
    }
  }

  async remove(storageKey: string) {
    return this.adapter.remove(storageKey);
  }

  private validateFile(
    file: UploadFile,
    allowedMimeExtensions = MIME_EXTENSIONS,
  ) {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Arquivo obrigatorio.');
    }
    const mimeType = file.mimetype || '';
    if (!allowedMimeExtensions[mimeType]) {
      throw new BadRequestException('Tipo de arquivo nao permitido.');
    }
    const size = file.size ?? file.buffer.length;
    const limit =
      mimeType === 'application/pdf' ? PDF_LIMIT_BYTES : IMAGE_LIMIT_BYTES;
    if (size > limit || file.buffer.length > limit) {
      throw new BadRequestException(
        'Arquivo excede o tamanho maximo permitido.',
      );
    }
    if (!this.matchesMagicNumber(mimeType, file.buffer)) {
      throw new BadRequestException(
        'Conteudo do arquivo nao confere com o MIME.',
      );
    }
    const originalExtension = extname(file.originalname || '').toLowerCase();
    if (
      originalExtension &&
      !Object.values(allowedMimeExtensions).includes(originalExtension)
    ) {
      throw new BadRequestException('Extensao de arquivo nao permitida.');
    }
  }

  private matchesMagicNumber(mimeType: string, buffer: Buffer) {
    if (mimeType === 'image/jpeg') {
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8;
    }
    if (mimeType === 'image/png') {
      return buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (mimeType === 'image/webp') {
      return (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    if (mimeType === 'application/pdf') {
      return buffer.subarray(0, 4).toString('ascii') === '%PDF';
    }
    if (
      mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return buffer.subarray(0, 4).toString('binary') === 'PK\u0003\u0004';
    }
    return false;
  }

  private sanitizeFileName(value: string) {
    const fallback = 'arquivo';
    const sanitized = value
      .replace(/[/\\?%*:|"<>]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
    return sanitized.slice(0, 180) || fallback;
  }
}
