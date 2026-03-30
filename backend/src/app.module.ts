import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { TechniciansModule } from './modules/technicians/technicians.module';
import { ClientsModule } from './modules/clients/clients.module';
import { GeneratorsModule } from './modules/generators/generators.module';
import { MaintenanceOrdersModule } from './modules/maintenance-orders/maintenance-orders.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { ProposalsModule } from './modules/proposals/proposals.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { CompanySettingsModule } from './modules/company-settings/company-settings.module';
import { TelemetryModule } from './modules/telemetry/telemetry.module';
import { SitesModule } from './modules/sites/sites.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HrAdminModule } from './modules/hr-admin/hr-admin.module';
import { CrmModule } from './modules/crm/crm.module';
import { HealthModule } from './modules/health/health.module';
import { AutomationModule } from './modules/automation/automation.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    DatabaseModule,
    UsersModule,
    AuthModule,
    TechniciansModule,
    ClientsModule,
    GeneratorsModule,
    MaintenanceOrdersModule,
    CatalogsModule,
    ProposalsModule,
    SuppliersModule,
    ContractsModule,
    CompanySettingsModule,
    TelemetryModule,
    SitesModule,
    InventoryModule,
    PurchaseOrdersModule,
    FinanceModule,
    HrAdminModule,
    CrmModule,
    HealthModule,
    AutomationModule,
    ApprovalsModule,
    AuditLogsModule,
    ReportsModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
