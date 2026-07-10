import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryChannel,
  DeliveryDocumentType,
  DeliveryStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { createHash, createHmac, randomBytes } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { DocumentsService } from '../documents/documents.service';
import { allAccessPolicy, effectiveAccessPolicy } from '../users/access-policy';
import { CreateDocumentDeliveryDto } from './dto/create-document-delivery.dto';
import { CreateDocumentEmailDeliveryDto } from './dto/create-document-email-delivery.dto';

type ActorScope = {
  id: string;
  role: UserRole;
  linkedClientId: string | null;
  access: ReturnType<typeof effectiveAccessPolicy>;
};

type DeliveryRecord = Prisma.DocumentDeliveryGetPayload<{
  include: {
    shareToken: true;
    createdByUser: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
  };
}>;

type DocumentDescriptor = {
  documentCode: string;
  documentTitle: string;
  clientId: string;
  counterpartName: string;
};

type CompanyDeliveryPreferences = {
  senderName: string | null;
  fromEmail: string | null;
  replyToEmail: string | null;
  defaultWhatsapp: string | null;
  defaultWebhookUrl: string | null;
  emailFooter: string | null;
  companyLabel: string | null;
  templates: DeliveryTemplateMap;
};

type DeliveryTemplateEntry = {
  subject: string | null;
  message: string | null;
};

type DeliveryTemplateChannelMap = Record<
  DeliveryChannel,
  DeliveryTemplateEntry
>;

type DeliveryTemplateMap = Record<
  DeliveryDocumentType,
  DeliveryTemplateChannelMap
>;

type DeliveryTemplateContext = {
  documentType: DeliveryDocumentType;
  documentCode: string;
  documentLabel: string;
  counterpartName: string;
  companyLabel: string;
  shareUrl: string;
  recipientName: string;
};

type DispatchInput = {
  deliveryId: string;
  channel: DeliveryChannel;
  documentType: DeliveryDocumentType;
  documentId: string;
  documentCode: string;
  documentTitle: string;
  counterpartName: string;
  recipientTarget: string;
  recipientName: string;
  subject: string | null;
  message: string;
  shareUrl: string;
  expiresAt: Date;
  snapshot: Prisma.InputJsonValue;
  companyPreferences: CompanyDeliveryPreferences;
};

type DispatchResult = {
  mode: 'sent' | 'manual' | 'failed';
  provider: string;
  providerConfigured: boolean;
  note: string;
  providerMessageId?: string;
  launchUrl?: string;
};

const DELIVERY_DOCUMENT_TYPES: DeliveryDocumentType[] = [
  DeliveryDocumentType.PROPOSAL,
  DeliveryDocumentType.CONTRACT,
  DeliveryDocumentType.ORDER,
  DeliveryDocumentType.SERVICE_REPORT,
];

const DELIVERY_CHANNELS: DeliveryChannel[] = [
  DeliveryChannel.EMAIL,
  DeliveryChannel.WHATSAPP,
  DeliveryChannel.WEBHOOK,
];

const DEFAULT_DELIVERY_TEMPLATES: DeliveryTemplateMap = {
  PROPOSAL: {
    EMAIL: {
      subject: '{documentLabel} - compartilhamento seguro',
      message:
        'Ola, {recipientName}.\n\n{companyLabel} compartilhou a {documentLabel} com seguranca para {counterpartName}.\n\nAcesse pelo link:\n{shareUrl}',
    },
    WHATSAPP: {
      subject: null,
      message:
        '{companyLabel} compartilhou a {documentLabel} com seguranca.\n\nConta: {counterpartName}\nLink:\n{shareUrl}',
    },
    WEBHOOK: {
      subject: null,
      message:
        'Payload automatico de {documentLabel} preparado para {counterpartName}.',
    },
  },
  CONTRACT: {
    EMAIL: {
      subject: '{documentLabel} - compartilhamento seguro',
      message:
        'Ola, {recipientName}.\n\n{companyLabel} compartilhou o {documentLabel} para {counterpartName}.\n\nAcesse pelo link:\n{shareUrl}',
    },
    WHATSAPP: {
      subject: null,
      message:
        '{companyLabel} compartilhou o {documentLabel}.\n\nConta: {counterpartName}\nLink:\n{shareUrl}',
    },
    WEBHOOK: {
      subject: null,
      message:
        'Payload automatico de {documentLabel} preparado para {counterpartName}.',
    },
  },
  ORDER: {
    EMAIL: {
      subject: '{documentLabel} - compartilhamento seguro',
      message:
        'Ola, {recipientName}.\n\n{companyLabel} compartilhou a {documentLabel} para acompanhamento tecnico de {counterpartName}.\n\nAcesse pelo link:\n{shareUrl}',
    },
    WHATSAPP: {
      subject: null,
      message:
        '{companyLabel} compartilhou a {documentLabel}.\n\nConta: {counterpartName}\nLink:\n{shareUrl}',
    },
    WEBHOOK: {
      subject: null,
      message:
        'Payload automatico de {documentLabel} preparado para {counterpartName}.',
    },
  },
  SERVICE_REPORT: {
    EMAIL: {
      subject: '{documentLabel} - compartilhamento seguro',
      message:
        'Ola, {recipientName}.\n\n{companyLabel} compartilhou o {documentLabel} para {counterpartName}.\n\nAcesse pelo link:\n{shareUrl}',
    },
    WHATSAPP: {
      subject: null,
      message:
        '{companyLabel} compartilhou o {documentLabel}.\n\nConta: {counterpartName}\nLink:\n{shareUrl}',
    },
    WEBHOOK: {
      subject: null,
      message:
        'Payload automatico de {documentLabel} preparado para {counterpartName}.',
    },
  },
};

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: DatabaseService,
    private readonly documentsService: DocumentsService,
  ) {}

  async createDelivery(dto: CreateDocumentDeliveryDto, actorUserId: string) {
    const actor = await this.getActorScope(actorUserId);
    if (actor.role === UserRole.CLIENT) {
      throw new ForbiddenException(
        'Compartilhamento externo disponivel apenas para o time interno.',
      );
    }

    const snapshot = await this.loadDocumentSnapshot(
      dto.documentType,
      dto.documentId,
      actor.id,
    );
    const descriptor = this.describeSnapshot(snapshot);
    const expiresAt = this.calculateExpiration(dto.expiresInDays);
    const token = randomBytes(24).toString('hex');
    const tokenHash = this.hashToken(token);
    const shareUrl = `${this.getAppBaseUrl()}/share/${token}`;
    const recipientTarget = this.normalizeRecipientTarget(
      dto.channel,
      dto.recipientTarget,
    );
    const recipientName = dto.recipientName?.trim() || '';
    const companyPreferences = await this.loadCompanyDeliveryPreferences();
    const templateContext = this.buildTemplateContext({
      documentType: dto.documentType,
      documentCode: descriptor.documentCode,
      counterpartName: descriptor.counterpartName,
      shareUrl,
      companyLabel: companyPreferences.companyLabel,
      recipientName,
    });
    const subject =
      dto.channel === DeliveryChannel.EMAIL
        ? this.renderTemplateString(
            dto.subject?.trim() ||
              companyPreferences.templates[dto.documentType][dto.channel]
                .subject ||
              this.buildDefaultSubject(
                dto.documentType,
                descriptor.documentCode,
              ),
            templateContext,
          )
        : null;
    const message = this.renderTemplateString(
      dto.message?.trim() ||
        companyPreferences.templates[dto.documentType][dto.channel].message ||
        this.buildDefaultMessage({
          channel: dto.channel,
          documentType: dto.documentType,
          documentCode: descriptor.documentCode,
          counterpartName: descriptor.counterpartName,
          shareUrl,
        }),
      templateContext,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const shareToken = await tx.documentShareToken.create({
        data: {
          tokenHash,
          documentType: dto.documentType,
          documentId: dto.documentId,
          documentCode: descriptor.documentCode,
          documentTitle: descriptor.documentTitle,
          clientId: descriptor.clientId,
          counterpartName: descriptor.counterpartName,
          recipientName: recipientName || null,
          recipientEmail:
            dto.channel === DeliveryChannel.EMAIL ? recipientTarget : null,
          createdByUserId: actor.id,
          expiresAt,
        },
      });

      return tx.documentDelivery.create({
        data: {
          documentType: dto.documentType,
          documentId: dto.documentId,
          documentCode: descriptor.documentCode,
          documentTitle: descriptor.documentTitle,
          clientId: descriptor.clientId,
          counterpartName: descriptor.counterpartName,
          channel: dto.channel,
          status: DeliveryStatus.PENDING,
          recipientName: recipientName || null,
          recipientTarget,
          subject,
          message,
          shareTokenId: shareToken.id,
          payloadSnapshot: snapshot as Prisma.InputJsonValue,
          expiresAt,
          createdByUserId: actor.id,
        },
        include: {
          shareToken: true,
          createdByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    });

    const dispatchResult = await this.dispatchDelivery({
      deliveryId: created.id,
      channel: dto.channel,
      documentType: dto.documentType,
      documentId: dto.documentId,
      documentCode: descriptor.documentCode,
      documentTitle: descriptor.documentTitle,
      counterpartName: descriptor.counterpartName,
      recipientTarget,
      recipientName,
      subject,
      message,
      shareUrl,
      expiresAt,
      snapshot: snapshot as Prisma.InputJsonValue,
      companyPreferences,
    });

    const updated = await this.prisma.documentDelivery.update({
      where: { id: created.id },
      data:
        dispatchResult.mode === 'sent'
          ? {
              status: DeliveryStatus.SENT,
              provider: dispatchResult.provider,
              providerMessageId: dispatchResult.providerMessageId,
              sentAt: new Date(),
              errorMessage: null,
              failedAt: null,
            }
          : dispatchResult.mode === 'manual'
            ? {
                status: DeliveryStatus.PENDING,
                provider: dispatchResult.provider,
                errorMessage: dispatchResult.note,
              }
            : {
                status: DeliveryStatus.FAILED,
                provider: dispatchResult.provider,
                errorMessage: dispatchResult.note,
                failedAt: new Date(),
              },
      include: {
        shareToken: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const dispatched = dispatchResult.mode === 'sent';
    const manualActionRequired = dispatchResult.mode === 'manual';

    return {
      delivery: this.mapDelivery(updated),
      channel: dto.channel,
      shareUrl,
      shareExpiresAt: expiresAt.toISOString(),
      dispatched,
      emailDispatched:
        dto.channel === DeliveryChannel.EMAIL ? dispatched : false,
      manualActionRequired,
      manualShareRequired: manualActionRequired,
      providerConfigured: dispatchResult.providerConfigured,
      launchUrl: dispatchResult.launchUrl || null,
      note: dispatchResult.note,
    };
  }

  async createEmailDelivery(
    dto: CreateDocumentEmailDeliveryDto,
    actorUserId: string,
  ) {
    return this.createDelivery(
      {
        channel: DeliveryChannel.EMAIL,
        documentType: dto.documentType,
        documentId: dto.documentId,
        recipientTarget: dto.recipientEmail,
        recipientName: dto.recipientName,
        subject: dto.subject,
        message: dto.message,
        expiresInDays: dto.expiresInDays,
      },
      actorUserId,
    );
  }

  async retryDelivery(deliveryId: string, actorUserId: string) {
    const actor = await this.getActorScope(actorUserId);
    if (actor.role === UserRole.CLIENT) {
      throw new ForbiddenException(
        'Reenvio externo disponivel apenas para o time interno.',
      );
    }

    const delivery = await this.prisma.documentDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      throw new NotFoundException('Envio nao encontrado.');
    }

    if (!this.canSeeDocumentType(actor.access, delivery.documentType)) {
      throw new ForbiddenException(
        'Voce nao possui acesso para reenviar este documento.',
      );
    }

    return this.createDelivery(
      {
        channel: delivery.channel,
        documentType: delivery.documentType,
        documentId: delivery.documentId,
        recipientTarget: delivery.recipientTarget,
        recipientName: delivery.recipientName || undefined,
        expiresInDays: 7,
      },
      actorUserId,
    );
  }

  async getHistory(actorUserId: string) {
    const actor = await this.getActorScope(actorUserId);
    const deliveries = await this.prisma.documentDelivery.findMany({
      where:
        actor.role === UserRole.CLIENT
          ? {
              clientId: this.requireLinkedClientId(actor),
            }
          : undefined,
      include: {
        shareToken: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });

    const filtered =
      actor.role === UserRole.CLIENT
        ? deliveries
        : deliveries.filter((delivery) =>
            this.canSeeDocumentType(actor.access, delivery.documentType),
          );

    return {
      summary: {
        total: filtered.length,
        sent: filtered.filter((item) => item.status === DeliveryStatus.SENT)
          .length,
        delivered: filtered.filter(
          (item) => item.status === DeliveryStatus.DELIVERED,
        ).length,
        failed: filtered.filter((item) => item.status === DeliveryStatus.FAILED)
          .length,
        pending: filtered.filter(
          (item) => item.status === DeliveryStatus.PENDING,
        ).length,
      },
      items: filtered.map((item) => this.mapDelivery(item)),
    };
  }

  async getPreferences(actorUserId: string) {
    const actor = await this.getActorScope(actorUserId);
    if (actor.role === UserRole.CLIENT) {
      throw new ForbiddenException(
        'Preferencias de envio disponiveis apenas para o time interno.',
      );
    }

    const preferences = await this.loadCompanyDeliveryPreferences();
    const envFromEmail =
      process.env.DELIVERY_FROM_EMAIL?.trim() ||
      process.env.RESEND_FROM_EMAIL?.trim() ||
      null;

    return {
      senderName: preferences.senderName,
      fromEmail: preferences.fromEmail || envFromEmail,
      replyToEmail: preferences.replyToEmail,
      defaultWhatsapp: preferences.defaultWhatsapp,
      defaultWebhookUrl: preferences.defaultWebhookUrl,
      emailFooter: preferences.emailFooter,
      companyLabel: preferences.companyLabel,
      templates: preferences.templates,
      providerStatus: {
        email: Boolean(
          process.env.RESEND_API_KEY?.trim() &&
          (preferences.fromEmail || envFromEmail),
        ),
        whatsapp: Boolean(
          process.env.WHATSAPP_ACCESS_TOKEN?.trim() &&
          process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
        ),
        webhook: true,
      },
    };
  }

  async getSharedDocument(token: string) {
    const tokenHash = this.hashToken(token);
    const shareToken = await this.prisma.documentShareToken.findUnique({
      where: { tokenHash },
      include: {
        delivery: true,
      },
    });

    if (!shareToken || !shareToken.delivery) {
      throw new NotFoundException('Link seguro nao encontrado.');
    }

    if (shareToken.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('Este link seguro expirou.');
    }

    await this.prisma.$transaction([
      this.prisma.documentShareToken.update({
        where: { id: shareToken.id },
        data: {
          lastOpenedAt: new Date(),
          openedCount: {
            increment: 1,
          },
        },
      }),
      this.prisma.documentDelivery.update({
        where: { id: shareToken.delivery.id },
        data:
          shareToken.delivery.status === DeliveryStatus.DELIVERED
            ? {}
            : {
                status: DeliveryStatus.DELIVERED,
                deliveredAt: new Date(),
              },
      }),
    ]);

    const payload = shareToken.delivery.payloadSnapshot as Record<
      string,
      unknown
    > | null;
    if (!payload) {
      throw new NotFoundException('Snapshot do documento nao encontrado.');
    }

    return {
      ...payload,
      share: {
        recipientName: shareToken.recipientName,
        recipientEmail: shareToken.recipientEmail,
        expiresAt: shareToken.expiresAt.toISOString(),
        openedCount: shareToken.openedCount + 1,
      },
    };
  }

  private async loadDocumentSnapshot(
    documentType: DeliveryDocumentType,
    documentId: string,
    actorUserId: string,
  ) {
    if (documentType === DeliveryDocumentType.PROPOSAL) {
      return this.documentsService.getProposalDocument(documentId, actorUserId);
    }
    if (documentType === DeliveryDocumentType.CONTRACT) {
      return this.documentsService.getContractDocument(documentId, actorUserId);
    }
    if (documentType === DeliveryDocumentType.SERVICE_REPORT) {
      throw new BadRequestException(
        'Laudos tecnicos devem ser liberados pelo modulo de relatorios tecnicos.',
      );
    }
    return this.documentsService.getOrderDocument(documentId, actorUserId);
  }

  private describeSnapshot(snapshot: Record<string, any>): DocumentDescriptor {
    if (snapshot.kind === 'proposal') {
      return {
        documentCode: snapshot.document.code as string,
        documentTitle: `Proposta ${snapshot.document.code}`,
        clientId: snapshot.client.id as string,
        counterpartName: (snapshot.client.tradeName ||
          snapshot.client.companyName) as string,
      };
    }

    if (snapshot.kind === 'contract') {
      return {
        documentCode: snapshot.document.code as string,
        documentTitle: `Contrato ${snapshot.document.code}`,
        clientId: snapshot.client.id as string,
        counterpartName: (snapshot.client.tradeName ||
          snapshot.client.companyName) as string,
      };
    }

    return {
      documentCode: String(snapshot.document.id).slice(0, 8).toUpperCase(),
      documentTitle: snapshot.document.title as string,
      clientId: snapshot.client.id as string,
      counterpartName: (snapshot.client.tradeName ||
        snapshot.client.companyName) as string,
    };
  }

  private buildDefaultSubject(
    documentType: DeliveryDocumentType,
    documentCode: string,
  ) {
    return `${this.labelDocumentType(documentType)} ${documentCode} - compartilhamento seguro`;
  }

  private buildDefaultMessage(input: {
    channel: DeliveryChannel;
    documentType: DeliveryDocumentType;
    documentCode: string;
    counterpartName: string;
    shareUrl: string;
  }) {
    const documentLabel = this.labelDocumentType(input.documentType);
    const recipient = input.counterpartName || 'o destinatario';

    if (input.channel === DeliveryChannel.WHATSAPP) {
      return `${documentLabel} ${input.documentCode} compartilhada com seguranca para ${recipient}.\n\nAbra pelo link:\n${input.shareUrl}`;
    }

    if (input.channel === DeliveryChannel.WEBHOOK) {
      return `Payload automatico de ${documentLabel.toLowerCase()} preparado para ${recipient}.`;
    }

    return `O documento ${documentLabel.toLowerCase()} foi compartilhado com seguranca para ${recipient}.\n\nAcesse pelo link:\n${input.shareUrl}`;
  }

  private buildTemplateContext(input: {
    documentType: DeliveryDocumentType;
    documentCode: string;
    counterpartName: string;
    shareUrl: string;
    companyLabel: string | null;
    recipientName: string;
  }): DeliveryTemplateContext {
    return {
      documentType: input.documentType,
      documentCode: input.documentCode,
      documentLabel: `${this.labelDocumentType(input.documentType)} ${input.documentCode}`,
      counterpartName: input.counterpartName,
      companyLabel: input.companyLabel || 'Manitec',
      shareUrl: input.shareUrl,
      recipientName: input.recipientName || 'cliente',
    };
  }

  private renderTemplateString(
    template: string,
    context: DeliveryTemplateContext,
  ) {
    return template
      .replaceAll('{documentLabel}', context.documentLabel)
      .replaceAll('{documentCode}', context.documentCode)
      .replaceAll('{counterpartName}', context.counterpartName)
      .replaceAll('{companyLabel}', context.companyLabel)
      .replaceAll('{shareUrl}', context.shareUrl)
      .replaceAll('{recipientName}', context.recipientName);
  }

  private async dispatchDelivery(
    input: DispatchInput,
  ): Promise<DispatchResult> {
    if (input.channel === DeliveryChannel.WHATSAPP) {
      return this.dispatchWhatsappDelivery(input);
    }

    if (input.channel === DeliveryChannel.WEBHOOK) {
      return this.dispatchWebhookDelivery(input);
    }

    return this.dispatchEmailDelivery(input);
  }

  private async dispatchEmailDelivery(
    input: DispatchInput,
  ): Promise<DispatchResult> {
    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const fromEmail =
      input.companyPreferences.fromEmail ||
      process.env.DELIVERY_FROM_EMAIL?.trim() ||
      process.env.RESEND_FROM_EMAIL?.trim();
    const replyTo = input.companyPreferences.replyToEmail || undefined;
    const fromHeader =
      fromEmail && input.companyPreferences.senderName
        ? `${input.companyPreferences.senderName} <${fromEmail}>`
        : fromEmail;

    if (!resendApiKey || !fromEmail) {
      return {
        mode: 'manual',
        provider: 'manual-link',
        providerConfigured: false,
        note: 'Provider de e-mail nao configurado. Link seguro gerado para envio manual.',
      };
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromHeader,
          to: [input.recipientTarget],
          ...(replyTo ? { reply_to: replyTo } : {}),
          subject:
            input.subject ||
            this.buildDefaultSubject(input.documentType, input.documentCode),
          text: this.composeTextBody(input),
          html: this.buildEmailHtml(input),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        return {
          mode: 'failed',
          provider: 'resend',
          providerConfigured: true,
          note:
            payload?.message ||
            'Falha ao enviar e-mail pelo provider configurado.',
        };
      }

      return {
        mode: 'sent',
        provider: 'resend',
        providerConfigured: true,
        providerMessageId: payload?.id || input.deliveryId,
        note: 'E-mail disparado com sucesso.',
      };
    } catch (error: unknown) {
      return {
        mode: 'failed',
        provider: 'resend',
        providerConfigured: true,
        note:
          error instanceof Error
            ? error.message
            : 'Falha inesperada ao disparar e-mail.',
      };
    }
  }

  private async dispatchWhatsappDelivery(
    input: DispatchInput,
  ): Promise<DispatchResult> {
    const launchUrl = this.buildWhatsappLaunchUrl(
      input.recipientTarget,
      `${input.message}\n\n${input.shareUrl}`,
    );
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const apiBaseUrl =
      process.env.WHATSAPP_API_BASE_URL?.trim() ||
      'https://graph.facebook.com/v22.0';

    if (!accessToken || !phoneNumberId) {
      return {
        mode: 'manual',
        provider: 'whatsapp-link',
        providerConfigured: false,
        launchUrl,
        note: 'Provider oficial do WhatsApp nao configurado. Link de abertura preparado para envio manual.',
      };
    }

    try {
      const response = await fetch(
        `${apiBaseUrl.replace(/\/+$/, '')}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: input.recipientTarget,
            type: 'text',
            text: {
              preview_url: true,
              body: `${input.message}\n\n${input.shareUrl}`,
            },
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      } | null;

      if (!response.ok) {
        return {
          mode: 'failed',
          provider: 'whatsapp-cloud-api',
          providerConfigured: true,
          launchUrl,
          note:
            payload?.error?.message ||
            'Falha ao disparar mensagem pelo provider do WhatsApp.',
        };
      }

      return {
        mode: 'sent',
        provider: 'whatsapp-cloud-api',
        providerConfigured: true,
        providerMessageId: payload?.messages?.[0]?.id || input.deliveryId,
        launchUrl,
        note: 'Mensagem do WhatsApp disparada com sucesso.',
      };
    } catch (error: unknown) {
      return {
        mode: 'failed',
        provider: 'whatsapp-cloud-api',
        providerConfigured: true,
        launchUrl,
        note:
          error instanceof Error
            ? error.message
            : 'Falha inesperada ao disparar mensagem no WhatsApp.',
      };
    }
  }

  private async dispatchWebhookDelivery(
    input: DispatchInput,
  ): Promise<DispatchResult> {
    const body = JSON.stringify({
      event: 'document.shared',
      occurredAt: new Date().toISOString(),
      delivery: {
        id: input.deliveryId,
        channel: input.channel,
        recipientName: input.recipientName || null,
        recipientTarget: input.recipientTarget,
      },
      share: {
        url: input.shareUrl,
        expiresAt: input.expiresAt.toISOString(),
      },
      document: {
        type: input.documentType,
        id: input.documentId,
        code: input.documentCode,
        title: input.documentTitle,
        counterpartName: input.counterpartName,
      },
      payload: input.snapshot,
    });
    const secret = process.env.DELIVERY_WEBHOOK_SECRET?.trim();

    try {
      const response = await fetch(input.recipientTarget, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Manitec-Event': 'document.shared',
          ...(secret
            ? {
                'X-Manitec-Signature': this.signWebhookPayload(body, secret),
              }
            : {}),
        },
        body,
      });

      if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        return {
          mode: 'failed',
          provider: 'webhook',
          providerConfigured: true,
          note:
            responseText.trim() ||
            `Webhook respondeu com ${response.status} ${response.statusText}.`,
        };
      }

      return {
        mode: 'sent',
        provider: 'webhook',
        providerConfigured: true,
        providerMessageId:
          response.headers.get('x-request-id') || String(response.status),
        note: 'Webhook entregue com sucesso.',
      };
    } catch (error: unknown) {
      return {
        mode: 'failed',
        provider: 'webhook',
        providerConfigured: true,
        note:
          error instanceof Error
            ? error.message
            : 'Falha inesperada ao disparar webhook.',
      };
    }
  }

  private buildEmailHtml(input: DispatchInput) {
    const greeting = input.recipientName
      ? `Ola, ${this.escapeHtml(input.recipientName)}`
      : 'Ola';
    const footer = input.companyPreferences.emailFooter
      ? `<p style="margin: 18px 0 0; font-size: 13px; line-height: 1.7; color: #475569; white-space: pre-line;">${this.escapeHtml(
          input.companyPreferences.emailFooter,
        )}</p>`
      : '';
    const companyLabel = input.companyPreferences.companyLabel
      ? `<p style="margin: 20px 0 0; font-size: 12px; line-height: 1.7; color: #94a3b8;">Mensagem enviada por ${this.escapeHtml(
          input.companyPreferences.companyLabel,
        )}</p>`
      : '';

    return `
      <div style="font-family: Arial, sans-serif; background: #f5f7fb; padding: 32px;">
        <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 24px; overflow: hidden; border: 1px solid #d7dfeb;">
          <div style="background: linear-gradient(135deg,#102132 0%,#1d3a5d 100%); color: #ffffff; padding: 28px 32px;">
            <div style="font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.7;">Compartilhamento seguro</div>
            <h1 style="margin: 12px 0 0; font-size: 28px; line-height: 1.15;">${this.escapeHtml(`${this.labelDocumentType(input.documentType)} ${input.documentCode}`)}</h1>
          </div>
          <div style="padding: 28px 32px; color: #1f2937;">
            <p style="margin: 0 0 12px; font-size: 15px; line-height: 1.7;">${greeting},</p>
            <p style="margin: 0 0 18px; font-size: 15px; line-height: 1.7; white-space: pre-line;">${this.escapeHtml(input.message)}</p>
            <a href="${input.shareUrl}" style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 14px 18px; border-radius: 16px; font-weight: 700;">Abrir documento</a>
            <p style="margin: 18px 0 0; font-size: 13px; line-height: 1.7; color: #6b7280;">
              Se o botao nao abrir, use este link:<br />
              <a href="${input.shareUrl}" style="color: #1d4ed8;">${input.shareUrl}</a>
            </p>
            ${footer}
            ${companyLabel}
          </div>
        </div>
      </div>
    `;
  }

  private composeTextBody(input: DispatchInput) {
    const parts = [input.message, input.shareUrl];
    if (input.companyPreferences.emailFooter) {
      parts.push(input.companyPreferences.emailFooter);
    }
    return parts.filter(Boolean).join('\n\n');
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private normalizeRecipientTarget(
    channel: DeliveryChannel,
    rawTarget: string,
  ) {
    const target = rawTarget.trim();
    if (!target) {
      throw new BadRequestException(
        'Informe um destino para o compartilhamento.',
      );
    }

    if (channel === DeliveryChannel.EMAIL) {
      const normalizedEmail = target.toLowerCase();
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(normalizedEmail)) {
        throw new BadRequestException('Informe um e-mail valido.');
      }

      return normalizedEmail;
    }

    if (channel === DeliveryChannel.WEBHOOK) {
      try {
        const parsed = new URL(target);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('invalid-protocol');
        }

        return parsed.toString();
      } catch {
        throw new BadRequestException('Informe uma URL valida para o webhook.');
      }
    }

    let digits = target.replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) {
      digits = `55${digits}`;
    }

    if (digits.length < 12 || digits.length > 15) {
      throw new BadRequestException(
        'Informe um numero de WhatsApp com DDI e DDD validos.',
      );
    }

    return digits;
  }

  private buildWhatsappLaunchUrl(phone: string, message: string) {
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }

  private signWebhookPayload(body: string, secret: string) {
    return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  private calculateExpiration(days?: number) {
    const expiresAt = new Date();
    expiresAt.setDate(
      expiresAt.getDate() + Math.max(1, Math.min(days || 7, 30)),
    );
    return expiresAt;
  }

  private getAppBaseUrl() {
    const base =
      process.env.APP_BASE_URL?.trim() ||
      process.env.FRONTEND_BASE_URL?.trim() ||
      'http://localhost:3001';

    return base.replace(/\/+$/, '');
  }

  private async loadCompanyDeliveryPreferences(): Promise<CompanyDeliveryPreferences> {
    const company = await this.prisma.companySettings.findFirst({
      where: { isPrimary: true },
      select: {
        companyName: true,
        tradeName: true,
        deliverySenderName: true,
        deliveryFromEmail: true,
        deliveryReplyToEmail: true,
        deliveryDefaultWhatsapp: true,
        deliveryDefaultWebhookUrl: true,
        deliveryEmailFooter: true,
        deliveryTemplatesJson: true,
      },
    });

    return {
      senderName: company?.deliverySenderName || company?.tradeName || null,
      fromEmail: company?.deliveryFromEmail || null,
      replyToEmail: company?.deliveryReplyToEmail || null,
      defaultWhatsapp: company?.deliveryDefaultWhatsapp || null,
      defaultWebhookUrl: company?.deliveryDefaultWebhookUrl || null,
      emailFooter: company?.deliveryEmailFooter || null,
      companyLabel: company?.tradeName || company?.companyName || null,
      templates: this.normalizeDeliveryTemplates(
        company?.deliveryTemplatesJson as Record<string, unknown> | null,
      ),
    };
  }

  private normalizeDeliveryTemplates(
    rawTemplates: Record<string, unknown> | null,
  ): DeliveryTemplateMap {
    const source =
      rawTemplates &&
      typeof rawTemplates === 'object' &&
      !Array.isArray(rawTemplates)
        ? rawTemplates
        : {};

    return DELIVERY_DOCUMENT_TYPES.reduce<DeliveryTemplateMap>(
      (documentAccumulator, documentType) => {
        const documentValue = source[documentType];
        const documentTemplates =
          documentValue &&
          typeof documentValue === 'object' &&
          !Array.isArray(documentValue)
            ? (documentValue as Record<string, unknown>)
            : {};

        documentAccumulator[documentType] =
          DELIVERY_CHANNELS.reduce<DeliveryTemplateChannelMap>(
            (channelAccumulator, channel) => {
              const rawChannel = documentTemplates[channel];
              const channelValue =
                rawChannel &&
                typeof rawChannel === 'object' &&
                !Array.isArray(rawChannel)
                  ? (rawChannel as Record<string, unknown>)
                  : {};
              const defaults =
                DEFAULT_DELIVERY_TEMPLATES[documentType][channel];

              channelAccumulator[channel] = {
                subject:
                  typeof channelValue.subject === 'string'
                    ? channelValue.subject
                    : defaults.subject,
                message:
                  typeof channelValue.message === 'string'
                    ? channelValue.message
                    : defaults.message,
              };

              return channelAccumulator;
            },
            {} as DeliveryTemplateChannelMap,
          );

        return documentAccumulator;
      },
      {} as DeliveryTemplateMap,
    );
  }

  private labelDocumentType(documentType: DeliveryDocumentType) {
    const labels: Record<DeliveryDocumentType, string> = {
      PROPOSAL: 'Proposta',
      CONTRACT: 'Contrato',
      ORDER: 'Ordem de servico',
      SERVICE_REPORT: 'Laudo tecnico',
    };

    return labels[documentType];
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async getActorScope(actorUserId: string): Promise<ActorScope> {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: {
        id: true,
        role: true,
        isSystemMaster: true,
        accessPolicy: true,
        linkedClientId: true,
      },
    });

    if (!actor) {
      throw new NotFoundException('Usuario nao encontrado.');
    }

    return {
      id: actor.id,
      role: actor.role,
      linkedClientId: actor.linkedClientId,
      access: actor.isSystemMaster
        ? allAccessPolicy
        : effectiveAccessPolicy(actor.role, actor.accessPolicy),
    };
  }

  private requireLinkedClientId(actor: Pick<ActorScope, 'linkedClientId'>) {
    if (!actor.linkedClientId) {
      throw new ForbiddenException(
        'Conta do cliente sem empresa vinculada ao portal.',
      );
    }

    return actor.linkedClientId;
  }

  private canSeeDocumentType(
    access: ReturnType<typeof effectiveAccessPolicy>,
    documentType: DeliveryDocumentType,
  ) {
    if (documentType === DeliveryDocumentType.PROPOSAL) {
      return access.pages.proposals;
    }

    if (documentType === DeliveryDocumentType.CONTRACT) {
      return access.pages.contracts;
    }

    if (documentType === DeliveryDocumentType.SERVICE_REPORT) {
      return access.pages.serviceReports;
    }

    return access.pages.orders;
  }

  private mapDelivery(delivery: DeliveryRecord) {
    return {
      id: delivery.id,
      documentType: delivery.documentType,
      documentId: delivery.documentId,
      documentCode: delivery.documentCode,
      documentTitle: delivery.documentTitle,
      counterpartName: delivery.counterpartName,
      channel: delivery.channel,
      status: delivery.status,
      recipientName: delivery.recipientName,
      recipientTarget: delivery.recipientTarget,
      subject: delivery.subject,
      message: delivery.message,
      provider: delivery.provider,
      providerMessageId: delivery.providerMessageId,
      errorMessage: delivery.errorMessage,
      sentAt: delivery.sentAt?.toISOString() || null,
      deliveredAt: delivery.deliveredAt?.toISOString() || null,
      failedAt: delivery.failedAt?.toISOString() || null,
      expiresAt: delivery.expiresAt?.toISOString() || null,
      createdAt: delivery.createdAt.toISOString(),
      createdByUser: delivery.createdByUser,
      share: delivery.shareToken
        ? {
            expiresAt: delivery.shareToken.expiresAt.toISOString(),
            lastOpenedAt:
              delivery.shareToken.lastOpenedAt?.toISOString() || null,
            openedCount: delivery.shareToken.openedCount,
          }
        : null,
    };
  }
}
