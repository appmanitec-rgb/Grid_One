"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { DashboardDocumentCompany } from "@/lib/dashboard-documents";

const PRIMARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800";
const SECONDARY_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50";

function externalImageLoader({ src }: { src: string }) {
  return src;
}

export function PrintDocumentShell({
  company,
  title,
  subtitle,
  code,
  backHref = "/dashboard/documents",
  backLabel = "Voltar para documentos",
  sourceHref,
  sourceLabel,
  showPrintAction = true,
  actions,
  children,
}: {
  company: DashboardDocumentCompany;
  title: string;
  subtitle: string;
  code: string;
  backHref?: string;
  backLabel?: string;
  sourceHref?: string;
  sourceLabel?: string;
  showPrintAction?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="document-print-toolbar flex flex-wrap items-center gap-3">
        {showPrintAction ? (
          <button
            type="button"
            onClick={() => window.print()}
            className={PRIMARY_BUTTON}
          >
            Imprimir / salvar PDF
          </button>
        ) : null}
        {backHref ? <Link href={backHref} className={SECONDARY_BUTTON}>{backLabel}</Link> : null}
        {sourceHref && sourceLabel ? (
          <Link href={sourceHref} className={SECONDARY_BUTTON}>
            {sourceLabel}
          </Link>
        ) : null}
        {actions}
      </div>

      <article className="document-print-page overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_70px_-50px_rgba(15,23,42,0.34)]">
        <div
          className="h-2 w-full"
          style={{
            background:
              company.primaryColor ||
              "linear-gradient(135deg, #16324f 0%, #244e78 100%)",
          }}
        />
        <div className="space-y-8 px-6 py-6 md:px-8 md:py-8">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-6 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              {company.logoUrl ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2">
                  <Image
                    src={company.logoUrl}
                    alt={company.tradeName}
                    width={72}
                    height={72}
                    className="h-14 w-14 object-contain"
                    loader={externalImageLoader}
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-950 text-sm font-bold text-white">
                  {company.tradeName.slice(0, 2).toUpperCase()}
                </div>
              )}

              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">
                  Documento operacional
                </p>
                <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                  {title}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                  {subtitle}
                </p>
              </div>
            </div>

            <div className="grid gap-2 text-sm text-slate-600 md:min-w-[240px]">
              <InfoLine label="Codigo" value={code} />
              <InfoLine label="Empresa" value={company.tradeName} />
              <InfoLine label="CNPJ" value={company.cnpj || "-"} />
              <InfoLine
                label="Contato"
                value={company.email || company.phone || "-"}
              />
              <InfoLine
                label="Endereco"
                value={formatCompanyAddress(company) || "-"}
              />
            </div>
          </header>

          <div className="space-y-6">{children}</div>
        </div>
      </article>
    </div>
  );
}

export function PrintSection({
  title,
  children,
  columns = 1,
}: {
  title: string;
  children: ReactNode;
  columns?: 1 | 2 | 3;
}) {
  const gridClass =
    columns === 3
      ? "md:grid-cols-3"
      : columns === 2
        ? "md:grid-cols-2"
        : "md:grid-cols-1";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold uppercase tracking-[0.16em] text-slate-500">
          {title}
        </h2>
      </div>
      <div className={`grid gap-3 ${gridClass}`}>{children}</div>
    </section>
  );
}

export function ValueCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={`rounded-[24px] border px-4 py-4 ${
        tone === "accent"
          ? "border-slate-900 bg-slate-950 text-white"
          : "border-slate-200 bg-slate-50/85 text-slate-900"
      }`}
    >
      <p
        className={`text-[11px] font-bold uppercase tracking-[0.18em] ${
          tone === "accent" ? "text-slate-300" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      <div
        className={`mt-2 text-sm leading-6 ${
          tone === "accent" ? "text-white" : "text-slate-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export function PrintTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-[24px] border border-slate-200">
      <table className="w-full min-w-[640px] border-collapse bg-white text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-slate-500">
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function ToolbarPill({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
      {children}
    </span>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-800">{value}</p>
    </div>
  );
}

function formatCompanyAddress(company: DashboardDocumentCompany) {
  return [
    company.address,
    company.addressNumber,
    company.district,
    company.city,
    company.state,
    company.zipCode,
  ]
    .filter(Boolean)
    .join(" - ");
}
