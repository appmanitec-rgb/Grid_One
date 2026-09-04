import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CatalogIdentifierType,
  CatalogOfferStatus,
  ItemType,
  Prisma,
  PurchaseTaxMode,
  UserRole,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { SetPreferredOfferDto } from './dto/catalog-preferred-offer.dto';
import { CreateCatalogDocumentDto } from './dto/create-catalog-document.dto';
import { CreateCatalogIdentifierDto } from './dto/create-catalog-identifier.dto';
import { CreateCatalogOfferDto } from './dto/create-catalog-offer.dto';
import { CreateCatalogDto } from './dto/create-catalog.dto';
import { UpdateCatalogPricingDto } from './dto/update-catalog-pricing.dto';
import { UpdateCatalogDto } from './dto/update-catalog.dto';

export type CatalogActor = {
  sub?: string;
  isSystemMaster?: boolean;
  role?: UserRole;
  accessPolicy?: {
    catalog?: {
      viewCosts?: boolean;
    };
  };
};

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: DatabaseService) {}

  async create(createCatalogDto: CreateCatalogDto) {
    this.assertNoDirectStockMutation(createCatalogDto);

    if (
      createCatalogDto.type === ItemType.PART &&
      !createCatalogDto.sku &&
      !this.hasSkuClassification(createCatalogDto)
    ) {
      throw new BadRequestException(
        'Pecas fisicas necessitam de area, familia e aplicacao para gerar o SKU.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const { catalogData } = this.prepareCatalogWriteData(createCatalogDto);
      const skuWrite = await this.prepareSkuForCreate(tx, createCatalogDto);
      Object.assign(catalogData, skuWrite.data);

      const created = await tx.catalogItem.create({ data: catalogData });
      await this.syncSkuIdentifiers(tx, created.id, null, created.sku);
      return created;
    });
  }

  async findAll(actor?: CatalogActor) {
    const canViewCosts = this.canViewCostData(actor);

    const items = await this.prisma.catalogItem.findMany({
      where: { isActive: true },
      include: {
        inventoryBalances: {
          include: {
            warehouse: {
              select: { id: true, code: true, name: true, type: true },
            },
          },
        },
        supplierItems: {
          include: {
            supplier: {
              select: { id: true, companyName: true },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          take: 3,
        },
      },
      orderBy: { name: 'asc' },
    });

    return items.map((item) => this.maskCatalogValues(item, canViewCosts));
  }

  async findOne(id: string, actor?: CatalogActor) {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id },
      include: this.operationalDetailInclude(),
    });
    if (!item) {
      throw new NotFoundException('Item do catalogo nao encontrado.');
    }

    return this.maskCatalogValues(
      this.withOperationalSummary(item),
      this.canViewCostData(actor),
    );
  }

  async skuTaxonomy() {
    const [areas, applications, previewNumber] = await Promise.all([
      this.prisma.catalogSkuArea.findMany({
        where: { isActive: true },
        include: {
          families: {
            where: { isActive: true },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.catalogSkuApplication.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.estimateNextSkuNumber(),
    ]);

    const rules = await this.prisma.catalogSkuRule.findMany({
      where: {
        isActive: true,
        area: { isActive: true },
        family: { isActive: true },
        application: { isActive: true },
      },
      include: {
        application: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { application: { name: 'asc' } }],
    });

    return {
      previewNumber,
      areas,
      applications,
      rules,
    };
  }

  async pricingPolicies() {
    return this.prisma.catalogPricingPolicy.findMany({
      where: { isActive: true },
      orderBy: [{ itemType: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async lookup(
    query?: string,
    type?: string,
    take?: string | number,
    actor?: CatalogActor,
  ) {
    const search = query?.trim();
    const limit = this.parseLookupLimit(take);
    const normalizedType = Object.values(ItemType).includes(type as ItemType)
      ? (type as ItemType)
      : undefined;
    const where: Prisma.CatalogItemWhereInput = {
      isActive: true,
      ...(normalizedType ? { type: normalizedType } : {}),
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                sku: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                description: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                commercialDescription: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                category: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                brand: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
              {
                skuArea: {
                  name: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                skuFamily: {
                  name: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                skuApplication: {
                  name: {
                    contains: search,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
              },
              {
                identifiers: {
                  some: {
                    isActive: true,
                    OR: [
                      {
                        code: {
                          contains: search,
                          mode: Prisma.QueryMode.insensitive,
                        },
                      },
                      {
                        normalizedCode: {
                          contains: this.normalizeIdentifier(search),
                          mode: Prisma.QueryMode.insensitive,
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const items = await this.prisma.catalogItem.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        commercialDescription: true,
        type: true,
        unit: true,
        basePrice: true,
        brand: true,
        category: true,
        costPrice: true,
        averageCost: true,
        lastCost: true,
        profitMargin: true,
        skuNumber: true,
        skuArea: { select: { id: true, code: true, name: true } },
        skuFamily: { select: { id: true, code: true, name: true } },
        skuApplication: { select: { id: true, code: true, name: true } },
        identifiers: {
          where: { isActive: true },
          select: { id: true, type: true, code: true, isPrimary: true },
          take: 5,
        },
      },
      orderBy: { name: 'asc' },
      take: limit,
    });

    return items.map((item) =>
      this.maskCatalogValues(item, this.canViewCostData(actor)),
    );
  }

  async update(
    id: string,
    updateCatalogDto: UpdateCatalogDto,
    actor?: CatalogActor,
  ) {
    this.assertNoDirectStockMutation(updateCatalogDto);
    const current = await this.prisma.catalogItem.findUnique({
      where: { id },
      select: {
        id: true,
        sku: true,
        skuNumber: true,
        skuAreaId: true,
        skuFamilyId: true,
        skuApplicationId: true,
      },
    });
    if (!current) {
      throw new NotFoundException('Item do catalogo nao encontrado.');
    }

    const { catalogData, inventoryTargets } =
      this.prepareCatalogWriteData(updateCatalogDto);

    await this.prisma.$transaction(async (tx) => {
      const skuWrite = await this.prepareSkuForUpdate(
        tx,
        current,
        updateCatalogDto,
      );
      Object.assign(catalogData, skuWrite.data);

      const updated = await tx.catalogItem.update({
        where: { id },
        data: catalogData,
      });
      if (updated.sku && updated.sku !== current.sku) {
        await this.syncSkuIdentifiers(tx, id, current.sku, updated.sku);
      }

      if (Object.keys(inventoryTargets).length > 0) {
        await tx.inventoryBalance.updateMany({
          where: { catalogItemId: id },
          data: inventoryTargets,
        });
      }
    });

    return this.findOne(id, actor);
  }

  async remove(id: string) {
    await this.ensureItemExists(id);
    return this.prisma.catalogItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async movements(id: string, actor?: CatalogActor) {
    await this.ensureItemExists(id);
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { catalogItemId: id },
      include: {
        warehouse: { select: { id: true, code: true, name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return this.maskOperationalCosts(movements, this.canViewCostData(actor));
  }

  async purchaseOrders(id: string, actor?: CatalogActor) {
    await this.ensureItemExists(id);
    const items = await this.prisma.purchaseOrderItem.findMany({
      where: { catalogItemId: id },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            code: true,
            status: true,
            issueDate: true,
            expectedDate: true,
            totalAmount: true,
            supplier: { select: { id: true, companyName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return this.maskOperationalCosts(items, this.canViewCostData(actor));
  }

  async orders(id: string, actor?: CatalogActor) {
    await this.ensureItemExists(id);
    const materials = await this.prisma.maintenanceOrderMaterial.findMany({
      where: { catalogItemId: id },
      include: {
        warehouse: { select: { id: true, code: true, name: true } },
        order: {
          select: {
            id: true,
            title: true,
            status: true,
            type: true,
            scheduledTo: true,
            openedAt: true,
            closedAt: true,
            generator: {
              select: {
                id: true,
                name: true,
                assetTag: true,
                serialNumber: true,
                client: { select: { id: true, companyName: true } },
              },
            },
            contract: { select: { id: true, code: true, title: true } },
            serviceReport: { select: { id: true, code: true, status: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return this.maskOperationalCosts(materials, this.canViewCostData(actor));
  }

  async suppliers(id: string, actor?: CatalogActor) {
    await this.ensureItemExists(id);
    const suppliers = await this.prisma.supplierCatalogItem.findMany({
      where: { catalogItemId: id },
      include: {
        supplier: {
          select: {
            id: true,
            companyName: true,
            tradeName: true,
            cnpj: true,
            paymentTerm: true,
            qualityScore: true,
            punctualityScore: true,
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      take: 30,
    });
    return this.maskOperationalCosts(suppliers, this.canViewCostData(actor));
  }

  async identifiers(id: string) {
    await this.ensureItemExists(id);
    return this.prisma.catalogItemIdentifier.findMany({
      where: { catalogItemId: id },
      include: {
        supplier: { select: { id: true, companyName: true, tradeName: true } },
        manufacturer: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { type: 'asc' }, { code: 'asc' }],
    });
  }

  async createIdentifier(id: string, dto: CreateCatalogIdentifierDto) {
    await this.ensureItemExists(id);
    const code = dto.code?.trim();
    if (!code) throw new BadRequestException('Informe o codigo do item.');
    const normalizedCode = this.normalizeIdentifier(code);
    if (!normalizedCode) {
      throw new BadRequestException('Informe um codigo valido.');
    }

    const possibleDuplicates =
      await this.prisma.catalogItemIdentifier.findMany({
        where: {
          normalizedCode,
          isActive: true,
          catalogItemId: { not: id },
        },
        include: {
          catalogItem: { select: { id: true, sku: true, name: true } },
          supplier: { select: { id: true, companyName: true } },
          manufacturer: { select: { id: true, name: true } },
        },
        take: 5,
      });

    const validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (validFrom && validUntil && validUntil < validFrom) {
      throw new BadRequestException(
        'A validade final nao pode ser anterior ao inicio.',
      );
    }

    if (dto.isPrimary) {
      await this.prisma.catalogItemIdentifier.updateMany({
        where: { catalogItemId: id, type: dto.type },
        data: { isPrimary: false },
      });
    }

    const identifier = await this.prisma.catalogItemIdentifier.create({
      data: {
        catalogItemId: id,
        type: dto.type,
        code,
        normalizedCode,
        source: dto.source?.trim() || null,
        manufacturerId: dto.manufacturerId || null,
        supplierId: dto.supplierId || null,
        description: dto.description?.trim() || null,
        isPrimary: dto.isPrimary ?? false,
        validFrom,
        validUntil,
        notes: dto.notes?.trim() || null,
      },
      include: {
        supplier: { select: { id: true, companyName: true, tradeName: true } },
        manufacturer: { select: { id: true, name: true, type: true } },
      },
    });

    return { identifier, possibleDuplicates };
  }

  async offers(id: string, actor?: CatalogActor) {
    await this.ensureItemExists(id);
    const offers = await this.prisma.catalogSupplierOffer.findMany({
      where: { catalogItemId: id },
      include: this.offerInclude(),
      orderBy: [
        { isPreferred: 'desc' },
        { status: 'asc' },
        { effectiveUnitCost: 'asc' },
        { createdAt: 'desc' },
      ],
      take: 60,
    });
    return this.maskOperationalCosts(
      this.withOfferRanking(offers),
      this.canViewCostData(actor),
    );
  }

  async documents(id: string) {
    await this.ensureItemExists(id);
    return this.prisma.catalogItemDocument.findMany({
      where: { catalogItemId: id },
      include: {
        offer: {
          select: {
            id: true,
            quoteNumber: true,
            version: true,
            supplier: { select: { id: true, companyName: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
  }

  async createDocument(
    id: string,
    dto: CreateCatalogDocumentDto,
    actor?: CatalogActor,
  ) {
    await this.ensureItemExists(id);
    const category = dto.category?.trim();
    const title = dto.title?.trim();
    if (!category || !title) {
      throw new BadRequestException('Informe categoria e titulo do documento.');
    }
    if (dto.offerId) {
      const offer = await this.prisma.catalogSupplierOffer.findFirst({
        where: { id: dto.offerId, catalogItemId: id },
        select: { id: true },
      });
      if (!offer) {
        throw new BadRequestException(
          'A oferta informada nao pertence a este item.',
        );
      }
    }

    return this.prisma.catalogItemDocument.create({
      data: {
        catalogItemId: id,
        offerId: dto.offerId || null,
        category,
        title,
        version: dto.version?.trim() || null,
        status: dto.status?.trim() || 'ACTIVE',
        fileName: dto.fileName?.trim() || null,
        mimeType: dto.mimeType?.trim() || null,
        sizeBytes: dto.sizeBytes,
        storageKey: dto.storageKey?.trim() || null,
        externalUrl: dto.externalUrl?.trim() || null,
        notes: dto.notes?.trim() || null,
        createdById: actor?.sub,
      },
      include: {
        offer: {
          select: {
            id: true,
            quoteNumber: true,
            version: true,
            supplier: { select: { id: true, companyName: true } },
          },
        },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async createOffer(
    id: string,
    dto: CreateCatalogOfferDto,
    actor?: CatalogActor,
  ) {
    if (!this.canViewCostData(actor)) {
      throw new BadRequestException(
        'Seu perfil nao possui permissao para registrar cotacoes.',
      );
    }

    const item = await this.prisma.catalogItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item do catalogo nao encontrado.');

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
      select: { id: true, companyName: true, paymentTerm: true },
    });
    if (!supplier) throw new NotFoundException('Fornecedor nao encontrado.');

    const effective = this.calculateEffectiveOfferCost(dto);
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    const quotedAt = dto.quotedAt ? new Date(dto.quotedAt) : new Date();
    if (validFrom && validUntil && validUntil < validFrom) {
      throw new BadRequestException(
        'A validade final nao pode ser anterior ao inicio da validade.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const supplierItem = await tx.supplierCatalogItem.upsert({
        where: {
          supplierId_catalogItemId: {
            supplierId: supplier.id,
            catalogItemId: id,
          },
        },
        update: {
          supplierSku: dto.supplierSku?.trim() || null,
          supplierPrice: effective.effectiveUnitCost,
          leadTimeDays: dto.leadTimeDays,
          purchasePaymentTerm: dto.paymentTerm?.trim() || supplier.paymentTerm,
          purchaseTaxMode: dto.purchaseTaxMode || PurchaseTaxMode.AMOUNT,
          purchaseTaxPercent: effective.purchaseTaxPercent,
          purchaseTaxAmount: effective.purchaseTaxAmount,
          freightAmount: effective.freightAmount,
          otherPurchaseCosts:
            effective.insuranceAmount + effective.additionalCostsAmount,
          priceValidFrom: validFrom,
          priceValidUntil: validUntil,
          lastQuotedAt: quotedAt,
          priceNotes: dto.notes?.trim() || null,
        },
        create: {
          supplierId: supplier.id,
          catalogItemId: id,
          supplierSku: dto.supplierSku?.trim() || null,
          supplierPrice: effective.effectiveUnitCost,
          leadTimeDays: dto.leadTimeDays,
          isPrimary: false,
          purchasePaymentTerm: dto.paymentTerm?.trim() || supplier.paymentTerm,
          purchaseTaxMode: dto.purchaseTaxMode || PurchaseTaxMode.AMOUNT,
          purchaseTaxPercent: effective.purchaseTaxPercent,
          purchaseTaxAmount: effective.purchaseTaxAmount,
          freightAmount: effective.freightAmount,
          otherPurchaseCosts:
            effective.insuranceAmount + effective.additionalCostsAmount,
          priceValidFrom: validFrom,
          priceValidUntil: validUntil,
          lastQuotedAt: quotedAt,
          priceNotes: dto.notes?.trim() || null,
        },
      });

      const previousCount = await tx.catalogSupplierOffer.count({
        where: { catalogItemId: id, supplierId: supplier.id },
      });

      const offer = await tx.catalogSupplierOffer.create({
        data: {
          catalogItemId: id,
          supplierId: supplier.id,
          supplierItemId: supplierItem.id,
          manufacturerId: dto.manufacturerId || null,
          version: previousCount + 1,
          status: dto.status || CatalogOfferStatus.ACTIVE,
          supplierSku: dto.supplierSku?.trim() || null,
          offeredPartNumber: dto.offeredPartNumber?.trim() || null,
          offeredDescription: dto.offeredDescription?.trim() || null,
          quoteNumber: dto.quoteNumber?.trim() || null,
          contactName: dto.contactName?.trim() || null,
          unitPrice: effective.unitPrice,
          currency: dto.currency?.trim() || 'BRL',
          priceQuantity: effective.priceQuantity,
          minPurchaseQty: dto.minPurchaseQty,
          purchaseMultiple: dto.purchaseMultiple,
          purchaseUnit: dto.purchaseUnit?.trim() || item.unit || null,
          conversionFactor: effective.conversionFactor,
          availability: dto.availability?.trim() || null,
          leadTimeDays: dto.leadTimeDays,
          paymentTerm: dto.paymentTerm?.trim() || supplier.paymentTerm,
          freightAmount: effective.freightAmount,
          insuranceAmount: effective.insuranceAmount,
          discountAmount: effective.discountAmount,
          additionalCostsAmount: effective.additionalCostsAmount,
          purchaseTaxMode: dto.purchaseTaxMode || PurchaseTaxMode.AMOUNT,
          purchaseTaxPercent: effective.purchaseTaxPercent,
          purchaseTaxAmount: effective.purchaseTaxAmount,
          recoverableCreditAmount: effective.recoverableCreditAmount,
          effectiveUnitCost: effective.effectiveUnitCost,
          effectiveTotalCost: effective.effectiveTotalCost,
          validFrom,
          validUntil,
          quotedAt,
          isPreferred: false,
          notes: dto.notes?.trim() || null,
          createdById: actor?.sub,
        },
      });

      if (dto.replacesOfferId) {
        await tx.catalogSupplierOffer.updateMany({
          where: { id: dto.replacesOfferId, catalogItemId: id },
          data: {
            status: CatalogOfferStatus.SUPERSEDED,
            supersededByOfferId: offer.id,
          },
        });
      }

      return offer;
    });

    if (dto.isPreferred) {
      await this.setPreferredOffer(id, result.id, {
        reason:
          dto.preferenceReason ||
          'Oferta preferencial definida no cadastro da cotacao.',
        applyToReplacementCost: true,
      }, actor);
    }

    const offer = await this.prisma.catalogSupplierOffer.findUnique({
      where: { id: result.id },
      include: this.offerInclude(),
    });

    return this.maskOperationalCosts(offer, this.canViewCostData(actor));
  }

  async setPreferredOffer(
    id: string,
    offerId: string,
    dto: SetPreferredOfferDto,
    actor?: CatalogActor,
  ) {
    if (!this.canViewCostData(actor)) {
      throw new BadRequestException(
        'Seu perfil nao possui permissao para escolher oferta preferencial.',
      );
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException(
        'Informe o motivo para escolher a oferta preferencial.',
      );
    }

    const offer = await this.prisma.catalogSupplierOffer.findFirst({
      where: { id: offerId, catalogItemId: id },
      include: { supplier: true },
    });
    if (!offer) throw new NotFoundException('Oferta nao encontrada.');
    if (offer.status !== CatalogOfferStatus.ACTIVE) {
      throw new BadRequestException(
        'Apenas ofertas ativas podem ser preferenciais.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.catalogSupplierOffer.updateMany({
        where: { catalogItemId: id, id: { not: offer.id } },
        data: { isPreferred: false },
      });
      await tx.catalogSupplierOffer.update({
        where: { id: offer.id },
        data: {
          isPreferred: true,
          preferenceReason: dto.reason.trim(),
        },
      });
      await tx.supplierCatalogItem.updateMany({
        where: { catalogItemId: id, supplierId: { not: offer.supplierId } },
        data: { isPrimary: false },
      });
      await tx.supplierCatalogItem.update({
        where: {
          supplierId_catalogItemId: {
            supplierId: offer.supplierId,
            catalogItemId: id,
          },
        },
        data: { isPrimary: true },
      });

      if (dto.applyToReplacementCost) {
        const item = await tx.catalogItem.findUnique({ where: { id } });
        await tx.catalogItem.update({
          where: { id },
          data: {
            supplier: offer.supplier.companyName,
            costPrice: offer.effectiveUnitCost,
            lastCost: offer.effectiveUnitCost,
            basePrice: dto.finalSalePrice ?? item?.basePrice ?? 0,
            taxProfile: {
              ...(item?.taxProfile && typeof item.taxProfile === 'object'
                ? (item.taxProfile as Record<string, unknown>)
                : {}),
              replacementCost: offer.effectiveUnitCost,
              preferredOfferId: offer.id,
              preferredSupplierId: offer.supplierId,
              preferredSupplierName: offer.supplier.companyName,
              pricingNeedsReview: true,
              pricingNeedsReviewReason:
                'Oferta preferencial alterada; revisar preco de venda.',
            } as any,
          },
        });
      }
    });

    return this.findOne(id, actor);
  }

  async updatePricing(
    id: string,
    dto: UpdateCatalogPricingDto,
    actor?: CatalogActor,
  ) {
    if (!this.canViewCostData(actor)) {
      throw new BadRequestException(
        'Seu perfil nao possui permissao para atualizar precificacao.',
      );
    }

    const item = await this.prisma.catalogItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Item do catalogo nao encontrado.');
    }

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
      select: { id: true, companyName: true },
    });
    if (!supplier) throw new NotFoundException('Fornecedor nao encontrado.');

    const purchaseInvoiceValue = this.nonNegative(dto.purchaseInvoiceValue, 'valor de compra');
    const purchaseTaxMode = dto.purchaseTaxMode === 'PERCENT' ? 'PERCENT' : 'AMOUNT';
    const purchaseTaxPercent = this.nonNegative(dto.purchaseTaxPercent, 'percentual de imposto de compra');
    const purchaseTaxAmount =
      purchaseTaxMode === 'PERCENT'
        ? Number((purchaseInvoiceValue * (purchaseTaxPercent / 100)).toFixed(2))
        : this.nonNegative(dto.purchaseTaxAmount, 'imposto de compra');
    const freightAmount = this.nonNegative(dto.freightAmount, 'frete');
    const otherPurchaseCosts = this.nonNegative(dto.otherPurchaseCosts, 'outros custos');
    const salesTaxPercent = this.nonNegative(dto.salesTaxPercent, 'impostos de venda');
    const commissionPercent = this.nonNegative(dto.commissionPercent, 'comissao');
    const profitMarginPercent = this.nonNegative(dto.profitMarginPercent, 'margem');
    const operationalCostPercent = this.nonNegative(dto.operationalCostPercent, 'custos operacionais');
    const calculatedPurchaseCost =
      purchaseInvoiceValue + purchaseTaxAmount + freightAmount + otherPurchaseCosts;
    const markupPercent =
      salesTaxPercent + commissionPercent + profitMarginPercent + operationalCostPercent;
    const finalSalePrice =
      dto.finalSalePrice != null
        ? this.nonNegative(dto.finalSalePrice, 'preco final')
        : Number((calculatedPurchaseCost * (1 + markupPercent / 100)).toFixed(2));
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : null;
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;

    if (validFrom && validUntil && validUntil < validFrom) {
      throw new BadRequestException(
        'A validade final nao pode ser anterior ao inicio da validade.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.setAsPrimary !== false) {
        await tx.supplierCatalogItem.updateMany({
          where: { catalogItemId: id, supplierId: { not: supplier.id } },
          data: { isPrimary: false },
        });
      }

      await tx.supplierCatalogItem.upsert({
        where: {
          supplierId_catalogItemId: {
            supplierId: supplier.id,
            catalogItemId: id,
          },
        },
        update: {
          supplierSku: dto.supplierSku?.trim() || null,
          supplierPrice: calculatedPurchaseCost,
          leadTimeDays: dto.leadTimeDays,
          isPrimary: dto.setAsPrimary !== false,
          purchasePaymentTerm: dto.purchasePaymentTerm?.trim() || null,
          purchaseTaxMode,
          purchaseTaxPercent,
          purchaseTaxAmount,
          freightAmount,
          otherPurchaseCosts,
          priceValidFrom: validFrom,
          priceValidUntil: validUntil,
          lastQuotedAt: new Date(),
          priceNotes: dto.notes?.trim() || null,
        },
        create: {
          supplierId: supplier.id,
          catalogItemId: id,
          supplierSku: dto.supplierSku?.trim() || null,
          supplierPrice: calculatedPurchaseCost,
          leadTimeDays: dto.leadTimeDays,
          isPrimary: dto.setAsPrimary !== false,
          purchasePaymentTerm: dto.purchasePaymentTerm?.trim() || null,
          purchaseTaxMode,
          purchaseTaxPercent,
          purchaseTaxAmount,
          freightAmount,
          otherPurchaseCosts,
          priceValidFrom: validFrom,
          priceValidUntil: validUntil,
          lastQuotedAt: new Date(),
          priceNotes: dto.notes?.trim() || null,
        },
      });

      await tx.catalogItem.update({
        where: { id },
        data: {
          supplier: supplier.companyName,
          costPrice: calculatedPurchaseCost,
          lastCost: calculatedPurchaseCost,
          basePrice: finalSalePrice,
          taxPercentage: salesTaxPercent,
          profitMargin: profitMarginPercent,
          taxProfile: {
            ...(item.taxProfile && typeof item.taxProfile === 'object'
              ? (item.taxProfile as Record<string, unknown>)
              : {}),
            salesTaxPercent,
            commissionPercent,
            operationalCostPercent,
            pricingSupplierId: supplier.id,
            pricingSupplierName: supplier.companyName,
            priceValidFrom: validFrom?.toISOString(),
            priceValidUntil: validUntil?.toISOString(),
          } as any,
        },
      });

      await tx.catalogPriceRevision.create({
        data: {
          catalogItemId: id,
          supplierId: supplier.id,
          previousCostPrice: item.costPrice,
          previousBasePrice: item.basePrice,
          purchaseInvoiceValue,
          purchaseTaxMode,
          purchaseTaxPercent,
          purchaseTaxAmount,
          freightAmount,
          otherPurchaseCosts,
          calculatedPurchaseCost,
          salesTaxPercent,
          commissionPercent,
          profitMarginPercent,
          operationalCostPercent,
          finalSalePrice,
          validFrom,
          validUntil,
          notes: dto.notes?.trim() || null,
          createdById: actor?.sub,
        },
      });
    });

    return this.findOne(id, actor);
  }

  private async ensureItemExists(id: string) {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException('Item do catalogo nao encontrado.');
    }
  }

  private canViewCostData(actor?: CatalogActor) {
    if (!actor) return false;
    if (actor.isSystemMaster || actor.role === UserRole.ADMIN) return true;
    return actor?.accessPolicy?.catalog?.viewCosts === true;
  }

  private hasSkuClassification(
    dto: Pick<
      CreateCatalogDto,
      'skuAreaId' | 'skuFamilyId' | 'skuApplicationId'
    >,
  ) {
    return Boolean(dto.skuAreaId && dto.skuFamilyId && dto.skuApplicationId);
  }

  private hasAnySkuClassification(
    dto: Pick<
      CreateCatalogDto,
      'skuAreaId' | 'skuFamilyId' | 'skuApplicationId'
    >,
  ) {
    return Boolean(dto.skuAreaId || dto.skuFamilyId || dto.skuApplicationId);
  }

  private async estimateNextSkuNumber() {
    const rows = await this.prisma.$queryRaw<Array<{ nextNumber: number }>>`
      SELECT GREATEST(
        123456789,
        COALESCE(MAX("skuNumber") + 1, 123456789)
      )::integer AS "nextNumber"
      FROM "catalog_items"
    `;
    return rows[0]?.nextNumber ?? 123456789;
  }

  private async prepareSkuForCreate(
    tx: Prisma.TransactionClient,
    dto: CreateCatalogDto,
  ) {
    if (this.hasSkuClassification(dto)) {
      const classification = await this.validateSkuClassification(tx, {
        areaId: dto.skuAreaId!,
        familyId: dto.skuFamilyId!,
        applicationId: dto.skuApplicationId!,
      });
      const generated = await this.nextGeneratedSku(
        tx,
        this.skuSuffix(classification),
      );
      return {
        data: {
          sku: generated.sku,
          skuNumber: generated.skuNumber,
          skuAreaId: dto.skuAreaId,
          skuFamilyId: dto.skuFamilyId,
          skuApplicationId: dto.skuApplicationId,
          category: dto.category || classification.area.name,
          subcategory: dto.subcategory || classification.family.name,
        },
      };
    }

    if (!dto.sku) return { data: {} };
    await this.assertSkuAvailable(tx, dto.sku);
    return { data: { sku: dto.sku.trim().toUpperCase() } };
  }

  private async prepareSkuForUpdate(
    tx: Prisma.TransactionClient,
    current: {
      id: string;
      sku: string | null;
      skuNumber: number | null;
      skuAreaId: string | null;
      skuFamilyId: string | null;
      skuApplicationId: string | null;
    },
    dto: UpdateCatalogDto,
  ) {
    if (this.hasAnySkuClassification(dto)) {
      if (!this.hasSkuClassification(dto)) {
        throw new BadRequestException(
          'Informe area, familia e aplicacao para recalcular o SKU.',
        );
      }
      const classification = await this.validateSkuClassification(tx, {
        areaId: dto.skuAreaId!,
        familyId: dto.skuFamilyId!,
        applicationId: dto.skuApplicationId!,
      });
      const skuNumber =
        current.skuNumber ??
        (await this.nextGeneratedSku(tx, this.skuSuffix(classification)))
          .skuNumber;
      const sku = this.composeSku(skuNumber, this.skuSuffix(classification));
      const existing = await tx.catalogItem.findUnique({ where: { sku } });
      if (existing && existing.id !== current.id) {
        throw new ConflictException(`O SKU ${sku} ja pertence a outro item.`);
      }
      return {
        data: {
          sku,
          skuNumber,
          skuAreaId: dto.skuAreaId,
          skuFamilyId: dto.skuFamilyId,
          skuApplicationId: dto.skuApplicationId,
          category: dto.category || classification.area.name,
          subcategory: dto.subcategory || classification.family.name,
        },
      };
    }

    if (dto.sku && dto.sku !== current.sku) {
      await this.assertSkuAvailable(tx, dto.sku, current.id);
      return { data: { sku: dto.sku.trim().toUpperCase() } };
    }

    return { data: {} };
  }

  private async validateSkuClassification(
    tx: Prisma.TransactionClient,
    input: { areaId: string; familyId: string; applicationId: string },
  ) {
    const rule = await tx.catalogSkuRule.findFirst({
      where: {
        areaId: input.areaId,
        familyId: input.familyId,
        applicationId: input.applicationId,
        isActive: true,
        area: { isActive: true },
        family: { isActive: true, areaId: input.areaId },
        application: { isActive: true },
      },
      include: { area: true, family: true, application: true },
    });

    if (!rule) {
      throw new BadRequestException(
        'Combinacao invalida de area, familia e aplicacao para o SKU.',
      );
    }
    return rule;
  }

  private skuSuffix(rule: {
    area: { code: string };
    family: { code: string };
    application: { code: string };
  }) {
    return `${rule.area.code}${rule.family.code}${rule.application.code}`;
  }

  private composeSku(number: number, suffix: string) {
    return `${String(number).padStart(9, '0')}${suffix}`;
  }

  private async nextGeneratedSku(
    tx: Prisma.TransactionClient,
    suffix: string,
  ) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const rows = await tx.$queryRaw<Array<{ nextval: number }>>`
        SELECT nextval('catalog_sku_number_seq')::integer AS "nextval"
      `;
      const skuNumber = Number(rows[0]?.nextval);
      if (!Number.isFinite(skuNumber)) {
        throw new BadRequestException('Nao foi possivel gerar o numero do SKU.');
      }
      const sku = this.composeSku(skuNumber, suffix);
      const existing = await tx.catalogItem.findUnique({ where: { sku } });
      if (!existing) return { skuNumber, sku };
    }
    throw new ConflictException(
      'Nao foi possivel gerar um SKU unico. Tente novamente.',
    );
  }

  private async assertSkuAvailable(
    tx: Prisma.TransactionClient,
    sku: string,
    currentItemId?: string,
  ) {
    const normalizedSku = sku.trim().toUpperCase();
    const existing = await tx.catalogItem.findUnique({
      where: { sku: normalizedSku },
      select: { id: true },
    });
    if (existing && existing.id !== currentItemId) {
      throw new ConflictException(`O SKU ${normalizedSku} ja esta registrado.`);
    }
  }

  private async syncSkuIdentifiers(
    tx: Prisma.TransactionClient,
    catalogItemId: string,
    previousSku?: string | null,
    currentSku?: string | null,
  ) {
    if (previousSku && previousSku !== currentSku) {
      const existingPrevious = await tx.catalogItemIdentifier.findFirst({
        where: {
          catalogItemId,
          code: previousSku,
          type: CatalogIdentifierType.PREVIOUS_CODE,
        },
      });
      if (!existingPrevious) {
        await tx.catalogItemIdentifier.create({
          data: {
            catalogItemId,
            type: CatalogIdentifierType.PREVIOUS_CODE,
            code: previousSku,
            normalizedCode: this.normalizeIdentifier(previousSku),
            source: 'sku_anterior',
            isPrimary: false,
            isActive: true,
            notes: 'Codigo preservado automaticamente apos reclassificacao do SKU.',
          },
        });
      }
    }

    if (!currentSku) return;
    await tx.catalogItemIdentifier.updateMany({
      where: { catalogItemId, type: CatalogIdentifierType.INTERNAL_SKU },
      data: { isPrimary: false },
    });
    const existingCurrent = await tx.catalogItemIdentifier.findFirst({
      where: {
        catalogItemId,
        code: currentSku,
        type: CatalogIdentifierType.INTERNAL_SKU,
      },
    });
    if (existingCurrent) {
      await tx.catalogItemIdentifier.update({
        where: { id: existingCurrent.id },
        data: {
          normalizedCode: this.normalizeIdentifier(currentSku),
          isPrimary: true,
          isActive: true,
        },
      });
      return;
    }
    await tx.catalogItemIdentifier.create({
      data: {
        catalogItemId,
        type: CatalogIdentifierType.INTERNAL_SKU,
        code: currentSku,
        normalizedCode: this.normalizeIdentifier(currentSku),
        source: 'sku_gerado',
        isPrimary: true,
        isActive: true,
      },
    });
  }

  private maskCatalogValues(item: any, canViewCosts: boolean) {
    if (canViewCosts) return item;
    return this.maskOperationalCosts(item, false);
  }

  private maskOperationalCosts<T>(item: T, canViewCosts: boolean): T {
    if (canViewCosts || item == null) return item;
    if (Array.isArray(item)) {
      return item.map((entry) =>
        this.maskOperationalCosts(entry, canViewCosts),
      ) as T;
    }
    if (typeof item !== 'object') return item;

    const current = item as Record<string, any>;
    const masked: Record<string, any> = { ...current };
    for (const key of [
      'costPrice',
      'averageCost',
      'lastCost',
      'taxPercentage',
      'profitMargin',
      'supplierPrice',
      'purchaseTaxPercent',
      'purchaseTaxAmount',
      'freightAmount',
      'otherPurchaseCosts',
      'insuranceAmount',
      'discountAmount',
      'additionalCostsAmount',
      'recoverableCreditAmount',
      'purchaseInvoiceValue',
      'calculatedPurchaseCost',
      'effectiveUnitCost',
      'effectiveTotalCost',
      'commissionPercent',
      'operationalCostPercent',
      'finalSalePrice',
      'unitPrice',
      'unitCost',
      'totalPrice',
      'totalAmount',
      'avgCost',
      'stockValue',
    ]) {
      if (Object.prototype.hasOwnProperty.call(masked, key)) {
        masked[key] = null;
      }
    }

    for (const [key, value] of Object.entries(masked)) {
      if (Array.isArray(value)) {
        masked[key] = value.map((entry) =>
          this.maskOperationalCosts(entry, canViewCosts),
        );
      } else if (
        value &&
        typeof value === 'object' &&
        value instanceof Date === false
      ) {
        masked[key] = this.maskOperationalCosts(value, canViewCosts);
      }
    }

    return masked as T;
  }

  private parseLookupLimit(value?: string | number) {
    const parsed = Number(value ?? 10);
    if (!Number.isFinite(parsed)) return 10;
    return Math.min(Math.max(Math.trunc(parsed), 1), 20);
  }

  private nonNegative(value: number | undefined, label: string) {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(`Valor invalido para ${label}.`);
    }
    return parsed;
  }

  private positive(value: number | undefined, label: string, fallback = 1) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`Valor invalido para ${label}.`);
    }
    return parsed;
  }

  private normalizeIdentifier(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();
  }

  private calculateEffectiveOfferCost(dto: CreateCatalogOfferDto) {
    const unitPrice = this.nonNegative(dto.unitPrice, 'preco unitario');
    const priceQuantity = this.positive(
      dto.priceQuantity,
      'quantidade correspondente ao preco',
    );
    const conversionFactor = this.positive(
      dto.conversionFactor,
      'fator de conversao',
    );
    const freightAmount = this.nonNegative(dto.freightAmount, 'frete');
    const insuranceAmount = this.nonNegative(dto.insuranceAmount, 'seguro');
    const discountAmount = this.nonNegative(dto.discountAmount, 'desconto');
    const additionalCostsAmount = this.nonNegative(
      dto.additionalCostsAmount,
      'custos adicionais',
    );
    const recoverableCreditAmount = this.nonNegative(
      dto.recoverableCreditAmount,
      'creditos recuperaveis',
    );
    const purchaseTaxPercent = this.nonNegative(
      dto.purchaseTaxPercent,
      'percentual de imposto de compra',
    );
    const purchaseTaxAmount =
      dto.purchaseTaxMode === PurchaseTaxMode.PERCENT
        ? Number((unitPrice * (purchaseTaxPercent / 100)).toFixed(2))
        : this.nonNegative(dto.purchaseTaxAmount, 'imposto de compra');

    const effectiveTotalCost = Math.max(
      0,
      unitPrice +
        freightAmount +
        insuranceAmount +
        additionalCostsAmount +
        purchaseTaxAmount -
        discountAmount -
        recoverableCreditAmount,
    );
    const effectiveUnitCost = Number(
      (effectiveTotalCost / (priceQuantity * conversionFactor)).toFixed(4),
    );

    return {
      unitPrice,
      priceQuantity,
      conversionFactor,
      freightAmount,
      insuranceAmount,
      discountAmount,
      additionalCostsAmount,
      recoverableCreditAmount,
      purchaseTaxPercent,
      purchaseTaxAmount,
      effectiveTotalCost: Number(effectiveTotalCost.toFixed(2)),
      effectiveUnitCost,
    };
  }

  private assertNoDirectStockMutation(dto: Record<string, any>) {
    const received = ['physicalQty', 'reservedQty'].filter((key) =>
      Object.prototype.hasOwnProperty.call(dto, key),
    );
    if (
      Object.prototype.hasOwnProperty.call(dto, 'stockCurrent') &&
      dto.stockCurrent !== undefined &&
      dto.stockCurrent !== null &&
      dto.stockCurrent !== '' &&
      Number(dto.stockCurrent) !== 0
    ) {
      received.push('stockCurrent');
    }
    if (received.length > 0) {
      throw new BadRequestException(
        'Saldo de estoque nao pode ser alterado diretamente pelo cadastro. Use movimentacao, compra, reserva, consumo ou ajuste auditado.',
      );
    }
  }

  private prepareCatalogWriteData(dto: CreateCatalogDto | UpdateCatalogDto): {
    catalogData: Prisma.CatalogItemUncheckedCreateInput &
      Prisma.CatalogItemUncheckedUpdateInput;
    inventoryTargets: Prisma.InventoryBalanceUpdateManyMutationInput;
  } {
    const rawData = { ...(dto as Record<string, any>) };
    const reorderPoint = rawData.reorderPoint;
    delete rawData.reorderPoint;
    delete rawData.stockCurrent;

    const inventoryTargets: Prisma.InventoryBalanceUpdateManyMutationInput = {};
    if (typeof rawData.stockMin === 'number') {
      inventoryTargets.minQty = rawData.stockMin;
    }
    if (typeof rawData.stockMax === 'number') {
      inventoryTargets.maxQty = rawData.stockMax;
    }
    if (typeof reorderPoint === 'number') {
      inventoryTargets.reorderPoint = reorderPoint;
    }

    return {
      catalogData: rawData as Prisma.CatalogItemUncheckedCreateInput &
        Prisma.CatalogItemUncheckedUpdateInput,
      inventoryTargets,
    };
  }

  private operationalDetailInclude() {
    return {
      skuArea: { select: { id: true, code: true, name: true } },
      skuFamily: { select: { id: true, code: true, name: true, areaId: true } },
      skuApplication: { select: { id: true, code: true, name: true } },
      identifiers: {
        include: {
          supplier: { select: { id: true, companyName: true, tradeName: true } },
          manufacturer: { select: { id: true, name: true, type: true } },
        },
        orderBy: [
          { isPrimary: 'desc' as const },
          { type: 'asc' as const },
          { code: 'asc' as const },
        ],
        take: 20,
      },
      supplierItems: {
        include: {
          supplier: {
            select: {
              id: true,
              companyName: true,
              tradeName: true,
              cnpj: true,
              paymentTerm: true,
              qualityScore: true,
              punctualityScore: true,
            },
          },
        },
        orderBy: [
          { isPrimary: 'desc' as const },
          { createdAt: 'asc' as const },
        ],
        take: 10,
      },
      supplierOffers: {
        include: this.offerInclude(),
        orderBy: [
          { isPreferred: 'desc' as const },
          { status: 'asc' as const },
          { effectiveUnitCost: 'asc' as const },
          { createdAt: 'desc' as const },
        ],
        take: 20,
      },
      itemDocuments: {
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' as const },
        take: 20,
      },
      inventoryBalances: {
        include: {
          warehouse: {
            select: { id: true, code: true, name: true, type: true },
          },
        },
        orderBy: [{ warehouse: { name: 'asc' as const } }],
      },
      inventoryMovements: {
        include: {
          warehouse: {
            select: { id: true, code: true, name: true, type: true },
          },
        },
        orderBy: { createdAt: 'desc' as const },
        take: 15,
      },
      purchaseOrderItems: {
        include: {
          purchaseOrder: {
            select: {
              id: true,
              code: true,
              status: true,
              issueDate: true,
              expectedDate: true,
              totalAmount: true,
              supplier: { select: { id: true, companyName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' as const },
        take: 10,
      },
      proposalItems: {
        include: {
          proposal: {
            select: {
              id: true,
              code: true,
              status: true,
              totalValue: true,
              createdAt: true,
              client: { select: { id: true, companyName: true } },
            },
          },
        },
        orderBy: { proposal: { createdAt: 'desc' as const } },
        take: 10,
      },
      priceRevisions: {
        include: {
          supplier: { select: { id: true, companyName: true } },
          createdBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' as const },
        take: 12,
      },
      maintenanceOrderMaterials: {
        include: {
          warehouse: { select: { id: true, code: true, name: true } },
          order: {
            select: {
              id: true,
              title: true,
              status: true,
              type: true,
              scheduledTo: true,
              openedAt: true,
              closedAt: true,
              generator: {
                select: {
                  id: true,
                  name: true,
                  assetTag: true,
                  serialNumber: true,
                  client: { select: { id: true, companyName: true } },
                },
              },
              contract: { select: { id: true, code: true, title: true } },
              serviceReport: { select: { id: true, code: true, status: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' as const },
        take: 10,
      },
      generatorBaseItems: {
        include: {
          generator: {
            select: {
              id: true,
              name: true,
              assetTag: true,
              serialNumber: true,
              client: { select: { id: true, companyName: true } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' as const },
        take: 10,
      },
    };
  }

  private offerInclude() {
    return {
      supplier: {
        select: {
          id: true,
          companyName: true,
          tradeName: true,
          cnpj: true,
          paymentTerm: true,
          qualityScore: true,
          punctualityScore: true,
        },
      },
      manufacturer: { select: { id: true, name: true, type: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      documents: {
        select: {
          id: true,
          category: true,
          title: true,
          version: true,
          status: true,
          fileName: true,
          externalUrl: true,
          createdAt: true,
        },
      },
    };
  }

  private withOfferRanking<T extends Record<string, any>>(offers: T[]) {
    const activeOffers = offers.filter(
      (offer) => offer.status === CatalogOfferStatus.ACTIVE,
    );
    const lowestUnitPrice = this.lowestId(activeOffers, 'unitPrice');
    const lowestEffectiveCost = this.lowestId(
      activeOffers,
      'effectiveUnitCost',
    );
    const fastestLeadTime = this.lowestId(activeOffers, 'leadTimeDays');

    return offers.map((offer) => ({
      ...offer,
      ranking: {
        lowestUnitPrice: offer.id === lowestUnitPrice,
        lowestEffectiveCost: offer.id === lowestEffectiveCost,
        fastestLeadTime: offer.id === fastestLeadTime,
        recommended:
          offer.isPreferred || offer.id === lowestEffectiveCost || false,
        incompleteComparison:
          offer.unitPrice == null ||
          offer.effectiveUnitCost == null ||
          !offer.paymentTerm ||
          offer.leadTimeDays == null,
      },
    }));
  }

  private lowestId(items: Record<string, any>[], key: string) {
    const ordered = items
      .filter((item) => Number.isFinite(Number(item[key])))
      .sort((a, b) => Number(a[key]) - Number(b[key]));
    return ordered[0]?.id;
  }

  private withOperationalSummary(item: any) {
    type BalanceLike = {
      physicalQty?: number | string | null;
      reservedQty?: number | string | null;
      minQty?: number | string | null;
      maxQty?: number | string | null;
      reorderPoint?: number | string | null;
    };
    type SupplierItemLike = {
      id: string;
      supplierId: string;
      isPrimary?: boolean | null;
      supplierSku?: string | null;
      supplierPrice?: number | null;
      leadTimeDays?: number | null;
      supplier?: { companyName?: string | null };
    };
    type CatalogItemLike = {
      stockMin?: number | string | null;
      stockMax?: number | string | null;
      inventoryMovements?: unknown[];
      purchaseOrderItems?: unknown[];
      maintenanceOrderMaterials?: unknown[];
      generatorBaseItems?: unknown[];
      identifiers?: unknown[];
      supplierOffers?: Array<{
        id: string;
        supplierId: string;
        status?: CatalogOfferStatus | string;
        isPreferred?: boolean | null;
        effectiveUnitCost?: number | string | null;
        validUntil?: Date | string | null;
        supplier?: { companyName?: string | null };
      }>;
      itemDocuments?: unknown[];
    };

    const catalogItem = item as CatalogItemLike;
    const balances = (
      Array.isArray(item.inventoryBalances) ? item.inventoryBalances : []
    ) as BalanceLike[];
    const supplierItems = (
      Array.isArray(item.supplierItems) ? item.supplierItems : []
    ) as SupplierItemLike[];
    const physicalQty = balances.reduce(
      (sum, balance) => sum + Number(balance.physicalQty || 0),
      0,
    );
    const reservedQty = balances.reduce(
      (sum, balance) => sum + Number(balance.reservedQty || 0),
      0,
    );
    const availableQty = physicalQty - reservedQty;
    const minQty = this.maxNumber([
      catalogItem.stockMin,
      ...balances.map((balance) => balance.minQty),
    ]);
    const maxQty = this.maxNumber([
      catalogItem.stockMax,
      ...balances.map((balance) => balance.maxQty),
    ]);
    const reorderPoint = this.maxNumber(
      balances.map((balance) => balance.reorderPoint),
    );
    const effectiveTrigger = reorderPoint ?? minQty ?? 0;
    const primarySupplier =
      supplierItems.find((entry) => entry.isPrimary) ||
      supplierItems[0] ||
      null;
    const activeOffers = (catalogItem.supplierOffers || []).filter(
      (offer) => offer.status === CatalogOfferStatus.ACTIVE,
    );
    const preferredOffer =
      activeOffers.find((offer) => offer.isPreferred) || null;
    const bestOffer =
      preferredOffer ||
      [...activeOffers].sort(
        (a, b) =>
          Number(a.effectiveUnitCost || Number.MAX_SAFE_INTEGER) -
          Number(b.effectiveUnitCost || Number.MAX_SAFE_INTEGER),
      )[0] ||
      null;

    return {
      ...item,
      operationalSummary: {
        physicalQty,
        reservedQty,
        availableQty,
        minQty,
        maxQty,
        reorderPoint,
        isLowStock: availableQty <= Number(effectiveTrigger || 0),
        warehouseCount: balances.length,
        movementCount: catalogItem.inventoryMovements?.length || 0,
        purchaseOrderCount: catalogItem.purchaseOrderItems?.length || 0,
        maintenanceOrderCount:
          catalogItem.maintenanceOrderMaterials?.length || 0,
        relatedGeneratorCount: catalogItem.generatorBaseItems?.length || 0,
        identifierCount: catalogItem.identifiers?.length || 0,
        supplierOfferCount: catalogItem.supplierOffers?.length || 0,
        documentCount: catalogItem.itemDocuments?.length || 0,
        bestOffer: bestOffer
          ? {
              id: bestOffer.id,
              supplierId: bestOffer.supplierId,
              companyName: bestOffer.supplier?.companyName,
              effectiveUnitCost: bestOffer.effectiveUnitCost,
              validUntil: bestOffer.validUntil,
              isPreferred: bestOffer.isPreferred,
            }
          : null,
        primarySupplier: primarySupplier
          ? {
              id: primarySupplier.supplierId,
              supplierItemId: primarySupplier.id,
              companyName: primarySupplier.supplier?.companyName,
              supplierSku: primarySupplier.supplierSku,
              leadTimeDays: primarySupplier.leadTimeDays,
              supplierPrice: primarySupplier.supplierPrice,
            }
          : null,
      },
    };
  }

  private maxNumber(values: Array<number | string | null | undefined>) {
    const finiteValues = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (finiteValues.length === 0) return null;
    return Math.max(...finiteValues);
  }
}
