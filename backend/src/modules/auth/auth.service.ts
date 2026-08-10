import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Prisma, User, UserRole } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { allAccessPolicy, effectiveAccessPolicy } from '../users/access-policy';
import { MfaService } from './mfa.service';

const ACCESS_TOKEN_TTL = '12h';
const MFA_SETUP_TOKEN_TTL = '30m';
const MFA_CHALLENGE_TTL = '5m';
const REFRESH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MFA_AUTH_ENABLED = process.env.MFA_AUTH_ENABLED === 'true';

type DeviceContext = {
  deviceId?: string;
  deviceName?: string;
};

type LoginContext = {
  id: string;
  email: string;
  name: string;
  role: string;
  isSystemMaster: boolean;
  accessPolicy: unknown;
  linkedClientId?: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly mfaService: MfaService,
  ) {}

  async login(
    email: string,
    pass: string,
    mfaCode?: string,
    device?: DeviceContext,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.database.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException('E-mail ou palavra-passe incorretos.');
    }

    const isPasswordValid = await bcrypt.compare(pass, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('E-mail ou palavra-passe incorretos.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Esta conta esta desativada.');
    }

    const accessPolicy = this.resolveAccessPolicy(user);

    if (MFA_AUTH_ENABLED) {
      const userPayload = this.buildUserPayload(user, accessPolicy);
      const isInternalUser = user.role !== UserRole.CLIENT;
      if (isInternalUser && !user.mfaEnabled) {
        const temporaryToken = await this.issueAccessToken({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isSystemMaster: user.isSystemMaster,
          accessPolicy,
          linkedClientId: user.linkedClientId,
          mfaSetupRequired: true,
        });

        return {
          status: 'mfa_setup_required',
          mfa_setup_required: true,
          access_token: temporaryToken,
          user: userPayload,
        };
      }

      if (user.mfaEnabled) {
        if (mfaCode?.trim()) {
          await this.mfaService.verifyUserMfa(user.id, mfaCode.trim());
          return this.issueLoginSuccess(
            {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              isSystemMaster: user.isSystemMaster,
              accessPolicy,
              linkedClientId: user.linkedClientId,
            },
            device,
          );
        }

        const challengeToken = await this.jwtService.signAsync(
          {
            sub: user.id,
            purpose: 'mfa_challenge',
            nonce: randomBytes(16).toString('hex'),
          },
          { expiresIn: MFA_CHALLENGE_TTL },
        );

        return {
          status: 'mfa_required',
          mfa_required: true,
          challengeToken,
          user: userPayload,
        };
      }
    }

    return this.issueLoginSuccess(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isSystemMaster: user.isSystemMaster,
        accessPolicy,
        linkedClientId: user.linkedClientId,
      },
      device,
    );
  }

  async verifyMfaChallenge(
    challengeToken: string,
    code: string,
    device?: DeviceContext,
  ) {
    let payload: { sub: string; purpose?: string };
    try {
      payload = await this.jwtService.verifyAsync(challengeToken);
    } catch {
      throw new UnauthorizedException('Challenge MFA invalido ou expirado.');
    }

    if (!payload?.sub || payload.purpose !== 'mfa_challenge') {
      throw new UnauthorizedException('Challenge MFA invalido.');
    }

    await this.mfaService.verifyUserMfa(payload.sub, code);

    const user = await this.database.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Usuario indisponivel para autenticacao.',
      );
    }

    const accessPolicy = this.resolveAccessPolicy(user);

    return this.issueLoginSuccess(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isSystemMaster: user.isSystemMaster,
        accessPolicy,
        linkedClientId: user.linkedClientId,
      },
      device,
    );
  }

  async setupMfa(userId: string) {
    return this.mfaService.createSetup(userId);
  }

  async verifyMfaSetup(userId: string, code: string, device?: DeviceContext) {
    const setupResult = await this.mfaService.verifySetup(userId, code);
    const user = await this.database.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Usuario indisponivel para autenticacao.',
      );
    }

    const accessPolicy = this.resolveAccessPolicy(user);

    const login = await this.issueLoginSuccess(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isSystemMaster: user.isSystemMaster,
        accessPolicy,
      },
      device,
    );

    return {
      ...login,
      recoveryCodes: setupResult.recoveryCodes,
    };
  }

  async refreshSession(refreshToken: string, device: DeviceContext) {
    const normalizedToken = refreshToken.trim();
    const deviceId = this.normalizeDeviceId(device.deviceId);
    if (!normalizedToken || !deviceId) {
      throw new UnauthorizedException(
        'Sessao persistente invalida. Faca login novamente.',
      );
    }

    const session = await this.database.authSession.findUnique({
      where: {
        refreshTokenHash: this.hashRefreshToken(normalizedToken),
      },
      include: {
        user: true,
      },
    });

    const now = new Date();
    if (
      !session ||
      session.deviceId !== deviceId ||
      session.revokedAt ||
      session.expiresAt.getTime() <= now.getTime()
    ) {
      throw new UnauthorizedException(
        'Sessao persistente invalida ou expirada. Faca login novamente.',
      );
    }

    if (!session.user?.isActive) {
      throw new UnauthorizedException(
        'Usuario indisponivel para autenticacao.',
      );
    }

    const accessPolicy = this.resolveAccessPolicy(session.user);
    const accessToken = await this.issueAccessToken({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      isSystemMaster: session.user.isSystemMaster,
      accessPolicy,
      linkedClientId: session.user.linkedClientId,
      mfaSetupRequired: false,
    });

    const nextRefreshToken = this.generateRefreshToken();
    await this.database.authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: this.hashRefreshToken(nextRefreshToken),
        deviceName:
          this.normalizeDeviceName(device.deviceName) ?? session.deviceName,
        lastUsedAt: now,
      },
    });

    return {
      access_token: accessToken,
      refresh_token: nextRefreshToken,
      refresh_token_expires_at: session.expiresAt.toISOString(),
      user: this.buildUserPayload(session.user, accessPolicy),
    };
  }

  async disableMfa(
    userId: string,
    input: { code?: string; recoveryCode?: string },
  ) {
    return this.mfaService.disable(userId, input);
  }

  private async issueLoginSuccess(
    params: LoginContext,
    device?: DeviceContext,
  ) {
    const token = await this.issueAccessToken({
      id: params.id,
      email: params.email,
      name: params.name,
      role: params.role,
      isSystemMaster: params.isSystemMaster,
      accessPolicy: params.accessPolicy,
      linkedClientId: params.linkedClientId,
      mfaSetupRequired: false,
    });
    const refreshSession = await this.createOrRotateRefreshSession(
      params.id,
      device,
    );

    return {
      access_token: token,
      ...(refreshSession
        ? {
            refresh_token: refreshSession.refreshToken,
            refresh_token_expires_at: refreshSession.expiresAt.toISOString(),
          }
        : {}),
      user: this.buildUserPayload(params, params.accessPolicy),
    };
  }

  private issueAccessToken(params: {
    id: string;
    email: string;
    name: string;
    role: string;
    isSystemMaster: boolean;
    accessPolicy: unknown;
    linkedClientId?: string | null;
    mfaSetupRequired: boolean;
  }) {
    const payload = {
      sub: params.id,
      email: params.email,
      name: params.name,
      role: params.role,
      isSystemMaster: params.isSystemMaster,
      accessPolicy: params.accessPolicy,
      linkedClientId: params.linkedClientId,
      mfaSetupRequired: params.mfaSetupRequired,
    };
    return this.jwtService.signAsync(payload, {
      expiresIn: params.mfaSetupRequired
        ? MFA_SETUP_TOKEN_TTL
        : ACCESS_TOKEN_TTL,
    });
  }

  private resolveAccessPolicy(
    user: Pick<User, 'role' | 'accessPolicy' | 'isSystemMaster'>,
  ) {
    return user.isSystemMaster
      ? allAccessPolicy
      : effectiveAccessPolicy(user.role, user.accessPolicy);
  }

  private buildUserPayload(
    user: {
      id: string;
      name: string;
      role: string;
      isSystemMaster: boolean;
      mfaEnabled?: boolean | null;
      linkedClientId?: string | null;
    },
    accessPolicy: unknown,
  ) {
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      isSystemMaster: user.isSystemMaster,
      accessPolicy,
      mfaEnabled: user.mfaEnabled,
      linkedClientId: user.linkedClientId,
    };
  }

  private async createOrRotateRefreshSession(
    userId: string,
    device?: DeviceContext,
  ) {
    const deviceId = this.normalizeDeviceId(device?.deviceId);
    if (!deviceId) {
      return null;
    }

    const refreshToken = this.generateRefreshToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + REFRESH_SESSION_TTL_MS);
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const deviceName = this.normalizeDeviceName(device?.deviceName);

    const existingSession = await this.database.authSession.findUnique({
      where: {
        userId_deviceId: {
          userId,
          deviceId,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingSession) {
      await this.database.authSession.update({
        where: {
          id: existingSession.id,
        },
        data: {
          refreshTokenHash,
          deviceName,
          expiresAt,
          lastUsedAt: now,
          revokedAt: null,
        },
      });
    } else {
      try {
        await this.database.authSession.create({
          data: {
            userId,
            deviceId,
            deviceName,
            refreshTokenHash,
            expiresAt,
            lastUsedAt: now,
          },
        });
      } catch (error) {
        if (!this.isAuthSessionUserDeviceConflict(error)) {
          throw error;
        }

        await this.database.authSession.update({
          where: {
            userId_deviceId: {
              userId,
              deviceId,
            },
          },
          data: {
            refreshTokenHash,
            deviceName,
            expiresAt,
            lastUsedAt: now,
            revokedAt: null,
          },
        });
      }
    }

    return {
      refreshToken,
      expiresAt,
    };
  }

  private generateRefreshToken() {
    return randomBytes(48).toString('hex');
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private isAuthSessionUserDeviceConflict(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    if (error.code !== 'P2002') {
      return false;
    }

    const target = error.meta?.target;
    return (
      Array.isArray(target) &&
      target.includes('userId') &&
      target.includes('deviceId')
    );
  }

  private normalizeDeviceId(deviceId?: string) {
    const normalized = deviceId?.trim();
    if (!normalized) {
      return undefined;
    }
    return normalized.slice(0, 191);
  }

  private normalizeDeviceName(deviceName?: string) {
    const normalized = deviceName?.trim();
    if (!normalized) {
      return null;
    }
    return normalized.slice(0, 255);
  }
}
