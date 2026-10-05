import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { createSecureContext } from 'tls';
import forge from 'node-forge';
import { DatabaseService } from '../../database/database.service';

const MAX_CERTIFICATE_BYTES = 2 * 1024 * 1024;
const digits = (value?: string | null) => (value ?? '').replace(/\D/g, '');

type CertificateFile = { buffer?: Buffer; originalname?: string; size?: number };

@Injectable()
export class FiscalCertificatesService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async list() {
    const certificates = await this.prisma.fiscalCertificate.findMany({
      select: {
        issuerCompanyId: true,
        fingerprintSha256: true,
        serialNumber: true,
        subjectName: true,
        certificateCnpj: true,
        validFrom: true,
        validTo: true,
        installedAt: true,
        issuerCompany: { select: { cnpj: true } },
      },
    });
    return {
      storageConfigured: this.isStorageConfigured(),
      certificates: certificates.map((certificate) => this.status(
        certificate,
        digits(certificate.issuerCompany.cnpj) === certificate.certificateCnpj,
      )),
    };
  }

  async install(
    issuerCompanyId: string,
    file: CertificateFile | undefined,
    passphrase: string | undefined,
    actorUserId?: string,
  ) {
    const key = this.encryptionKey();
    if (!file?.buffer?.length || !file.originalname) {
      throw new BadRequestException('Selecione um arquivo A1 .pfx ou .p12.');
    }
    if (!/\.(pfx|p12)$/i.test(file.originalname)) {
      throw new BadRequestException('Envie um arquivo A1 .pfx ou .p12.');
    }
    if (file.buffer.length > MAX_CERTIFICATE_BYTES) {
      throw new BadRequestException('O certificado deve ter no maximo 2 MB.');
    }
    if (!passphrase) {
      throw new BadRequestException('Informe a senha do certificado A1.');
    }

    const company = await this.prisma.companySettings.findUnique({
      where: { id: issuerCompanyId },
      select: { cnpj: true },
    });
    if (!company) throw new NotFoundException('Empresa emitente nao encontrada.');
    const companyCnpj = digits(company.cnpj);
    if (companyCnpj.length !== 14) {
      throw new BadRequestException('Cadastre o CNPJ da empresa antes de instalar o A1.');
    }

    const certificate = this.inspect(file.buffer, passphrase, companyCnpj);
    const initializationVec = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, initializationVec);
    cipher.setAAD(Buffer.from(issuerCompanyId, 'utf8'));
    const payload = Buffer.from(JSON.stringify({
      pfx: file.buffer.toString('base64'),
      passphrase,
    }), 'utf8');
    const encryptedBundle = Buffer.concat([cipher.update(payload), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();
    payload.fill(0);

    await this.prisma.$transaction(async (tx) => {
      await tx.fiscalCertificate.upsert({
        where: { issuerCompanyId },
        create: {
          issuerCompanyId,
          encryptedBundle,
          initializationVec,
          authenticationTag,
          ...certificate,
          installedByUserId: actorUserId,
        },
        update: {
          encryptedBundle,
          initializationVec,
          authenticationTag,
          ...certificate,
          installedByUserId: actorUserId,
          installedAt: new Date(),
        },
      });
      await tx.financialAuditLog.create({
        data: {
          module: 'FISCAL',
          entityType: 'FISCAL_CERTIFICATE',
          entityId: issuerCompanyId,
          action: 'INSTALL_OR_REPLACE',
          actorUserId,
          payload: {
            issuerCompanyId,
            fingerprintSha256: certificate.fingerprintSha256,
            validTo: certificate.validTo.toISOString(),
          },
        },
      });
    });

    return this.status({
      issuerCompanyId,
      ...certificate,
      installedAt: new Date(),
    });
  }

  // Only server-side fiscal integrations may call this. No HTTP endpoint returns the bundle.
  async loadForSigning(issuerCompanyId: string) {
    const key = this.encryptionKey();
    const certificate = await this.prisma.fiscalCertificate.findUnique({
      where: { issuerCompanyId },
      include: { issuerCompany: { select: { cnpj: true } } },
    });
    if (!certificate || certificate.validTo <= new Date()) {
      throw new ServiceUnavailableException(
        'Certificado A1 ausente ou vencido para este CNPJ.',
      );
    }
    if (digits(certificate.issuerCompany.cnpj) !== certificate.certificateCnpj) {
      throw new ServiceUnavailableException(
        'O CNPJ da empresa mudou apos a instalacao do A1. Instale o certificado correto.',
      );
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm', key, certificate.initializationVec,
      );
      decipher.setAAD(Buffer.from(issuerCompanyId, 'utf8'));
      decipher.setAuthTag(certificate.authenticationTag);
      const plaintext = Buffer.concat([
        decipher.update(certificate.encryptedBundle),
        decipher.final(),
      ]);
      const material = JSON.parse(plaintext.toString('utf8')) as {
        pfx: string;
        passphrase: string;
      };
      plaintext.fill(0);
      return { pfx: Buffer.from(material.pfx, 'base64'), passphrase: material.passphrase };
    } catch {
      throw new ServiceUnavailableException(
        'Nao foi possivel abrir o A1 instalado. Verifique a chave do servidor.',
      );
    }
  }

  private inspect(buffer: Buffer, passphrase: string, expectedCnpj: string) {
    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
      createSecureContext({ pfx: buffer, passphrase });
      const asn1 = forge.asn1.fromDer(buffer.toString('binary'));
      p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
    } catch {
      throw new BadRequestException(
        'Nao foi possivel abrir o A1. Confira o arquivo e a senha.',
      );
    }

    const keyBags = [
      ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ] ?? []),
      ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[
        forge.pki.oids.keyBag
      ] ?? []),
    ];
    if (!keyBags.some((bag) => bag.key)) {
      throw new BadRequestException('O arquivo nao contem uma chave privada utilizavel.');
    }

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[
      forge.pki.oids.certBag
    ] ?? [];
    const certificate = certBags
      .map((bag) => bag.cert)
      .find((cert) => cert && this.certificateCnpj(cert) === expectedCnpj);
    if (!certificate) {
      throw new BadRequestException(
        'O CNPJ do certificado nao corresponde a esta empresa emitente.',
      );
    }
    const publicKey = certificate.publicKey;
    if (
      !('n' in publicKey) ||
      !keyBags.some((bag) =>
        bag.key?.n.equals(publicKey.n) && bag.key.e.equals(publicKey.e),
      )
    ) {
      throw new BadRequestException(
        'A chave privada nao corresponde ao certificado do CNPJ selecionado.',
      );
    }

    const validFrom = certificate.validity.notBefore;
    const validTo = certificate.validity.notAfter;
    const now = new Date();
    if (validFrom > now || validTo <= now) {
      throw new BadRequestException('O certificado ainda nao e valido ou ja venceu.');
    }

    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes();
    return {
      fingerprintSha256: createHash('sha256').update(Buffer.from(der, 'binary')).digest('hex'),
      serialNumber: certificate.serialNumber,
      subjectName: String(certificate.subject.getField('CN')?.value ?? ''),
      certificateCnpj: expectedCnpj,
      validFrom,
      validTo,
    };
  }

  private certificateCnpj(certificate: forge.pki.Certificate) {
    const subjectOid = '2.16.76.1.3.3';
    const subjectAltName = certificate.extensions.find((extension) =>
      extension.name === 'subjectAltName' || extension.id === '2.5.29.17',
    );
    if (typeof subjectAltName?.value === 'string') {
      try {
        const root = forge.asn1.fromDer(subjectAltName.value);
        const leafBytes = (node: forge.asn1.Asn1): string =>
          Array.isArray(node.value)
            ? node.value.map(leafBytes).join('')
            : node.value;
        const findCnpj = (node: forge.asn1.Asn1): string | null => {
          if (!Array.isArray(node.value)) return null;
          const children = node.value;
          for (let index = 0; index < children.length - 1; index++) {
            const candidate = children[index];
            if (
              candidate.tagClass === forge.asn1.Class.UNIVERSAL &&
              candidate.type === forge.asn1.Type.OID &&
              typeof candidate.value === 'string' &&
              forge.asn1.derToOid(candidate.value) === subjectOid
            ) {
              const value = digits(leafBytes(children[index + 1]));
              if (value.length === 14) return value;
            }
          }
          for (const child of children) {
            const found = findCnpj(child);
            if (found) return found;
          }
          return null;
        };
        const sanCnpj = findCnpj(root);
        if (sanCnpj) return sanCnpj;
      } catch {
        // Fall back to subject fields for certificates without this extension.
      }
    }
    const oidField = certificate.subject.attributes.find((field) => field.type === subjectOid);
    if (oidField && digits(String(oidField.value)).length === 14) {
      return digits(String(oidField.value));
    }
    const commonName = String(certificate.subject.getField('CN')?.value ?? '');
    return commonName.match(/:(\d{14})$/)?.[1] ?? null;
  }

  private status(certificate: {
    issuerCompanyId: string;
    fingerprintSha256: string;
    serialNumber: string;
    subjectName: string;
    certificateCnpj: string;
    validFrom: Date;
    validTo: Date;
    installedAt: Date;
  }, cnpjMatches = true) {
    const daysRemaining = Math.ceil(
      (certificate.validTo.getTime() - Date.now()) / 86_400_000,
    );
    return {
      ...certificate,
      daysRemaining,
      status: !cnpjMatches ? 'MISMATCH' : daysRemaining <= 0 ? 'EXPIRED' : daysRemaining <= 30 ? 'CRITICAL' :
        daysRemaining <= 90 ? 'EXPIRING' : 'VALID',
    };
  }

  private isStorageConfigured() {
    const raw = this.config.get<string>('FISCAL_CERTIFICATE_KEY_BASE64')?.trim();
    if (!raw) return false;
    const key = Buffer.from(raw, 'base64');
    return key.length === 32 && key.toString('base64') === raw;
  }

  private encryptionKey() {
    if (!this.isStorageConfigured()) {
      throw new ServiceUnavailableException(
        'Configure FISCAL_CERTIFICATE_KEY_BASE64 no servidor antes de instalar o A1.',
      );
    }
    return Buffer.from(
      this.config.get<string>('FISCAL_CERTIFICATE_KEY_BASE64')!.trim(),
      'base64',
    );
  }
}
