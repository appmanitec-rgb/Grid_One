import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from 'path';

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

@Injectable()
export class FileStorageService {
  private readonly baseDir: string;

  constructor(configService: ConfigService) {
    this.baseDir = resolve(
      configService.get<string>('FILE_STORAGE_DIR') ||
        join(process.cwd(), 'storage', 'private'),
    );
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
    const targetPath = this.resolveStoragePath(storageKey);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, buffer, { flag: 'wx' });

    return {
      storageKey,
      fileName: this.sanitizeFileName(file.originalname || randomName),
      mimeType,
      sizeBytes: buffer.length,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  async load(storageKey: string, metadata: Omit<StoredFile, 'storageKey'>) {
    const targetPath = this.resolveStoragePath(storageKey);
    try {
      const [buffer, fileStat] = await Promise.all([
        readFile(targetPath),
        stat(targetPath),
      ]);
      if (!fileStat.isFile()) {
        throw new NotFoundException('Arquivo nao encontrado.');
      }
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

  private validateFile(file: UploadFile) {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Arquivo obrigatorio.');
    }
    const mimeType = file.mimetype || '';
    if (!MIME_EXTENSIONS[mimeType]) {
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
      !Object.values(MIME_EXTENSIONS).includes(originalExtension)
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

  private resolveStoragePath(storageKey: string) {
    if (
      !storageKey ||
      storageKey.includes('..') ||
      storageKey.startsWith('/')
    ) {
      throw new BadRequestException('Caminho de arquivo invalido.');
    }
    const targetPath = normalize(resolve(this.baseDir, storageKey));
    const relativePath = relative(this.baseDir, targetPath);
    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new BadRequestException('Caminho de arquivo invalido.');
    }
    return targetPath;
  }
}
