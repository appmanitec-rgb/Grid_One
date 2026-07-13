"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { publicServiceReportGet } from "@/lib/service-reports";

type VerificationPayload = {
  valid: boolean;
  code: string;
  title: string;
  status: string;
  versionNumber: number;
  documentHash?: string | null;
  client?: { companyName?: string | null; tradeName?: string | null } | null;
  generator?: { name?: string | null; serialNumber?: string | null } | null;
  releasedToCustomerAt?: string | null;
  validationExpiresAt?: string | null;
  validationRevokedAt?: string | null;
};

export default function PublicServiceReportVerifyPage() {
  const params = useParams<{ token: string }>();
  const [payload, setPayload] = useState<VerificationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await publicServiceReportGet<VerificationPayload>(
          `/verify/${params.token}`,
        );
        if (active) setPayload(result);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Validação indisponível.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [params.token]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">
          Validação de laudo
        </p>
        {loading ? <State text="Validando documento..." /> : null}
        {error ? <State text={error} tone="error" /> : null}
        {payload ? (
          <div className="mt-4 space-y-4">
            <div
              className={`rounded-lg border px-4 py-3 text-sm font-bold ${
                payload.valid
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {payload.valid ? "Documento válido" : "Documento inválido ou revogado"}
            </div>
            <h1 className="text-2xl font-extrabold">{payload.code}</h1>
            <p className="text-slate-600">{payload.title}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <Info label="Cliente" value={payload.client?.tradeName || payload.client?.companyName} />
              <Info label="Equipamento" value={payload.generator?.name} />
              <Info label="Série" value={payload.generator?.serialNumber} />
              <Info label="Versão" value={String(payload.versionNumber || 1)} />
              <Info label="Status" value={payload.status} />
              <Info label="Liberado em" value={formatDate(payload.releasedToCustomerAt)} />
            </div>
            {payload.documentHash ? (
              <p className="break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                SHA-256: {payload.documentHash}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold">{value || "-"}</p>
    </div>
  );
}

function State({ text, tone }: { text: string; tone?: "error" }) {
  return (
    <p
      className={`mt-4 rounded-lg border p-3 text-sm font-semibold ${
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
    >
      {text}
    </p>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
