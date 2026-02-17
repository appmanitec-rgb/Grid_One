import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  // 1. Valida se o usuário existe e a senha bate
  async validateUser(email: string, pass: string): Promise<any> {
    // Busca o usuário no banco (precisamos criar um método que traga a senha para conferir)
    const user = await this.usersService.findByEmailForAuth(email); 
    
    if (user && await bcrypt.compare(pass, user.passwordHash)) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  // 2. Gera o Token (O Crachá)
  async login(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}