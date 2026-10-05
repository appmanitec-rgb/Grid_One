"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getAccessFromToken } from "@/lib/access";
import { apiFetch, readApiErrorMessage } from "@/lib/api";
import { SectionCard } from "../../components/DashboardPageKit";

type Issuer = { id: string; companyName: string | null; cnpj: string | null };
type Certificate = {
  issuerCompanyId: string;
  subjectName: string;
  serialNumber: string;
  fingerprintSha256: string;
  validFrom: string;
  validTo: string;
  installedAt: string;
  daysRemaining: number;
  status: "VALID" | "EXPIRING" | "CRITICAL" | "EXPIRED" | "MISMATCH";
};
type CertificateStatus = { storageConfigured: boolean; certificates: Certificate[] };

const date = (value: string) => new Date(value).toLocaleDateString("pt-BR");

export default function FiscalCertificateManager({
  issuers,
  onInstalled,
}: {
  issuers: Issuer[];
  onInstalled: () => Promise<void>;
}) {
  const [status, setStatus] = useState<CertificateStatus | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyIssuerId, setBusyIssuerId] = useState("");
  const [uploadOriginAllowed, setUploadOriginAllowed] = useState(false);
  const canManage = getAccessFromToken().settings.admin;

  useEffect(() => {
    setUploadOriginAllowed(
      window.location.protocol === "https:" ||
      ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname),
    );
  }, []);

  const reload = useCallback(async () => {
    const response = await apiFetch("/finance/fiscal-documents/certificates", { cache: "no-store" });
    if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível consultar os certificados."));
    setStatus(await response.json() as CertificateStatus);
  }, []);

  useEffect(() => {
    void reload().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao consultar os certificados."));
  }, [reload]);

  async function install(event: React.FormEvent<HTMLFormElement>, issuer: Issuer) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    const file = body.get("file");
    if (!(file instanceof File) || !file.name) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("O arquivo A1 deve ter no máximo 2 MB.");
      return;
    }
    setBusyIssuerId(issuer.id);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch(`/finance/fiscal-documents/certificates/${issuer.id}`, {
        method: "POST",
        body,
      });
      if (!response.ok) throw new Error(await readApiErrorMessage(response, "Não foi possível instalar o certificado."));
      form.reset();
      await Promise.all([reload(), onInstalled()]);
      setNotice(`Certificado de ${issuer.companyName || "empresa"} instalado. Confira a validade extraída do arquivo.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao instalar o certificado.");
    } finally {
      setBusyIssuerId("");
    }
  }

  return <SectionCard title="Certificados A1 dos emitentes" description="Instale um arquivo .pfx ou .p12 por CNPJ. O sistema confere a senha, o titular e o vencimento antes de guardar o arquivo criptografado.">
    {error && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {status && !status.storageConfigured && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">O cofre de certificados ainda precisa ser configurado no servidor. Peça ao administrador para preparar a chave de proteção antes do envio.</p>}
    {canManage && !uploadOriginAllowed && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Para proteger o arquivo A1 e sua senha durante o envio, abra esta página pelo localhost no computador do servidor ou configure HTTPS para o acesso pela rede.</p>}
    {issuers.length === 0 && <p className="text-sm text-slate-600">Cadastre as empresas emitentes em <Link className="font-semibold text-blue-700 underline" href="/dashboard/company-settings">Configurações da empresa</Link> antes de instalar os certificados.</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      {issuers.map((issuer) => {
        const certificate = status?.certificates.find((item) => item.issuerCompanyId === issuer.id);
        const tone = !certificate ? "border-slate-200 bg-slate-50 text-slate-700" : certificate.status === "VALID" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950";
        const statusLabel = !certificate ? "Aguardando instalação" : certificate.status === "MISMATCH" ? "CNPJ divergente" : certificate.status === "EXPIRED" ? "Vencido" : certificate.status === "CRITICAL" ? "Vence em breve" : certificate.status === "EXPIRING" ? "Renovação próxima" : "Instalado · no prazo";
        return <div key={issuer.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-bold text-slate-950">{issuer.companyName || "Empresa sem nome"}</h3><p className="mt-1 text-xs text-slate-600">CNPJ: {issuer.cnpj || "Pendente"}</p>{!issuer.cnpj && <Link className="mt-1 inline-block text-xs font-semibold text-blue-700 underline" href="/dashboard/company-settings">Completar cadastro da empresa</Link>}</div>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>{statusLabel}</span>
          </div>
          {certificate ? <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-2">
            <p><span className="block text-xs font-semibold uppercase text-slate-500">Válido até</span><strong>{date(certificate.validTo)}</strong></p>
            <p><span className="block text-xs font-semibold uppercase text-slate-500">Prazo</span>{certificate.daysRemaining > 0 ? `${certificate.daysRemaining} dias restantes` : "Prazo vencido"}</p>
            <p className="sm:col-span-2"><span className="block text-xs font-semibold uppercase text-slate-500">Instalado em</span>{date(certificate.installedAt)}</p>
          </div> : <p className="mt-4 text-sm text-slate-600">O vencimento será lido do próprio arquivo quando ele for instalado.</p>}
          {canManage && <form className="mt-4 space-y-3 border-t border-slate-200 pt-4" onSubmit={(event) => void install(event, issuer)}>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Arquivo A1 (.pfx ou .p12)
              <input className="mt-1 block w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-800" type="file" name="file" accept=".pfx,.p12" required disabled={!uploadOriginAllowed || !status?.storageConfigured || !issuer.cnpj || !!busyIssuerId} />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Senha do arquivo
              <input className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800" type="password" name="password" autoComplete="off" required disabled={!uploadOriginAllowed || !status?.storageConfigured || !issuer.cnpj || !!busyIssuerId} />
            </label>
            <button type="submit" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={!uploadOriginAllowed || !status?.storageConfigured || !issuer.cnpj || !!busyIssuerId}>{busyIssuerId === issuer.id ? "Conferindo certificado..." : certificate ? "Substituir certificado" : "Instalar certificado"}</button>
          </form>}
        </div>;
      })}
    </div>
    <p className="mt-4 text-xs text-slate-500">A senha e o arquivo não podem ser consultados ou baixados pela tela. A instalação do A1 não libera a emissão de notas enquanto a integração fiscal não for homologada.</p>
  </SectionCard>;
}
