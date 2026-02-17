import { ConflictException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DatabaseService } from 'src/database/database.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly database: DatabaseService) {}

  async create(createUserDto: CreateUserDto) {
    const userExists = await this.database.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (userExists) {
      throw new ConflictException('Este email já está cadastrado no sistema.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(createUserDto.password, salt);

    const user = await this.database.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        passwordHash: passwordHash,
        role: createUserDto.role,
      },
    });

    const { passwordHash: _, ...result } = user;
    return result;
  }

  async findByEmailForAuth(email: string) {
    return this.database.user.findUnique({ where: { email } });
  }

  async findAll() {
    return this.database.user.findMany({
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
  }

  async findOne(id: string) {
    return this.database.user.findUnique({ where: { id } });
  }

  update(id: string, updateUserDto: UpdateUserDto) {
    return `Update user ${id}`;
  }

  remove(id: string) {
    return `Remove user ${id}`;
  }
}