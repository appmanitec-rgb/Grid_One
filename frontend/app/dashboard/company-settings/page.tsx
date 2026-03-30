"use client";

import { FormEvent, InputHTMLAttributes, ReactNode, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type CompanyRecord = {
  id: string;
  companyName?: string | null;
  tradeName?: string | null;
  cnpj?: string | null;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  taxRegime?: string | null;
  contactName?: string | null;
  contactRole?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  billingEmail?: string | null;
  website?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  country?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  notes?: string | null;
  isPrimary: boolean;
  updatedAt: string;
};

type CompanyForm = {
  companyName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  municipalRegistration: string;
  taxRegime: string;
  contactName: string;
  contactRole: string;
  phone: string;
  whatsapp: string;
  email: string;
  billingEmail: string;
  website: string;
  address: string;
  addressNumber: string;
  addressComplement: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  notes: string;
  isPrimary: boolean;
};

const EMPTY_FORM: CompanyForm = {
  companyName: "",
  tradeName: "",
  cnpj: "",
  stateRegistration: "",
  municipalRegistration: "",
  taxRegime: "",
  contactName: "",
  contactRole: "",
  phone: "",
  whatsapp: "",
  email: "",
  billingEmail: "",
  website: "",
  address: "",
  addressNumber: "",
  addressComplement: "",
  district: "",
  city: "",
  state: "",
  zipCode: "",
  country: "Brasil",
  logoUrl: "",
  primaryColor: "#0f4c81",
  secondaryColor: "#f97316",
  notes: "",
  isPrimary: false,
};

const TAX_REGIMES = ["", "Simples Nacional", "Lucro Presumido", "Lucro Real", "MEI", "Isento"];

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits.length <= 10
    ? digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2")
    : digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}

function formatZipCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function toForm(company?: CompanyRecord | null): CompanyForm {
  if (!company) return { ...EMPTY_FORM };
  return {
    companyName: company.companyName ?? "",
    tradeName: company.tradeName ?? "",
    cnpj: formatCnpj(company.cnpj ?? ""),
    stateRegistration: company.stateRegistration ?? "",
    municipalRegistration: company.municipalRegistration ?? "",
    taxRegime: company.taxRegime ?? "",
    contactName: company.contactName ?? "",
    contactRole: company.contactRole ?? "",
    phone: formatPhone(company.phone ?? ""),
    whatsapp: formatPhone(company.whatsapp ?? ""),
    email: company.email ?? "",
    billingEmail: company.billingEmail ?? "",
    website: company.website ?? "",
    address: company.address ?? "",
    addressNumber: company.addressNumber ?? "",
    addressComplement: company.addressComplement ?? "",
    district: company.district ?? "",
    city: company.city ?? "",
    state: (company.state ?? "").toUpperCase(),
    zipCode: formatZipCode(company.zipCode ?? ""),
    country: company.country ?? "Brasil",
    logoUrl: company.logoUrl ?? "",
    primaryColor: company.primaryColor ?? EMPTY_FORM.primaryColor,
    secondaryColor: company.secondaryColor ?? EMPTY_FORM.secondaryColor,
    notes: company.notes ?? "",
    isPrimary: company.isPrimary,
  };
}

async function parseError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) return payload.message.join(" ") || fallback;
    return payload.message || fallback;
  } catch {
    return fallback;
  }
}

export default function CompanySettingsPage() {
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const selectedCompany = useMemo(() => companies.find((item) => item.id === selectedId) ?? null, [companies, selectedId]);

  async function loadCompanies(preferredId?: string) {
    setIsLoading(true);
    try {
      const response = await apiFetch("/company-settings/companies", { cache: "no-store" });
      if (!response.ok) throw new Error(await parseError(response, "Nao foi possivel carregar os cadastros."));
      const next = (await response.json()) as CompanyRecord[];
      const current = next.find((item) => item.id === preferredId) ?? next.find((item) => item.isPrimary) ?? next[0] ?? null;
      setCompanies(next);
      setSelectedId(current?.id ?? "");
      setForm(toForm(current));
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Nao foi possivel carregar os cadastros." });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
  }, []);

  function updateField<K extends keyof CompanyForm>(field: K, value: CompanyForm[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function createCompany() {
    setIsCreating(true);
    setFeedback(null);
    try {
      const response = await apiFetch("/company-settings/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: `Nova empresa ${companies.length + 1}`,
          country: form.country || EMPTY_FORM.country,
          primaryColor: form.primaryColor || EMPTY_FORM.primaryColor,
          secondaryColor: form.secondaryColor || EMPTY_FORM.secondaryColor,
        }),
      });
      if (!response.ok) throw new Error(await parseError(response, "Nao foi possivel criar um novo cadastro."));
      const created = (await response.json()) as CompanyRecord;
      await loadCompanies(created.id);
      setFeedback({ kind: "success", text: "Novo cadastro criado. Complete os campos e salve." });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Nao foi possivel criar um novo cadastro." });
    } finally {
      setIsCreating(false);
    }
  }

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    setIsSaving(true);
    setFeedback(null);
    try {
      const response = await apiFetch(`/company-settings/companies/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error(await parseError(response, "Falha ao salvar o cadastro."));
      const updated = (await response.json()) as CompanyRecord;
      await loadCompanies(updated.id);
      setFeedback({ kind: "success", text: "Cadastro salvo com sucesso." });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao salvar o cadastro." });
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteCompany() {
    if (!selectedCompany || companies.length <= 1) return;
    if (!window.confirm(`Excluir o cadastro de ${selectedCompany.tradeName || selectedCompany.companyName || "esta empresa"}?`)) return;
    setIsDeleting(true);
    setFeedback(null);
    try {
      const response = await apiFetch(`/company-settings/companies/${selectedCompany.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await parseError(response, "Nao foi possivel excluir o cadastro."));
      const nextId = companies.find((item) => item.id !== selectedCompany.id)?.id;
      await loadCompanies(nextId);
      setFeedback({ kind: "success", text: "Cadastro removido com sucesso." });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Nao foi possivel excluir o cadastro." });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <section className="rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(15,76,129,0.18),_transparent_38%),linear-gradient(135deg,#f8fafc_0%,#eef4ff_55%,#fff7ed_100%)] p-6 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.45)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-800">Multiempresa</span>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">Configuracoes da Empresa</h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">Agora o sistema aceita mais de um CNPJ. Cada empresa pode ter dados fiscais, contatos, endereco e identidade visual proprios.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Cadastros" value={String(companies.length || 0)} hint="Empresas ativas" />
            <Metric label="Principal" value={companies.find((item) => item.isPrimary)?.tradeName || companies.find((item) => item.isPrimary)?.companyName || "-"} hint="Empresa padrao" />
            <Metric label="Atualizacao" value={formatDate(selectedCompany?.updatedAt)} hint="Cadastro selecionado" />
          </div>
        </div>
      </section>

      {feedback ? <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${feedback.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{feedback.text}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-950">Cadastros de empresa</h2>
                <p className="mt-1 text-xs text-slate-500">Use um cadastro por CNPJ, filial ou unidade juridica.</p>
              </div>
              <button type="button" onClick={() => void createCompany()} disabled={isCreating} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{isCreating ? "Criando..." : "Nova"}</button>
            </div>
            <div className="mt-4 space-y-3">
              {isLoading ? Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />) : companies.map((item) => {
                const selected = item.id === selectedId;
                return (
                  <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setForm(toForm(item)); setFeedback(null); }} className={`w-full rounded-[24px] border p-4 text-left transition ${selected ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900 hover:bg-white"}`} style={selected ? { borderColor: item.primaryColor || "#0f4c81" } : undefined}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{item.tradeName || item.companyName || "Empresa sem nome"}</p>
                        <p className={`mt-1 truncate text-xs ${selected ? "text-slate-300" : "text-slate-500"}`}>{item.companyName || "Razao social pendente"}</p>
                      </div>
                      {item.isPrimary ? <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${selected ? "bg-white/10 text-white" : "bg-blue-100 text-blue-800"}`}>Principal</span> : null}
                    </div>
                    <div className={`mt-4 space-y-1 text-xs ${selected ? "text-slate-200" : "text-slate-500"}`}>
                      <p>CNPJ: {formatCnpj(item.cnpj || "") || "Nao informado"}</p>
                      <p>{[item.city, item.state].filter(Boolean).join(" / ") || "Localizacao nao definida"}</p>
                      <p>Atualizado em {formatDate(item.updatedAt)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <p className="text-sm font-bold">Boas praticas</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              <li>Cadastre matriz e filial separadamente.</li>
              <li>Marque a empresa principal para padroes do sistema.</li>
              <li>Preencha e-mail financeiro e inscricoes para faturamento.</li>
            </ul>
          </div>
        </aside>

        <form onSubmit={saveCompany} className="space-y-5">
          <section className="rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_60px_-40px_rgba(15,23,42,0.45)]">
            <div className="border-b border-slate-200 p-6" style={{ backgroundImage: `linear-gradient(135deg, ${(form.primaryColor || EMPTY_FORM.primaryColor)}16 0%, ${(form.secondaryColor || EMPTY_FORM.secondaryColor)}10 100%)` }}>
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/70 bg-white text-lg font-black text-slate-900 shadow-sm" style={{ color: form.primaryColor || EMPTY_FORM.primaryColor }}>
                    {form.logoUrl ? <img src={form.logoUrl} alt="Logo da empresa" className="h-full w-full object-cover" /> : (form.tradeName || form.companyName || "EM").slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-2xl font-black text-slate-950">{form.tradeName || form.companyName || "Cadastro de empresa"}</h2>
                      {form.isPrimary ? <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-800">Principal</span> : null}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{formatCnpj(form.cnpj) || "CNPJ nao informado"} • {form.email || "E-mail geral nao informado"}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={form.isPrimary} onChange={(event) => updateField("isPrimary", event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    Empresa principal
                  </label>
                  <button type="button" onClick={() => void deleteCompany()} disabled={companies.length <= 1 || isDeleting} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60">{isDeleting ? "Removendo..." : "Excluir"}</button>
                  <button type="submit" disabled={!selectedId || isSaving} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60">{isSaving ? "Salvando..." : "Salvar cadastro"}</button>
                </div>
              </div>
            </div>

            <div className="space-y-5 p-6">
              <Section title="Fiscal e cadastro" description="Dados juridicos e tributarios da empresa.">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Razao social" value={form.companyName} onChange={(value) => updateField("companyName", value)} placeholder="Manitec Energia e Servicos Ltda" />
                  <Field label="Nome fantasia" value={form.tradeName} onChange={(value) => updateField("tradeName", value)} placeholder="Manitec" />
                  <Field label="CNPJ" value={form.cnpj} onChange={(value) => updateField("cnpj", formatCnpj(value))} placeholder="00.000.000/0000-00" inputMode="numeric" />
                  <Field label="Inscricao estadual" value={form.stateRegistration} onChange={(value) => updateField("stateRegistration", value)} />
                  <Field label="Inscricao municipal" value={form.municipalRegistration} onChange={(value) => updateField("municipalRegistration", value)} />
                  <SelectField label="Regime tributario" value={form.taxRegime} onChange={(value) => updateField("taxRegime", value)} options={TAX_REGIMES} />
                </div>
              </Section>

              <Section title="Contatos" description="Responsavel, canais operacionais e contato financeiro.">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <Field label="Responsavel principal" value={form.contactName} onChange={(value) => updateField("contactName", value)} />
                  <Field label="Cargo" value={form.contactRole} onChange={(value) => updateField("contactRole", value)} />
                  <Field label="Telefone" value={form.phone} onChange={(value) => updateField("phone", formatPhone(value))} inputMode="tel" />
                  <Field label="WhatsApp" value={form.whatsapp} onChange={(value) => updateField("whatsapp", formatPhone(value))} inputMode="tel" />
                  <Field label="E-mail geral" type="email" value={form.email} onChange={(value) => updateField("email", value)} />
                  <Field label="E-mail financeiro" type="email" value={form.billingEmail} onChange={(value) => updateField("billingEmail", value)} />
                  <Field label="Website" type="url" value={form.website} onChange={(value) => updateField("website", value)} className="md:col-span-2 xl:col-span-3" />
                </div>
              </Section>

              <Section title="Endereco" description="Campos separados para melhorar fiscal, contratos e documentos.">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Logradouro" value={form.address} onChange={(value) => updateField("address", value)} className="md:col-span-2 xl:col-span-2" />
                  <Field label="Numero" value={form.addressNumber} onChange={(value) => updateField("addressNumber", value)} />
                  <Field label="Complemento" value={form.addressComplement} onChange={(value) => updateField("addressComplement", value)} />
                  <Field label="Bairro" value={form.district} onChange={(value) => updateField("district", value)} />
                  <Field label="Cidade" value={form.city} onChange={(value) => updateField("city", value)} />
                  <Field label="UF" value={form.state} onChange={(value) => updateField("state", value.toUpperCase().slice(0, 2))} maxLength={2} />
                  <Field label="CEP" value={form.zipCode} onChange={(value) => updateField("zipCode", formatZipCode(value))} inputMode="numeric" />
                  <Field label="Pais" value={form.country} onChange={(value) => updateField("country", value)} />
                </div>
              </Section>

              <Section title="Identidade visual" description="Logo e paleta de cores da empresa selecionada.">
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="URL da logo" type="url" value={form.logoUrl} onChange={(value) => updateField("logoUrl", value)} className="md:col-span-2" />
                    <ColorField label="Cor primaria" value={form.primaryColor} onChange={(value) => updateField("primaryColor", value)} />
                    <ColorField label="Cor secundaria" value={form.secondaryColor} onChange={(value) => updateField("secondaryColor", value)} />
                  </div>
                  <div className="rounded-[28px] border border-slate-200 p-5 text-white" style={{ backgroundImage: `linear-gradient(135deg, ${form.primaryColor || EMPTY_FORM.primaryColor} 0%, ${form.secondaryColor || EMPTY_FORM.secondaryColor} 100%)` }}>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/80">Preview</p>
                    <div className="mt-6 flex items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/40 bg-white/15 text-lg font-black">{form.logoUrl ? <img src={form.logoUrl} alt="Logo da empresa" className="h-full w-full object-cover" /> : (form.tradeName || form.companyName || "EM").slice(0, 2).toUpperCase()}</div>
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black">{form.tradeName || form.companyName || "Empresa"}</p>
                        <p className="truncate text-sm text-white/75">{form.companyName || "Razao social nao informada"}</p>
                      </div>
                    </div>
                    <div className="mt-6 space-y-2 text-sm text-white/80">
                      <p>{formatCnpj(form.cnpj) || "CNPJ nao informado"}</p>
                      <p>{form.email || "E-mail geral nao informado"}</p>
                      <p>{[form.city, form.state].filter(Boolean).join(" / ") || "Cidade e UF nao informadas"}</p>
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Observacoes internas" description="Anotacoes administrativas, fiscais e operacionais.">
                <label className="block text-sm font-semibold text-slate-700">
                  <span>Observacoes</span>
                  <textarea value={form.notes} onChange={(event) => updateField("notes", event.target.value)} rows={5} className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                </label>
              </Section>
            </div>
          </section>
        </form>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 min-h-[2.75rem] text-lg font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
      <div className="mb-5">
        <h3 className="text-lg font-black text-slate-950">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  maxLength,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block text-sm font-semibold text-slate-700 ${className}`}>
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} inputMode={inputMode} maxLength={maxLength} placeholder={placeholder} className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
        <option value="">Selecione</option>
        {options.filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      <span>{label}</span>
      <div className="mt-1.5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-transparent" />
        <input type="text" value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent text-sm text-slate-900 outline-none" />
      </div>
    </label>
  );
}
