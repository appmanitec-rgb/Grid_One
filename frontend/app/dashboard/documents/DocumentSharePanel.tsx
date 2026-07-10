"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearAuthSession } from "@/lib/auth-session";
import {
  cloneDeliveryTemplateMap,
  createDocumentDelivery,
  DEFAULT_DELIVERY_TEMPLATES,
  DELIVERY_CHANNEL_OPTIONS,
  fetchDeliveryPreferences,
  labelDeliveryChannel,
  renderDeliveryTemplate,
  type DeliveryComposerPreferences,
  type DeliveriesApiError,
  type DeliveryChannel,
  type DeliveryDocumentType,
} from "@/lib/document-deliveries";
import {
  DataPill,
  SelectInput,
  StatusBanner,
  TextAreaInput,
  TextInput,
} from "../components/DashboardPageKit";

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50";
const TEMPLATE_TOKENS = [
  "{documentLabel}",
  "{counterpartName}",
  "{shareUrl}",
  "{recipientName}",
];

export default function DocumentSharePanel({
  documentType,
  documentId,
  documentLabel,
  defaultRecipientName = "",
  defaultRecipientEmail = "",
  defaultRecipientPhone = "",
}: {
  documentType: DeliveryDocumentType;
  documentId: string;
  documentLabel: string;
  defaultRecipientName?: string;
  defaultRecipientEmail?: string;
  defaultRecipientPhone?: string;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState<DeliveryChannel>("EMAIL");
  const [recipientName, setRecipientName] = useState(defaultRecipientName);
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipientEmail);
  const [recipientPhone, setRecipientPhone] = useState(defaultRecipientPhone);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [working, setWorking] = useState(false);
  const [loadingPreferences, setLoadingPreferences] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [launchUrl, setLaunchUrl] = useState("");
  const [preferences, setPreferences] =
    useState<DeliveryComposerPreferences | null>(null);
  const lastAppliedTemplateRef = useRef({ subject: "", message: "" });

  const templateMap = useMemo(
    () =>
      preferences?.templates
        ? cloneDeliveryTemplateMap(preferences.templates)
        : DEFAULT_DELIVERY_TEMPLATES,
    [preferences?.templates],
  );
  const activeTemplate = templateMap[documentType][channel];

  const currentTarget = useMemo(() => {
    if (channel === "WHATSAPP") {
      return recipientPhone;
    }
    if (channel === "WEBHOOK") {
      return webhookUrl;
    }
    return recipientEmail;
  }, [channel, recipientEmail, recipientPhone, webhookUrl]);

  const actionLabel = useMemo(() => {
    if (channel === "WHATSAPP") return "Disparar WhatsApp";
    if (channel === "WEBHOOK") return "Disparar webhook";
    return "Enviar e-mail";
  }, [channel]);

  const recipientPlaceholder = useMemo(() => {
    if (channel === "WHATSAPP") return "+55 11 99999-0000";
    if (channel === "WEBHOOK") return "https://seu-endpoint.com/webhooks/documentos";
    return "email@destino.com";
  }, [channel]);

  const targetLabel = useMemo(() => {
    if (channel === "WHATSAPP") return "Numero do destinatario";
    if (channel === "WEBHOOK") return "URL do webhook";
    return "E-mail do destinatario";
  }, [channel]);

  const messagePlaceholder = useMemo(() => {
    if (channel === "WHATSAPP") {
      return "Ajuste o texto do WhatsApp ou reaplique o modelo padrao.";
    }
    if (channel === "WEBHOOK") {
      return "Observacao do payload ou nota de integracao.";
    }
    return "Corpo do e-mail com placeholders opcionais.";
  }, [channel]);

  const templateContext = useMemo(
    () => ({
      documentLabel,
      documentCode: documentLabel,
      counterpartName: defaultRecipientName || recipientName.trim() || "cliente",
      companyLabel: preferences?.companyLabel || "Manitec",
      shareUrl: shareUrl || "[link seguro]",
      recipientName: recipientName.trim() || defaultRecipientName || "cliente",
    }),
    [
      defaultRecipientName,
      documentLabel,
      preferences?.companyLabel,
      recipientName,
      shareUrl,
    ],
  );

  const suggestedSubject = useMemo(
    () =>
      renderDeliveryTemplate(
        activeTemplate.subject || `${documentLabel} - compartilhamento seguro`,
        templateContext,
      ),
    [activeTemplate.subject, documentLabel, templateContext],
  );

  const suggestedMessage = useMemo(
    () =>
      renderDeliveryTemplate(
        activeTemplate.message || "",
        templateContext,
      ),
    [activeTemplate.message, templateContext],
  );

  useEffect(() => {
    let active = true;

    async function loadPreferences() {
      try {
        const payload = await fetchDeliveryPreferences();
        if (!active) return;
        setPreferences(payload);
        setRecipientPhone((current) => current || payload.defaultWhatsapp || "");
        setWebhookUrl((current) => current || payload.defaultWebhookUrl || "");
      } catch (loadError: unknown) {
        const apiError = loadError as DeliveriesApiError;
        if (apiError?.status === 401) {
          clearAuthSession();
          router.replace("/");
          return;
        }

        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Nao foi possivel carregar os padroes de envio.",
          );
        }
      } finally {
        if (active) {
          setLoadingPreferences(false);
        }
      }
    }

    void loadPreferences();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    const previous = lastAppliedTemplateRef.current;
    const nextSubject = channel === "EMAIL" ? suggestedSubject : "";
    const nextMessage = suggestedMessage;

    setSubject((current) =>
      current.trim().length === 0 || current === previous.subject
        ? nextSubject
        : current,
    );
    setMessage((current) =>
      current.trim().length === 0 || current === previous.message
        ? nextMessage
        : current,
    );

    lastAppliedTemplateRef.current = {
      subject: nextSubject,
      message: nextMessage,
    };
  }, [channel, suggestedMessage, suggestedSubject]);

  function applyTemplate() {
    const nextSubject = channel === "EMAIL" ? suggestedSubject : "";
    setSubject(nextSubject);
    setMessage(suggestedMessage);
    lastAppliedTemplateRef.current = {
      subject: nextSubject,
      message: suggestedMessage,
    };
    setNotice("Modelo reaplicado com os dados atuais.");
  }

  async function handleShare() {
    if (!currentTarget.trim()) {
      setError(`Informe ${targetLabel.toLowerCase()}.`);
      setNotice("");
      return;
    }

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const payload = await createDocumentDelivery({
        channel,
        documentType,
        documentId,
        recipientTarget: currentTarget.trim(),
        recipientName:
          channel === "WEBHOOK" ? undefined : recipientName.trim() || undefined,
        subject: channel === "EMAIL" ? subject.trim() || undefined : undefined,
        message: message.trim() || undefined,
        expiresInDays: Number(expiresInDays),
      });

      setShareUrl(payload.shareUrl);
      setLaunchUrl(payload.launchUrl || "");
      setNotice(
        payload.note ||
          (payload.manualActionRequired
            ? "Link seguro gerado para envio manual."
            : "Documento compartilhado com sucesso."),
      );
    } catch (shareError: unknown) {
      const apiError = shareError as DeliveriesApiError;
      if (apiError?.status === 401) {
        clearAuthSession();
        router.replace("/");
        return;
      }

      setError(
        shareError instanceof Error
          ? shareError.message
          : "Erro ao compartilhar documento.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setNotice("Link seguro copiado para a area de transferencia.");
  }

  return (
    <section className="document-print-toolbar space-y-4 rounded-[28px] border border-slate-200 bg-white/92 p-5 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.24)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Compartilhar documento
          </p>
          <h3 className="mt-1 text-lg font-bold text-slate-950">
            Canal externo com link seguro
          </h3>
        </div>
        <Link href="/dashboard/deliveries" className={SECONDARY_BUTTON}>
          Historico de envios
        </Link>
      </div>

      {notice ? <StatusBanner tone="emerald">{notice}</StatusBanner> : null}
      {error ? <StatusBanner tone="rose">{error}</StatusBanner> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <SelectInput
          value={channel}
          onChange={(event) => setChannel(event.target.value as DeliveryChannel)}
        >
          {DELIVERY_CHANNEL_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {labelDeliveryChannel(option)}
            </option>
          ))}
        </SelectInput>

        <SelectInput
          value={expiresInDays}
          onChange={(event) => setExpiresInDays(event.target.value)}
        >
          <option value="3">Expira em 3 dias</option>
          <option value="7">Expira em 7 dias</option>
          <option value="15">Expira em 15 dias</option>
          <option value="30">Expira em 30 dias</option>
        </SelectInput>

        {channel !== "WEBHOOK" ? (
          <TextInput
            value={recipientName}
            onChange={(event) => setRecipientName(event.target.value)}
            placeholder="Nome do destinatario"
          />
        ) : (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
            <DataPill tone="blue">POST assinado</DataPill>
            O payload inclui metadados, link seguro e snapshot do documento.
          </div>
        )}

        <TextInput
          type={channel === "EMAIL" ? "email" : "text"}
          value={currentTarget}
          onChange={(event) => {
            if (channel === "WHATSAPP") {
              setRecipientPhone(event.target.value);
              return;
            }
            if (channel === "WEBHOOK") {
              setWebhookUrl(event.target.value);
              return;
            }
            setRecipientEmail(event.target.value);
          }}
          placeholder={recipientPlaceholder}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DataPill tone="slate">{labelDeliveryChannel(channel)}</DataPill>
        <span className="text-sm text-slate-600">{targetLabel}</span>
        <DataPill tone="blue">Modelo ativo</DataPill>
        <button
          type="button"
          onClick={applyTemplate}
          className="text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 transition hover:text-slate-950"
        >
          Reaplicar modelo
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DataPill tone={providerTone(channel, preferences)}>
          {providerLabel(channel, preferences, loadingPreferences)}
        </DataPill>
        {channel === "EMAIL" && preferences?.fromEmail ? (
          <span className="text-sm text-slate-600">
            Remetente:{" "}
            {preferences.senderName
              ? `${preferences.senderName} <${preferences.fromEmail}>`
              : preferences.fromEmail}
          </span>
        ) : null}
      </div>

      {channel === "EMAIL" ? (
        <TextInput
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          placeholder="Assunto do e-mail"
        />
      ) : null}

      <TextAreaInput
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={messagePlaceholder}
      />

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <DataPill tone="slate">Placeholders</DataPill>
          {TEMPLATE_TOKENS.map((token) => (
            <span
              key={token}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600"
            >
              {token}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleShare()}
          disabled={working}
          className={PRIMARY_BUTTON}
        >
          {working ? "Processando..." : actionLabel}
        </button>
        {shareUrl ? (
          <button
            type="button"
            onClick={() => void copyLink()}
            className={SECONDARY_BUTTON}
          >
            Copiar link seguro
          </button>
        ) : null}
        {launchUrl ? (
          <Link
            href={launchUrl}
            target="_blank"
            className={SECONDARY_BUTTON}
          >
            Abrir canal
          </Link>
        ) : null}
      </div>

      {shareUrl ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Link seguro gerado</p>
          <p className="mt-2 break-all">{shareUrl}</p>
        </div>
      ) : null}
    </section>
  );
}

function providerLabel(
  channel: DeliveryChannel,
  preferences: DeliveryComposerPreferences | null,
  loading: boolean,
) {
  if (loading) {
    return "Lendo configuracao";
  }

  if (channel === "EMAIL") {
    return preferences?.providerStatus.email
      ? "Provider oficial ativo"
      : "Sem provider oficial";
  }

  if (channel === "WHATSAPP") {
    return preferences?.providerStatus.whatsapp
      ? "Cloud API ativa"
      : "Abertura manual";
  }

  return preferences?.providerStatus.webhook
    ? "Entrega direta"
    : "Webhook indisponivel";
}

function providerTone(
  channel: DeliveryChannel,
  preferences: DeliveryComposerPreferences | null,
) {
  const active =
    channel === "EMAIL"
      ? preferences?.providerStatus.email
      : channel === "WHATSAPP"
        ? preferences?.providerStatus.whatsapp
        : preferences?.providerStatus.webhook;

  return active ? ("emerald" as const) : ("amber" as const);
}
