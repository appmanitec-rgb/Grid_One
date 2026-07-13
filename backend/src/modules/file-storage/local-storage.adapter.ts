import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { dirname, isAbsolute, normalize, relative, resolve } from 'path';
import { StorageAdapter, StorageAdapterSaveInput } from './storage-adapter';

export class LocalStorageAdapter implements StorageAdapter {
  readonly driver = 'local';

  constructor(private readonly baseDir: string) {}

  async save(input: StorageAdapterSaveInput): Promise<void> {
    const targetPath = this.resolveStoragePath(input.storageKey);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, input.buffer, { flag: 'wx' });
  }

  async load(storageKey: string): Promise<Buffer> {
    const targetPath = this.resolveStoragePath(storageKey);
    try {
      const [buffer, fileStat] = await Promise.all([
        readFile(targetPath),
        stat(targetPath),
      ]);
      if (!fileStat.isFile()) {
        throw new NotFoundException('Arquivo nao encontrado.');
      }
      return buffer;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new NotFoundException('Arquivo nao encontrado.');
    }
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
