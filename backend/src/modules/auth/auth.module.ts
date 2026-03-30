import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../database/database.module';
import { AccessPolicyGuard } from './access-policy.guard';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';

@Global()
@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is required.');
        }

        if (
          configService.get<string>('NODE_ENV') === 'production' &&
          secret === 'change_me'
        ) {
          throw new Error(
            'JWT_SECRET must be changed from default value in production.',
          );
        }

        return {
          secret,
          signOptions: { expiresIn: '12h' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MfaService, AuthGuard, AccessPolicyGuard],
  exports: [JwtModule, AuthGuard, AccessPolicyGuard],
})
export class AuthModule {}
