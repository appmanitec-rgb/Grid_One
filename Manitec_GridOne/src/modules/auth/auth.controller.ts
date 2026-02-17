import { Body, Controller, Post, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async signIn(@Body() signInDto: Record<string, any>) {
    // 1. Verifica se a senha está certa
    const user = await this.authService.validateUser(signInDto.email, signInDto.password);
    
    if (!user) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    // 2. Entrega o token
    return this.authService.login(user);
  }
}