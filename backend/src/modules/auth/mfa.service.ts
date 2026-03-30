import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import * as speakeasy from 'speakeasy';
import { DatabaseService } from '../../database/database.service';

type MfaUser = {
  id: string;
  email: string;
  role: string;
  mfaEnabled: boolean;
  mfaSecretEncrypted: string | null;
  mfaRecoveryCodesHash: Prisma.JsonValue | null;
};

@Injectable()
export class MfaService {
  private readonly issuer: string;
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly prisma: DatabaseService,
    configService: ConfigService,
  ) {
    this.issuer = configService.get<string>('MFA_ISSUER') || 'Manitec GridOne';

    const seed =
      configService.get<string>('MFA_ENCRYPTION_KEY') ||
      configService.get<string>('JWT_SECRET') ||
      'change_me';
    this.encryptionKey = createHash('sha256').update(seed).digest();
  }

  async createSetup(userId: string) {
    const user = await this.getMfaUser(userId);
    const secret = speakeasy.generateSecret({
      issuer: this.issuer,
      name: `${this.issuer}:${user.email}`,
      length: 20,
    });
    const base32 = secret.base32;
    const otpAuthUrl = secret.otpauth_url;
    if (!base32 || !otpAuthUrl) {
      throw new BadRequestException('Falha ao inicializar segredo MFA.');
    }
    const encrypted = this.encryptSecret(base32);
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecretEncrypted: encrypted,
        mfaRecoveryCodesHash: Prisma.JsonNull,
      },
    });

    return {
      issuer: this.issuer,
      otpAuthUrl,
      qrCodeDataUrl,
    };
  }

  async verifySetup(userId: string, code: string) {
    const user = await this.getMfaUser(userId);
    const secret = this.decryptSecret(user.mfaSecretEncrypted);

    const valid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: this.normalizeCode(code),
      window: 1,
    });
    if (!valid) {
      throw new UnauthorizedException('Codigo MFA invalido.');
    }

    const recoveryCodes = this.generateRecoveryCodes();
    const recoveryHashes = await Promise.all(
      recoveryCodes.map((value) => bcrypt.hash(value, 10)),
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaRecoveryCodesHash: recoveryHashes as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      enabled: true,
      recoveryCodes,
    };
  }

  async verifyUserMfa(userId: string, code: string) {
    const user = await this.getMfaUser(userId);
    if (!user.mfaEnabled) {
      throw new UnauthorizedException('MFA nao habilitado para este usuario.');
    }

    const secret = this.decryptSecret(user.mfaSecretEncrypted);
    const valid = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: this.normalizeCode(code),
      window: 1,
    });
    if (!valid) {
      throw new UnauthorizedException('Codigo MFA invalido.');
    }
    return true;
  }

  async disable(
    userId: string,
    input: {
      code?: string;
      recoveryCode?: string;
    },
  ) {
    const user = await this.getMfaUser(userId);
    if (!user.mfaEnabled) {
      return { disabled: true };
    }

    const hasCode = Boolean(input.code?.trim());
    const hasRecoveryCode = Boolean(input.recoveryCode?.trim());
    if (!hasCode && !hasRecoveryCode) {
      throw new BadRequestException(
        'Informe code (TOTP) ou recoveryCode para desativar MFA.',
      );
    }

    if (hasCode) {
      await this.verifyUserMfa(userId, input.code!.trim());
    } else if (hasRecoveryCode) {
      await this.consumeRecoveryCode(user, input.recoveryCode!.trim());
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        mfaRecoveryCodesHash: Prisma.JsonNull,
      },
    });

    return { disabled: true };
  }

  private async consumeRecoveryCode(user: MfaUser, recoveryCode: string) {
    const hashes = this.readRecoveryHashes(user.mfaRecoveryCodesHash);
    if (hashes.length === 0) {
      throw new UnauthorizedException('Nao existem codigos de recuperacao validos.');
    }

    let matchedIndex = -1;
    for (let i = 0; i < hashes.length; i += 1) {
      const ok = await bcrypt.compare(recoveryCode, hashes[i]);
      if (ok) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex === -1) {
      throw new UnauthorizedException('Recovery code invalido.');
    }

    const updated = hashes.filter((_, index) => index !== matchedIndex);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaRecoveryCodesHash: updated as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private readRecoveryHashes(value: Prisma.JsonValue | null): string[] {
    if (!value || !Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  }

  private generateRecoveryCodes() {
    const codes: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const chunk = randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${chunk.slice(0, 4)}-${chunk.slice(4, 8)}`);
    }
    return codes;
  }

  private async getMfaUser(userId: string): Promise<MfaUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        mfaEnabled: true,
        mfaSecretEncrypted: true,
        mfaRecoveryCodesHash: true,
      },
    });
    if (!user) throw new UnauthorizedException('Usuario nao encontrado.');
    return user;
  }

  private encryptSecret(secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  private decryptSecret(secretEncrypted: string | null) {
    if (!secretEncrypted) {
      throw new UnauthorizedException('Segredo MFA nao configurado.');
    }
    const [ivBase64, tagBase64, payloadBase64] = secretEncrypted.split('.');
    if (!ivBase64 || !tagBase64 || !payloadBase64) {
      throw new UnauthorizedException('Segredo MFA invalido.');
    }

    const iv = Buffer.from(ivBase64, 'base64');
    const tag = Buffer.from(tagBase64, 'base64');
    const encrypted = Buffer.from(payloadBase64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private normalizeCode(value: string) {
    return value.replace(/\s+/g, '').replace(/-/g, '');
  }
}
