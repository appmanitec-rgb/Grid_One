export type StorageAdapterSaveInput = {
  storageKey: string;
  buffer: Buffer;
};

export interface StorageAdapter {
  readonly driver: string;
  save(input: StorageAdapterSaveInput): Promise<void>;
  load(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}
