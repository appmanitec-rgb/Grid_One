import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import {
  MfaDisableDto,
  RefreshSessionDto,
  MfaVerifyChallengeDto,
  MfaVerifySetupDto,
} from './dto/mfa.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password, dto.mfaCode, {
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('mfa/verify')
  verifyMfa(@Body() dto: MfaVerifyChallengeDto) {
    return this.authService.verifyMfaChallenge(dto.challengeToken, dto.code, {
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
    });
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @Post('mfa/setup')
  setupMfa(@Req() req: Request) {
    const userId = (req['user'] as any)?.sub as string;
    return this.authService.setupMfa(userId);
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @Post('mfa/verify-setup')
  verifyMfaSetup(@Req() req: Request, @Body() dto: MfaVerifySetupDto) {
    const userId = (req['user'] as any)?.sub as string;
    return this.authService.verifyMfaSetup(userId, dto.code, {
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshSessionDto) {
    return this.authService.refreshSession(dto.refreshToken, {
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
    });
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  @Post('mfa/disable')
  disableMfa(@Req() req: Request, @Body() dto: MfaDisableDto) {
    const userId = (req['user'] as any)?.sub as string;
    return this.authService.disableMfa(userId, {
      code: dto.code,
      recoveryCode: dto.recoveryCode,
    });
  }
}
