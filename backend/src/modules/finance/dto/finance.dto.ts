import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  BankMovementOriginType,
  BankMovementType,
  BankAccountType,
  CostCenterEntryType,
  CostCenterType,
  PayableCategory,
  PaymentMethod,
} from '@prisma/client';
import { PartialType } from '@nestjs/mapped-types';

export class CreateAccountsReceivableDto {
  @IsUUID()
  clientId!: string;

  @IsUUID()
  @IsOptional()
  contractId?: string;

  @IsUUID()
  @IsOptional()
  maintenanceOrderId?: string;

  @IsUUID()
  @IsOptional()
  costCenterId?: string;

  @IsString()
  description!: string;

  @IsDateString()
  competenceDate!: string;

  @IsDateString()
  dueDate!: string;

  @IsNumber()
  @Min(0)
  grossAmount!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  discountAmount?: number;
}

export class PayAccountsReceivableDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @IsUUID()
  bankAccountId!: string;

  @IsDateString()
  @IsOptional()
  paidAt?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CancelAccountsReceivableDto {
  @IsString()
  reason!: string;
}

export class ReverseReceivablePaymentDto {
  @IsString()
  reason!: string;
}

export class ReversePayablePaymentDto {
  @IsString()
  reason!: string;
}

export class CreateAccountsPayableDto {
  @IsUUID()
  supplierId!: string;

  @IsUUID()
  @IsOptional()
  purchaseOrderId?: string;

  @IsUUID()
  @IsOptional()
  costCenterId?: string;

  @IsString()
  description!: string;

  @IsDateString()
  dueDate!: string;

  @IsDateString()
  @IsOptional()
  competenceDate?: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PayableCategory)
  @IsOptional()
  category?: PayableCategory;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsString()
  @IsOptional()
  pixCopyPaste?: string;

  @IsString()
  @IsOptional()
  proofUrl?: string;
}

export class PayAccountsPayableDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @IsUUID()
  bankAccountId!: string;

  @IsDateString()
  @IsOptional()
  paidAt?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CancelAccountsPayableDto {
  @IsString()
  reason!: string;
}

export class CreateBankAccountDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsEnum(BankAccountType)
  @IsOptional()
  type?: BankAccountType;

  @IsString()
  @IsOptional()
  agency?: string;

  @IsString()
  @IsOptional()
  accountNumber?: string;

  @IsString()
  @IsOptional()
  pixKey?: string;

  @IsNumber()
  @IsOptional()
  initialBalance?: number;
}

export class UpdateBankAccountDto extends PartialType(CreateBankAccountDto) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateCostCenterDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsEnum(CostCenterType)
  @IsOptional()
  type?: CostCenterType;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsUUID()
  @IsOptional()
  contractId?: string;

  @IsUUID()
  @IsOptional()
  generatorId?: string;
}

export class UpdateCostCenterDto extends PartialType(CreateCostCenterDto) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateCostCenterEntryDto {
  @IsUUID()
  costCenterId!: string;

  @IsEnum(CostCenterEntryType)
  entryType!: CostCenterEntryType;

  @IsString()
  sourceType!: string;

  @IsString()
  @IsOptional()
  sourceId?: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  competenceDate!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class SyncOrderReceivableDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  dueDate!: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class ReconcileBankMovementDto {
  @IsString()
  @IsOptional()
  reconciliationReference?: string;

  @IsString()
  @IsOptional()
  reconciliationNote?: string;
}

export class UnreconcileBankMovementDto {
  @IsString()
  reason!: string;
}

export class CloseFinancialPeriodDto {
  @IsInt()
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsString()
  reason!: string;
}

export class ReopenFinancialPeriodDto {
  @IsString()
  reason!: string;
}

export class BankMovementQueryDto {
  @IsUUID()
  @IsOptional()
  bankAccountId?: string;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsEnum(BankMovementType)
  @IsOptional()
  type?: BankMovementType;

  @IsEnum(BankMovementOriginType)
  @IsOptional()
  originType?: BankMovementOriginType;
}
