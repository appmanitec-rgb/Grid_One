import { apiFetch, readApiErrorMessage } from "./api";
import { apiUrl } from "./api-base";
import type {
  ContractDocumentPayload,
  OrderDocumentPayload,
  ProposalDocumentPayload,
} from "./dashboard-documents";

export type DeliveryChannel = "EMAIL" | "WHATSAPP" | "WEBHOOK";
export type DeliveryDocumentType =
  | "PROPOSAL"
  | "CONTRACT"
  | "ORDER"
  | "SERVICE_REPORT";

export type DocumentDeliveryItem = {
  id: string;
  documentType: DeliveryDocumentType;
  documentId: string;
  documentCode?: string | null;
  documentTitle?: string | null;
  counterpartName?: string | null;
  channel: DeliveryChannel;
  status: string;
  recipientName?: string | null;
  recipientTarget: string;
  subject?: string | null;
  message?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  failedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  createdByUser?: { id: string; name: string; email: string } | null;
  share?: {
    expiresAt: string;
    lastOpenedAt?: string | null;
    openedCount: number;
  } | null;
};

export type DocumentDeliveryHistory = {
  summary: {
    total: number;
    sent: number;
    delivered: number;
    failed: number;
    pending: number;
  };
  items: DocumentDeliveryItem[];
};

export type DocumentDeliveryCreateResponse = {
  delivery: DocumentDeliveryItem;
  channel: DeliveryChannel;
  shareUrl: string;
  shareExpiresAt: string;
  dispatched: boolean;
  emailDispatched: boolean;
  manualActionRequired: boolean;
  manualShareRequired: boolean;
  providerConfigured: boolean;
  launchUrl?: string | null;
  note?: string | null;
};

export type DeliveryTemplateEntry = {
  subject?: string | null;
  message?: string | null;
};

export type DeliveryTemplateMap = Record<
  DeliveryDocumentType,
  Record<DeliveryChannel, DeliveryTemplateEntry>
>;

export type DeliveryTemplateRenderContext = {
  documentLabel: string;
  documentCode?: string | null;
  counterpartName?: string | null;
  companyLabel?: string | null;
  companyContacts?: string | null;
  shareUrl?: string | null;
  taggoUrl?: string | null;
  recipientName?: string | null;
};

export type SharedProposalApprovalResponse = {
  message: string;
  proposal: {
    id: string;
    code: string;
    status: string;
    statusLabel: string;
    totalValue: number;
    validUntil?: string | null;
    customerDecisionAt?: string | null;
    customerDecisionSource?: string | null;
    customerDecisionNote?: string | null;
  };
  decision: {
    source: string;
    signerName: string;
    signerCpf: string;
    signatureHash: string;
    decidedAt: string;
  };
};

export const MANITEC_TAGGO_URL = "https://taggo.one/marketingmanitec";

export const DELIVERY_CHANNEL_OPTIONS: DeliveryChannel[] = [
  "EMAIL",
  "WHATSAPP",
  "WEBHOOK",
];

export const DELIVERY_DOCUMENT_OPTIONS: DeliveryDocumentType[] = [
  "PROPOSAL",
  "CONTRACT",
  "ORDER",
  "SERVICE_REPORT",
];

export const DEFAULT_DELIVERY_TEMPLATES: DeliveryTemplateMap = {
  PROPOSAL: {
    EMAIL: {
      subject: "{documentLabel} - compartilhamento seguro",
      message:
        "Ola, {recipientName}.\n\n{companyLabel} compartilhou a {documentLabel} com seguranca para {counterpartName}.\n\nAcesse pelo link para visualizar e aprovar com assinatura, nome e CPF:\n{shareUrl}\n\nSe preferir, responda este e-mail com sua aprovacao.\n\nContatos Manitec: {companyContacts}\nTaggo Manitec: {taggoUrl}",
    },
    WHATSAPP: {
      subject: null,
      message:
        "{companyLabel} compartilhou a {documentLabel} com seguranca.\n\nConta: {counterpartName}\nAprove pelo link com assinatura, nome e CPF:\n{shareUrl}\n\nContatos: {companyContacts}\nTaggo: {taggoUrl}",
    },
    WEBHOOK: {
      subject: null,
      message:
        "Payload automatico de {documentLabel} preparado para {counterpartName}.",
    },
  },
  CONTRACT: {
    EMAIL: {
      subject: "{documentLabel} - compartilhamento seguro",
      message:
        "Ola, {recipientName}.\n\n{companyLabel} compartilhou o {documentLabel} para {counterpartName}.\n\nAcesse pelo link:\n{shareUrl}",
    },
    WHATSAPP: {
      subject: null,
      message:
        "{companyLabel} compartilhou o {documentLabel}.\n\nCliente: {counterpartName}\nLink:\n{shareUrl}",
    },
    WEBHOOK: {
      subject: null,
      message:
        "Payload automatico de {documentLabel} preparado para {counterpartName}.",
    },
  },
  ORDER: {
    EMAIL: {
      subject: "{documentLabel} - compartilhamento seguro",
      message:
        "Ola, {recipientName}.\n\n{companyLabel} compartilhou a {documentLabel} vinculada a {counterpartName}.\n\nAcesse pelo link:\n{shareUrl}",
    },
    WHATSAPP: {
      subject: null,
      message:
        "{companyLabel} compartilhou a {documentLabel}.\n\nConta: {counterpartName}\nLink:\n{shareUrl}",
    },
    WEBHOOK: {
      subject: null,
      message:
        "Payload automatico de {documentLabel} preparado para {counterpartName}.",
    },
  },
  SERVICE_REPORT: {
    EMAIL: {
      subject: "{documentLabel} - compartilhamento seguro",
      message:
        "Ola, {recipientName}.\n\n{companyLabel} compartilhou o {documentLabel} para {counterpartName}.\n\nAcesse pelo link:\n{shareUrl}",
    },
    WHATSAPP: {
      subject: null,
      message:
        "{companyLabel} compartilhou o {documentLabel}.\n\nConta: {counterpartName}\nLink:\n{shareUrl}",
    },
    WEBHOOK: {
      subject: null,
      message:
        "Payload automatico de {documentLabel} preparado para {counterpartName}.",
    },
  },
};

export type DeliveryComposerPreferences = {
  senderName?: string | null;
  fromEmail?: string | null;
  replyToEmail?: string | null;
  defaultWhatsapp?: string | null;
  defaultWebhookUrl?: string | null;
  emailFooter?: string | null;
  companyLabel?: string | null;
  templates: DeliveryTemplateMap;
  providerStatus: {
    email: boolean;
    whatsapp: boolean;
    webhook: boolean;
  };
};

export type SharedDocumentEnvelope = (
  | ProposalDocumentPayload
  | ContractDocumentPayload
  | OrderDocumentPayload
) & {
  share: {
    recipientName?: string | null;
    recipientEmail?: string | null;
    expiresAt: string;
    openedCount: number;
  };
};

export type DeliveriesApiError = Error & {
  status?: number;
};

export function cloneDeliveryTemplateMap(
  rawTemplates?: Partial<DeliveryTemplateMap> | null,
): DeliveryTemplateMap {
  const source =
    rawTemplates && typeof rawTemplates === "object" ? rawTemplates : {};

  return DELIVERY_DOCUMENT_OPTIONS.reduce<DeliveryTemplateMap>(
    (documentAccumulator, documentType) => {
      const rawDocument = source[documentType];
      const documentTemplates =
        rawDocument && typeof rawDocument === "object"
          ? (rawDocument as Partial<Record<DeliveryChannel, DeliveryTemplateEntry>>)
          : {};

      documentAccumulator[documentType] = DELIVERY_CHANNEL_OPTIONS.reduce<
        DeliveryTemplateMap[DeliveryDocumentType]
      >((channelAccumulator, channel) => {
        const defaults = DEFAULT_DELIVERY_TEMPLATES[documentType][channel];
        const rawChannel = documentTemplates[channel];
        const entry =
          rawChannel && typeof rawChannel === "object"
            ? rawChannel
            : ({} as DeliveryTemplateEntry);

        channelAccumulator[channel] = {
          subject:
            typeof entry.subject === "string"
              ? entry.subject
              : (defaults.subject ?? ""),
          message:
            typeof entry.message === "string"
              ? entry.message
              : (defaults.message ?? ""),
        };

        return channelAccumulator;
      }, {} as DeliveryTemplateMap[DeliveryDocumentType]);

      return documentAccumulator;
    },
    {} as DeliveryTemplateMap,
  );
}

export function renderDeliveryTemplate(
  template: string | null | undefined,
  context: DeliveryTemplateRenderContext,
) {
  if (!template) return "";

  return template
    .replaceAll("{documentLabel}", context.documentLabel)
    .replaceAll("{documentCode}", context.documentCode || context.documentLabel)
    .replaceAll("{counterpartName}", context.counterpartName || "cliente")
    .replaceAll("{companyLabel}", context.companyLabel || "Manitec")
    .replaceAll("{companyContacts}", context.companyContacts || "responda este contato")
    .replaceAll("{shareUrl}", context.shareUrl || "[link seguro]")
    .replaceAll("{taggoUrl}", context.taggoUrl || MANITEC_TAGGO_URL)
    .replaceAll("{recipientName}", context.recipientName || "cliente");
}

async function parseJsonOrThrow<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  if (!response.ok) {
    const error = new Error(
      await readApiErrorMessage(response, fallback),
    ) as DeliveriesApiError;
    error.status = response.status;
    throw error;
  }

  return (await response.json()) as T;
}

export async function createDocumentDelivery(input: {
  channel: DeliveryChannel;
  documentType: DeliveryDocumentType;
  documentId: string;
  recipientTarget: string;
  recipientName?: string;
  subject?: string;
  message?: string;
  expiresInDays?: number;
}) {
  const response = await apiFetch(apiUrl("/deliveries"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJsonOrThrow<DocumentDeliveryCreateResponse>(
    response,
    "Nao foi possivel compartilhar o documento.",
  );
}

export async function createDocumentEmailDelivery(input: {
  documentType: DeliveryDocumentType;
  documentId: string;
  recipientEmail: string;
  recipientName?: string;
  subject?: string;
  message?: string;
  expiresInDays?: number;
}) {
  return createDocumentDelivery({
    channel: "EMAIL",
    documentType: input.documentType,
    documentId: input.documentId,
    recipientTarget: input.recipientEmail,
    recipientName: input.recipientName,
    subject: input.subject,
    message: input.message,
    expiresInDays: input.expiresInDays,
  });
}

export async function fetchDeliveryHistory() {
  const response = await apiFetch(apiUrl("/deliveries/history"), {
    cache: "no-store",
  });

  return parseJsonOrThrow<DocumentDeliveryHistory>(
    response,
    "Nao foi possivel carregar o historico de envios.",
  );
}

export async function fetchDeliveryPreferences() {
  const response = await apiFetch(apiUrl("/deliveries/preferences"), {
    cache: "no-store",
  });

  return parseJsonOrThrow<DeliveryComposerPreferences>(
    response,
    "Nao foi possivel carregar as preferencias de envio.",
  );
}

export async function retryDocumentDelivery(deliveryId: string) {
  const response = await apiFetch(apiUrl(`/deliveries/${deliveryId}/retry`), {
    method: "POST",
  });

  return parseJsonOrThrow<DocumentDeliveryCreateResponse>(
    response,
    "Nao foi possivel reenviar o documento.",
  );
}

export async function fetchSharedDocument(token: string) {
  const response = await fetch(apiUrl(`/deliveries/share/${token}`), {
    cache: "no-store",
  });

  return parseJsonOrThrow<SharedDocumentEnvelope>(
    response,
    "Nao foi possivel abrir este link seguro.",
  );
}

export async function approveSharedProposal(
  token: string,
  input: {
    signerName: string;
    signerCpf: string;
    signatureData: string;
    note?: string;
  },
) {
  const response = await fetch(apiUrl(`/deliveries/share/${token}/proposal-approval`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJsonOrThrow<SharedProposalApprovalResponse>(
    response,
    "Nao foi possivel aprovar a proposta.",
  );
}

export function labelDeliveryStatus(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Pendente",
    SENT: "Enviado",
    DELIVERED: "Aberto",
    FAILED: "Falhou",
    CANCELED: "Cancelado",
  };

  return labels[status] || status;
}

export function labelDeliveryChannel(channel: DeliveryChannel) {
  const labels: Record<DeliveryChannel, string> = {
    EMAIL: "E-mail",
    WHATSAPP: "WhatsApp",
    WEBHOOK: "Webhook",
  };

  return labels[channel];
}

export function labelDeliveryDocumentType(type: DeliveryDocumentType) {
  const labels: Record<DeliveryDocumentType, string> = {
    PROPOSAL: "Proposta",
    CONTRACT: "Contrato",
    ORDER: "O.S.",
    SERVICE_REPORT: "Laudo tecnico",
  };

  return labels[type];
}
