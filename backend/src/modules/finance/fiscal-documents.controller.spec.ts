import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { FiscalCertificatesService } from './fiscal-certificates.service';
import { FiscalDocumentsController } from './fiscal-documents.controller';
import { FiscalDocumentsService } from './fiscal-documents.service';

describe('FiscalDocumentsController certificate transport', () => {
  const certificates = {
    install: jest.fn().mockResolvedValue({ status: 'VALID' }),
  };
  const controller = new FiscalDocumentsController(
    {} as FiscalDocumentsService,
    certificates as unknown as FiscalCertificatesService,
  );
  const file = { originalname: 'test.pfx', buffer: Buffer.from('test') };

  beforeEach(() => certificates.install.mockClear());

  it('rejects an upload from the LAN over plain HTTP', () => {
    const request = {
      socket: { remoteAddress: '::ffff:127.0.0.1' },
      headers: { origin: 'http://192.168.0.25:3001' },
    } as Request;
    expect(() =>
      controller.installCertificate('issuer-1', file, 'password', request),
    ).toThrow(ForbiddenException);
    expect(certificates.install).not.toHaveBeenCalled();
  });

  it('accepts a localhost browser upload', async () => {
    const request = {
      socket: { remoteAddress: '::1' },
      headers: { origin: 'http://localhost:3001' },
    } as Request;
    await controller.installCertificate('issuer-1', file, 'password', request);
    expect(certificates.install).toHaveBeenCalledWith(
      'issuer-1',
      file,
      'password',
      undefined,
    );
  });
});
