import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class StudioHeartbeatDto {
  @IsUUID()
  sessionId!: string;

  @IsString()
  @MaxLength(300)
  currentPath!: string;

  @IsString()
  @IsIn(['DASHBOARD', 'CLIENT_PORTAL'])
  source!: 'DASHBOARD' | 'CLIENT_PORTAL';

  @IsBoolean()
  @IsOptional()
  visible?: boolean;
}
