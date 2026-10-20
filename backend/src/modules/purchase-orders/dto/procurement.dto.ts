import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
export const PROCUREMENT_ORIGINS = [
  'STOCK',
  'ORDER',
  'CONTRACT',
  'PARTS_SALE',
  'GENERATOR_SALE',
  'WARRANTY',
  'INTERNAL',
  'OTHER',
] as const;
export class AllocationDto {
  @IsIn(PROCUREMENT_ORIGINS) origin!: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0.000001) quantity!: number;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() generatorId?: string;
  @IsOptional() @IsUUID() salesOrderId?: string;
  @IsOptional() @IsUUID() warrantyId?: string;
  @IsOptional() @IsUUID() costCenterId?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(150) serialNumber?: string;
}
export class RequestItemDto {
  @IsOptional() @IsUUID() catalogItemId?: string;
  @IsString() @MaxLength(500) description!: string;
  @IsOptional() @IsString() @MaxLength(3000) specification?: string;
  @IsOptional() @IsString() @MaxLength(200) originalReference?: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0.000001) quantity!: number;
  @IsString() @MaxLength(30) unit!: string;
  @IsOptional() @IsDateString() neededAt?: string;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations!: AllocationDto[];
}
export class ProcurementRequestDto {
  @IsUUID() requestKey!: string;
  @IsString() @MaxLength(120) department!: string;
  @IsIn(PROCUREMENT_ORIGINS) origin!: string;
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'EMERGENCY']) priority!: string;
  @IsString() @MaxLength(5000) justification!: string;
  @IsOptional() @IsDateString() neededAt?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RequestItemDto)
  items!: RequestItemDto[];
}
class SourceDto {
  @IsUUID() requestItemId!: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0.000001) quantity!: number;
}
class QuoteGroupDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SourceDto)
  sources!: SourceDto[];
}
export class ProcurementQuoteDto {
  @IsUUID() requestKey!: string;
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => QuoteGroupDto)
  groups!: QuoteGroupDto[];
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  supplierIds!: string[];
}
export class InvitationDto {
  @IsUUID() supplierId!: string;
  @IsIn(['INVITED', 'DECLINED', 'NO_RESPONSE', 'REMOVED']) status!: string;
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;
}
class OfferItemDto {
  @IsUUID() quoteItemId!: string;
  @IsOptional() @IsUUID() catalogItemId?: string;
  @IsString() @MaxLength(500) description!: string;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional() @IsString() @MaxLength(200) manufacturer?: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0.000001) quantity!: number;
  @IsString() @MaxLength(30) unit!: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) unitPrice!: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) discountPercent!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) taxAmount!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) otherExpenses!: number;
  @IsIn(['PENDING', 'APPROVED', 'REJECTED']) compatibility!: string;
  @IsOptional() @IsString() @MaxLength(3000) technicalReason?: string;
  @IsBoolean() available!: boolean;
}
export class ProcurementOfferDto {
  @IsUUID() supplierId!: string;
  @IsDateString() validUntil!: string;
  @IsString() @MaxLength(500) paymentTerm!: string;
  @IsInt() @Min(0) @Max(3650) deliveryDays!: number;
  @IsOptional() @IsDateString() expectedAt?: string;
  @IsOptional() @IsString() @MaxLength(500) warranty?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsString() @MaxLength(1000) negotiatedContract?: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) freightAmount!: number;
  @IsIn(['VALUE', 'QUANTITY']) freightAllocation!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => OfferItemDto)
  items!: OfferItemDto[];
}
export class SelectionDto {
  @IsUUID() quoteItemId!: string;
  @IsUUID() offerItemId!: string;
  @IsString() @MaxLength(5000) justification!: string;
  @IsIn(['WAREHOUSE', 'DIRECT', 'SERVICE', 'ASSET']) fulfillmentMode!: string;
  @IsOptional() @IsString() @MaxLength(5000) exceptionReason?: string;
}
export class ProcurementActionDto {
  @IsIn([
    'SUBMIT',
    'ANALYZE',
    'REVISE',
    'CANCEL',
    'OPEN',
    'NEW_ROUND',
    'GENERATE',
    'SEND',
    'CONFIRM',
    'CLOSE',
  ])
  action!: string;
  @IsOptional() @IsString() @MaxLength(5000) reason?: string;
  @IsOptional() @IsString() @MaxLength(100) method?: string;
  @IsOptional() @IsString() @MaxLength(3000) evidence?: string;
}
export class ApprovalRuleDto {
  @IsString() @MaxLength(200) name!: string;
  @IsBoolean() active!: boolean;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) minAmount!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) maxAmount?: number;
  @IsOptional() @IsString() @MaxLength(120) department?: string;
  @IsOptional() @IsIn(PROCUREMENT_ORIGINS) origin?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'EMERGENCY']) priority?: string;
  @IsOptional() @IsUUID() costCenterId?: string;
  @IsOptional() @IsIn(['PART', 'SERVICE', 'GENERATOR']) itemType?: string;
  @IsInt() @Min(1) @Max(100) minimumOffers!: number;
  @IsUUID() approverUserId!: string;
}
class ReceiptItemDto {
  @IsUUID() orderItemId!: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) acceptedQty!: number;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) rejectedQty!: number;
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  serialNumbers!: string[];
  @IsOptional() @IsString() @MaxLength(3000) divergence?: string;
}
export class ProcurementReceiptDto {
  @IsUUID() requestKey!: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @IsString() @MaxLength(300) fiscalReference?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiptItemDto)
  items!: ReceiptItemDto[];
}
class InvoiceLineDto {
  @IsUUID() orderItemId!: string;
  @IsNumber({ maxDecimalPlaces: 6 }) @Min(0.000001) quantity!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount!: number;
}
class InstallmentDto {
  @IsDateString() dueDate!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
}
export class ProcurementInvoiceDto {
  @IsString() @MaxLength(100) number!: string;
  @IsString() @MaxLength(30) series!: string;
  @IsOptional() @IsString() @MaxLength(100) accessKey?: string;
  @IsIn(['STANDARD', 'ADVANCE']) kind!: string;
  @IsDateString() issueDate!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsString() @MaxLength(3000) evidence!: string;
  @IsOptional() @IsString() @MaxLength(5000) justification?: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => InstallmentDto)
  schedule!: InstallmentDto[];
}
export class ProcurementSettingsDto {
  @IsBoolean() enabled!: boolean;
}
