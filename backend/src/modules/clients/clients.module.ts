import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientPortalAdminService } from './client-portal-admin.service';
import { UsersModule } from '../users/users.module';
import { DatabaseModule } from '../../database/database.module';
import { ClientsController } from './clients.controller';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientPortalAdminService],
})
export class ClientsModule {}
