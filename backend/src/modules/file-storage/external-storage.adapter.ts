import {
  BadRequestException,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { URL } from 'url';
import { StorageAdapter, StorageAdapterSaveInput } from './storage-adapter';

export type S3StorageAdapterOptions = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  driver?: string;
  transport?: S3Transport;
};

export type S3TransportRequest = {
  method: 'PUT' | 'GET' | 'DELETE';
  url: URL;
  headers: Record<string, string>;
  body?: Buffer;
};

export type S3TransportResponse = {
  statusCode: number;
  body: Buffer;
};

export type S3Transport = (
  request: S3TransportRequest,
) => Promise<S3TransportResponse>;

const SUPPORTED_EXTERNAL_DRIVERS = new Set(['s3', 'minio', 'supabase']);

export class S3StorageAdapter implements StorageAdapter {
  readonly driver: string;

  private readonly endpoint: URL;
  private readonly bucket: string;
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly forcePathStyle: boolean;
  private readonly transport: S3Transport;

  constructor(options: S3StorageAdapterOptions) {
    this.driver = options.driver || 's3';
    this.endpoint = new URL(options.endpoint);
    this.bucket = this.validateBucket(options.bucket);
    this.region = options.region || 'us-east-1';
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.forcePathStyle = options.forcePathStyle;
    this.transport = options.transport ?? defaultS3Transport;
  }

  static fromConfig(configService: ConfigService, driver: string) {
    if (!SUPPORTED_EXTERNAL_DRIVERS.has(driver)) {
      throw new ServiceUnavailableException(
        `Driver de storage externo nao suportado: ${driver}.`,
      );
    }
    const endpoint =
      configService.get<string>('S3_ENDPOINT') ||
      configService.get<string>('FILE_STORAGE_ENDPOINT');
    const bucket =
      configService.get<string>('S3_BUCKET') ||
      configService.get<string>('FILE_STORAGE_BUCKET');
    const accessKeyId =
      configService.get<string>('S3_ACCESS_KEY_ID') ||
      configService.get<string>('FILE_STORAGE_ACCESS_KEY_ID');
    const secretAccessKey =
      configService.get<string>('S3_SECRET_ACCESS_KEY') ||
      configService.get<string>('FILE_STORAGE_SECRET_ACCESS_KEY');
    const region =
      configService.get<string>('S3_REGION') ||
      configService.get<string>('FILE_STORAGE_REGION') ||
      'us-east-1';
    const forcePathStyle = parseBoolean(
      configService.get<string>('S3_FORCE_PATH_STYLE') ||
        configService.get<string>('FILE_STORAGE_FORCE_PATH_STYLE'),
      true,
    );

    const missing = [
      ['S3_ENDPOINT', endpoint],
      ['S3_BUCKET', bucket],
      ['S3_ACCESS_KEY_ID', accessKeyId],
      ['S3_SECRET_ACCESS_KEY', secretAccessKey],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);
    if (missing.length > 0) {
      throw new ServiceUnavailableException(
        `Storage externo ${driver} sem configuracao obrigatoria: ${missing.join(
          ', ',
        )}.`,
      );
    }

    return new S3StorageAdapter({
      endpoint: endpoint!,
      bucket: bucket!,
      region,
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
      forcePathStyle,
      driver,
    });
  }

  async save(input: StorageAdapterSaveInput): Promise<void> {
    const response = await this.sendSignedRequest(
      'PUT',
      input.storageKey,
      input.buffer,
    );
    this.assertSuccess(response, 'salvar');
  }

  async load(storageKey: string): Promise<Buffer> {
    const response = await this.sendSignedRequest('GET', storageKey);
    if (response.statusCode === 404) {
      throw new NotFoundException('Arquivo nao encontrado.');
    }
    this.assertSuccess(response, 'carregar');
    return response.body;
  }

  async remove(storageKey: string): Promise<void> {
    const response = await this.sendSignedRequest('DELETE', storageKey);
    if (response.statusCode === 404) {
      throw new NotFoundException('Arquivo nao encontrado.');
    }
    this.assertSuccess(response, 'remover');
  }

  private async sendSignedRequest(
    method: S3TransportRequest['method'],
    storageKey: string,
    body: Buffer<ArrayBufferLike> = Buffer.alloc(0),
  ) {
    const url = this.buildObjectUrl(storageKey);
    const payloadHash = sha256Hex(body);
    const now = new Date();
    const amzDate = toAmzDate(now);
    const dateStamp = amzDate.slice(0, 8);
    const headers: Record<string, string> = {
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    if (method === 'PUT') {
      headers['content-length'] = String(body.length);
    }

    const signedHeaders = Object.keys(headers)
      .map((key) => key.toLowerCase())
      .sort()
      .join(';');
    const canonicalHeaders = Object.keys(headers)
      .map((key) => key.toLowerCase())
      .sort()
      .map((key) => `${key}:${headers[key].trim()}\n`)
      .join('');
    const canonicalRequest = [
      method,
      url.pathname,
      url.search.startsWith('?') ? url.search.slice(1) : '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(Buffer.from(canonicalRequest)),
    ].join('\n');
    const signingKey = this.getSigningKey(dateStamp);
    const signature = hmacHex(signingKey, stringToSign);
    headers.authorization = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

    return this.transport({
      method,
      url,
      headers,
      body: method === 'GET' ? undefined : body,
    });
  }

  private buildObjectUrl(storageKey: string) {
    const key = encodeStorageKey(this.validateStorageKey(storageKey));
    const url = new URL(this.endpoint.toString());
    const basePath = url.pathname.replace(/\/+$/, '');
    if (this.forcePathStyle) {
      url.pathname = joinUrlPath(basePath, this.bucket, key);
    } else {
      url.hostname = `${this.bucket}.${url.hostname}`;
      url.pathname = joinUrlPath(basePath, key);
    }
    url.search = '';
    return url;
  }

  private getSigningKey(dateStamp: string) {
    const kDate = hmacBuffer(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = hmacBuffer(kDate, this.region);
    const kService = hmacBuffer(kRegion, 's3');
    return hmacBuffer(kService, 'aws4_request');
  }

  private validateStorageKey(storageKey: string) {
    if (
      !storageKey ||
      storageKey.includes('..') ||
      storageKey.startsWith('/') ||
      storageKey.includes('\\') ||
      hasControlCharacter(storageKey)
    ) {
      throw new BadRequestException('Caminho de arquivo invalido.');
    }
    return storageKey;
  }

  private validateBucket(bucket: string) {
    if (!bucket || bucket.includes('/') || bucket.includes('\\')) {
      throw new ServiceUnavailableException('Bucket de storage invalido.');
    }
    return bucket;
  }

  private assertSuccess(response: S3TransportResponse, action: string) {
    if (response.statusCode >= 200 && response.statusCode < 300) return;
    throw new ServiceUnavailableException(
      `Falha ao ${action} arquivo no storage externo (${response.statusCode}).`,
    );
  }
}

async function defaultS3Transport(
  request: S3TransportRequest,
): Promise<S3TransportResponse> {
  const client = request.url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const outgoing = client(
      request.url,
      {
        method: request.method,
        headers: request.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        response.on('end', () =>
          resolve({
            statusCode: response.statusCode ?? 0,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    outgoing.on('error', reject);
    if (request.body) {
      outgoing.write(request.body);
    }
    outgoing.end();
  });
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'sim'].includes(value.toLowerCase());
}

function encodeStorageKey(storageKey: string) {
  return storageKey.split('/').map(encodeURIComponent).join('/');
}

function joinUrlPath(...parts: string[]) {
  const joined = parts
    .filter((part) => part !== '')
    .map((part, index) =>
      index === 0 ? part.replace(/\/+$/, '') : part.replace(/^\/+|\/+$/g, ''),
    )
    .filter(Boolean)
    .join('/');
  return joined.startsWith('/') ? joined : `/${joined}`;
}

function hasControlCharacter(value: string) {
  return [...value].some((char) => char.charCodeAt(0) < 32);
}

function toAmzDate(date: Date) {
  return date
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, '')
    .replace('Z', 'Z');
}

function sha256Hex(value: Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function hmacBuffer(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: Buffer, value: string) {
  return createHmac('sha256', key).update(value).digest('hex');
}
