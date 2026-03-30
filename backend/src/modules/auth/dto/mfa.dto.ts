import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MfaVerifySetupDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsOptional()
  deviceId?: string;

  @IsString()
  @IsOptional()
  deviceName?: string;
}

export class MfaVerifyChallengeDto {
  @IsString()
  @IsNotEmpty()
  challengeToken!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsOptional()
  deviceId?: string;

  @IsString()
  @IsOptional()
  deviceName?: string;
}

export class MfaDisableDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  recoveryCode?: string;
}

export class RefreshSessionDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsOptional()
  deviceName?: string;
}
