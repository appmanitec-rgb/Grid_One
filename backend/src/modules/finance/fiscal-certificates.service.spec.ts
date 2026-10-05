import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import forge from 'node-forge';
import { DatabaseService } from '../../database/database.service';
import { FiscalCertificatesService } from './fiscal-certificates.service';

describe('FiscalCertificatesService', () => {
  const companyCnpj = '12345678000190';
  const password = 'senha-de-teste';
  let pfx: Buffer;
  let sanPfx: Buffer;

  beforeAll(() => {
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const certificate = forge.pki.createCertificate();
    certificate.publicKey = keys.publicKey;
    certificate.serialNumber = '01';
    certificate.validity.notBefore = new Date(Date.now() - 86_400_000);
    certificate.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
    certificate.setSubject([
      { name: 'commonName', value: `Empresa Teste:${companyCnpj}` },
    ]);
    certificate.setIssuer([
      { name: 'commonName', value: `Empresa Teste:${companyCnpj}` },
    ]);
    certificate.sign(keys.privateKey, forge.md.sha256.create());
    const asn1 = forge.pkcs12.toPkcs12Asn1(
      keys.privateKey,
      certificate,
      password,
      {
        algorithm: '3des',
      },
    );
    pfx = Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');

    const sanCertificate = forge.pki.createCertificate();
    sanCertificate.publicKey = keys.publicKey;
    sanCertificate.serialNumber = '02';
    sanCertificate.validity.notBefore = certificate.validity.notBefore;
    sanCertificate.validity.notAfter = certificate.validity.notAfter;
    sanCertificate.setSubject([{ name: 'commonName', value: 'Empresa Teste' }]);
    sanCertificate.setIssuer([{ name: 'commonName', value: 'Empresa Teste' }]);
    const oid = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.OID,
      false,
      forge.asn1.oidToDer('2.16.76.1.3.3').getBytes(),
    );
    const value = forge.asn1.create(
      forge.asn1.Class.CONTEXT_SPECIFIC,
      0,
      true,
      [
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.UTF8,
          false,
          companyCnpj,
        ),
      ],
    );
    const otherName = forge.asn1.create(
      forge.asn1.Class.CONTEXT_SPECIFIC,
      0,
      true,
      [oid, value],
    );
    const subjectAltName = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SEQUENCE,
      true,
      [otherName],
    );
    sanCertificate.setExtensions([
      {
        id: '2.5.29.17',
        value: forge.asn1.toDer(subjectAltName).getBytes(),
      },
    ]);
    sanCertificate.sign(keys.privateKey, forge.md.sha256.create());
    sanPfx = Buffer.from(
      forge.asn1
        .toDer(
          forge.pkcs12.toPkcs12Asn1(keys.privateKey, sanCertificate, password, {
            algorithm: '3des',
          }),
        )
        .getBytes(),
      'binary',
    );
  });

  function setup(cnpj = companyCnpj) {
    let stored: any;
    const tx = {
      fiscalCertificate: {
        upsert: jest.fn().mockImplementation(({ create }) => {
          stored = {
            ...create,
            installedAt: new Date(),
            issuerCompany: { cnpj },
          };
          return Promise.resolve(stored);
        }),
      },
      financialAuditLog: { create: jest.fn() },
    };
    const prisma = {
      companySettings: { findUnique: jest.fn().mockResolvedValue({ cnpj }) },
      fiscalCertificate: {
        findMany: jest
          .fn()
          .mockImplementation(() => Promise.resolve(stored ? [stored] : [])),
        findUnique: jest
          .fn()
          .mockImplementation(() => Promise.resolve(stored || null)),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };
    const key = randomBytes(32).toString('base64');
    const config = { get: jest.fn().mockReturnValue(key) };
    const service = new FiscalCertificatesService(
      prisma as unknown as DatabaseService,
      config as unknown as ConfigService,
    );
    return { service, tx, prisma, config };
  }

  it('installs a matching A1 encrypted and reads it only internally', async () => {
    const { service, tx } = setup();
    const result = await service.install(
      'issuer-1',
      { originalname: 'empresa.pfx', buffer: pfx },
      password,
      'admin-1',
    );
    expect(result.certificateCnpj).toBe(companyCnpj);
    expect(result.status).toBe('VALID');
    const saved = tx.fiscalCertificate.upsert.mock.calls[0][0].create as {
      encryptedBundle: Buffer;
    };
    expect(Buffer.isBuffer(saved.encryptedBundle)).toBe(true);
    expect(saved.encryptedBundle.includes(pfx)).toBe(false);
    expect(
      JSON.stringify(tx.financialAuditLog.create.mock.calls),
    ).not.toContain(password);
    const material = await service.loadForSigning('issuer-1');
    expect(material.pfx.equals(pfx)).toBe(true);
    expect(material.passphrase).toBe(password);
  });

  it('rejects a certificate from another CNPJ without storing it', async () => {
    const { service, tx } = setup('98765432000110');
    await expect(
      service.install(
        'issuer-1',
        { originalname: 'other.p12', buffer: pfx },
        password,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(tx.fiscalCertificate.upsert).not.toHaveBeenCalled();
  });

  it('reads the ICP-Brasil CNPJ from subjectAltName otherName', async () => {
    const { service } = setup();
    const result = await service.install(
      'issuer-1',
      { originalname: 'empresa.p12', buffer: sanPfx },
      password,
    );
    expect(result.certificateCnpj).toBe(companyCnpj);
  });

  it('stops signing if the issuer CNPJ changes after installation', async () => {
    const { service, prisma } = setup();
    await service.install(
      'issuer-1',
      { originalname: 'test.pfx', buffer: pfx },
      password,
    );
    const stored = await prisma.fiscalCertificate.findUnique();
    prisma.fiscalCertificate.findUnique.mockResolvedValue({
      ...stored,
      issuerCompany: { cnpj: '98765432000110' },
    });

    await expect(service.loadForSigning('issuer-1')).rejects.toThrow(
      'CNPJ da empresa mudou',
    );
  });

  it('rejects an incorrect password without storing the certificate', async () => {
    const { service, tx } = setup();
    await expect(
      service.install(
        'issuer-1',
        { originalname: 'test.pfx', buffer: pfx },
        'incorreta',
      ),
    ).rejects.toThrow('Confira o arquivo e a senha');
    expect(tx.fiscalCertificate.upsert).not.toHaveBeenCalled();
  });

  it('refuses upload when the server encryption key is absent', async () => {
    const { service, config, tx } = setup();
    config.get.mockReturnValue(undefined);
    await expect(
      service.install(
        'issuer-1',
        { originalname: 'test.pfx', buffer: pfx },
        password,
      ),
    ).rejects.toThrow('FISCAL_CERTIFICATE_KEY_BASE64');
    expect(tx.fiscalCertificate.upsert).not.toHaveBeenCalled();
  });
});
