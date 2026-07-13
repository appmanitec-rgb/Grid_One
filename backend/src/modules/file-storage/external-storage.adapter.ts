import { ServiceUnavailableException } from '@nestjs/common';
import { StorageAdapter } from './storage-adapter';

const SUPPORTED_EXTERNAL_DRIVERS = ['s3', 'minio', 'supabase'];

export class PreparedExternalStorageAdapter implements StorageAdapter {
  readonly driver: string;

  constructor(driver: string) {
    this.driver = SUPPORTED_EXTERNAL_DRIVERS.includes(driver)
      ? driver
      : 'external';
  }

  save(): Promise<void> {
    return Promise.reject(this.notConfiguredError());
  }

  load(): Promise<Buffer> {
    return Promise.reject(this.notConfiguredError());
  }

  private notConfiguredError() {
    return new ServiceUnavailableException(
      `Storage externo ${this.driver} preparado, mas sem adapter ativo neste ambiente. Configure FILE_STORAGE_DRIVER=local ou implemente credenciais/SDK do provedor.`,
    );
  }
}
