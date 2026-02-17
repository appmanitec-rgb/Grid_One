import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { TechniciansModule } from './modules/technicians/technicians.module';
import { ClientsModule } from './modules/clients/clients.module';
import { GeneratorsModule } from './modules/generators/generators.module';
import { MaintenanceOrdersModule } from './modules/maintenance-orders/maintenance-orders.module';

@Module({
  imports: [DatabaseModule, UsersModule, AuthModule, TechniciansModule, ClientsModule, GeneratorsModule, MaintenanceOrdersModule],
  controllers: [],
  providers: [],
})
export class AppModule {}