import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ATIVAR VALIDAÇÃO GLOBAL
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // Remove campos que não estão no DTO (Segurança)
    forbidNonWhitelisted: true, // Dá erro se enviarem dados lixo
    transform: true, // Converte tipos automaticamente
  }));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();