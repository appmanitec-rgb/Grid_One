import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Global() // <--- IMPORTANTE: Torna o banco acessível em todo o projeto sem precisar importar toda hora
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService], // Permite que outros módulos usem o banco
})
export class DatabaseModule {}
